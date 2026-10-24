import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({ db: null as any, fund: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  tenantStore: { run: (_user: string, fn: () => unknown) => fn() },
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  fetchWithTimeout: vi.fn(),
}));
vi.mock("../src/lib/agent-tool-dispatch", () => ({ dispatchAgentToolCall: vi.fn() }));
vi.mock("../src/lib/agent-runtime", () => ({
  complianceFirstMessagePrefix: vi.fn(),
  formatCallbackNumberForSpeech: vi.fn(),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/mobile-push", () => ({ notifyInboundCall: vi.fn() }));
vi.mock("../src/lib/outbound-call-purpose", () => ({ isMarketingCallPurpose: () => false }));
vi.mock("../src/lib/outbound-status", () => ({ LEAD_STATUS: {} }));
vi.mock("../src/lib/post-call-digest", () => ({
  enqueuePostCallDigest: async () => ({ jobId: "recovery" }),
}));
vi.mock("../src/lib/error-reporter", () => ({ reportError: vi.fn() }));
vi.mock("../src/lib/tcpa-consent", () => ({
  buildConsentLedgerRow: vi.fn(),
  CONSENT_RULE_VERSION: "test",
  detectOptOut: vi.fn(),
  getConsentRuleForPhone: vi.fn(),
}));
vi.mock("../src/lib/call-dnc-suppression", () => ({ persistTranscriptDncSuppression: vi.fn() }));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: vi.fn() }));
vi.mock("../src/lib/voice-call-funding", () => ({
  reserveVoiceCallFunding: h.fund,
  getVoiceCallFunding: async () => null,
  releaseVoiceCallFunding: vi.fn(),
  releaseVoiceCallFundingInTransaction: vi.fn(),
}));
vi.mock("../src/lib/realtime-spend-reservation", () => ({
  reconcileOpenAISipDurationSpend: vi.fn(),
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  extendCommittedPlatformCostReservation: vi.fn(),
}));
vi.mock("../src/lib/voice/openai-phone-agent-runtime", () => ({
  buildOpenAIRealtimeAgentRuntime: vi.fn(),
}));
vi.mock("../src/lib/voice/ai-disclosure-evidence", () => ({
  AI_DISCLOSURE_EVENTS: [],
  classifyAiDisclosureEvidence: vi.fn(),
  firstAgentTranscript: vi.fn(),
}));

import { claimOpenAISipCall } from "../src/lib/voice/openai-sip-session";
import { twilioFallbackStore } from "../src/lib/voice/twilio-fallback-store";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const call = {
  userId,
  agentId: "bot",
  callId: "sip-first",
  inboundTwilioCallSid: `CA${"1".repeat(32)}`,
  callerNumber: "+13125550101",
  calledNumber: "+13125550102",
};
const fallback = {
  userId,
  agentId: "bot",
  parentCallSid: `CA${"2".repeat(32)}`,
  callerNumber: call.callerNumber,
  calledNumber: call.calledNumber,
  fallbackNumber: "+13125550103",
  maxSeconds: 3600,
  leaseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  leaseExpiresAt: "2099-01-01T00:00:00.000Z",
};

/**
 * Transactions run concurrently. Only the actual source's advisory-lock SQL
 * serializes them; a test-wide transaction mutex would conceal this regression.
 */
function database(initialPresence: number, interleave = true) {
  const rows = new Map<string, any[]>([
    [
      "wireline_signal_presence",
      Array.from({ length: initialPresence }, (_, index) => ({
        id: `existing-${index}`,
        userId,
        label: "Live",
        startedAt: new Date(),
      })),
    ],
    ["wireline_phone_numbers", [{ userId, agentId: "bot", phoneNumber: call.calledNumber }]],
    ["wireline_call_logs", []],
    ["wireline_audit_log", []],
    ["wireline_jobs", []],
    ["wireline_subscriptions", [{ userId, plan: "starter" }]],
  ]);
  const locks = new Map<string, Promise<void>>();
  const lockKeys: string[] = [];
  const counts: number[] = [];
  let nextId = 1n;
  let capacityAttempts = 0;
  let bothAttempted!: () => void;
  const secondAttempt = new Promise<void>((resolve) => {
    bothAttempted = resolve;
  });
  const dialect = new PgDialect();
  const db = {
    transaction: async (fn: (tx: any) => unknown) => {
      const staged: Array<{ table: string; value: any }> = [];
      const release: Array<() => void> = [];
      const visible = (table: string) => [
        ...(rows.get(table) ?? []),
        ...staged.filter((entry) => entry.table === table).map((entry) => entry.value),
      ];
      const query = (operation: string, table?: string) => {
        let filter: any;
        let value: any;
        const q: any = {
          from: (source: any) => {
            table = getTableName(source);
            return q;
          },
          where: (predicate: any) => {
            filter = dialect.sqlToQuery(predicate);
            return q;
          },
          limit: () => q,
          for: () => q,
          onConflictDoNothing: () => q,
          returning: () => q,
          values: (input: any) => {
            value = input;
            return q;
          },
          set: (input: any) => {
            value = input;
            return q;
          },
          then: (resolve: (result: any[]) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve()
              .then(() => {
                if (operation === "insert") {
                  const saved = { id: nextId++, ...value };
                  staged.push({ table: table!, value: saved });
                  return [saved];
                }
                if (table === "wireline_signal_presence") {
                  const live = visible(table).filter(
                    (row) => row.userId === filter.params[0],
                  ).length;
                  counts.push(live);
                  return [{ live: String(live) }];
                }
                if (table === "wireline_call_logs") {
                  return visible(table).filter(
                    (row) =>
                      filter.params.includes(row.id) ||
                      filter.params.includes(row.vapiCallId) ||
                      (row.openaiSipSourceId && filter.params.includes(row.openaiSipSourceId)),
                  );
                }
                return visible(table!);
              })
              .then(resolve, reject),
        };
        return q;
      };
      const tx = {
        select: () => query("select"),
        insert: (table: any) => query("insert", getTableName(table)),
        update: (table: any) => query("update", getTableName(table)),
        execute: async (sql: any) => {
          const statement = dialect.sqlToQuery(sql);
          const key = String(statement.params[0]);
          lockKeys.push(key);
          // Shared advisory locks never wait for one another.
          if (statement.sql.includes("pg_advisory_xact_lock_shared")) return [];
          const prior = locks.get(key) ?? Promise.resolve();
          let unlock!: () => void;
          const held = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          locks.set(
            key,
            prior.then(() => held),
          );
          if (key.startsWith("inbound-capacity:")) {
            capacityAttempts += 1;
            if (capacityAttempts === 2) bothAttempted();
          }
          await prior;
          release.push(unlock);
          if (interleave && key.startsWith("inbound-capacity:") && capacityAttempts === 1) {
            await secondAttempt;
          }
          return [];
        },
      };
      try {
        const result = await fn(tx);
        for (const entry of staged) rows.get(entry.table)!.push(entry.value);
        return result;
      } finally {
        release.reverse().forEach((unlock) => unlock());
      }
    },
  };
  h.db = db;
  return { rows, counts, lockKeys };
}

beforeEach(() => {
  h.fund.mockReset().mockResolvedValue(null);
  delete process.env.WIRELINE_INBOUND_CONCURRENT_CALL_CEILING;
});

describe("atomic inbound capacity across provider paths", () => {
  it("returns the funding receipt from the same tenant capacity transaction", async () => {
    database(0, false);
    const funding = { maxSeconds: 2400, deadlineAtMs: 1800000000000 };
    h.fund.mockResolvedValue(funding);
    const result = await claimOpenAISipCall({
      ...call,
      admission: { mode: "take_message", reason: "after_hours" },
    });
    expect(result).toMatchObject({ resumed: false, funding });
    expect(h.fund).toHaveBeenCalledWith(expect.anything(), {
      userId,
      providerCallId: `openai:${call.callId}`,
      maxSeconds: 300,
    });
  });
  it("admits only one of concurrent SIP and human fallback when one tenant slot remains", async () => {
    const d = database(9);
    const results = await Promise.allSettled([
      claimOpenAISipCall(call),
      twilioFallbackStore.claim(fallback),
    ]);
    const admitted = results.filter(
      (result) => result.status === "fulfilled" && result.value !== null,
    );
    expect(admitted).toHaveLength(1);
    const refused = results.find((result) => !admitted.includes(result));
    if (refused?.status === "rejected")
      expect(refused.reason.code).toBe("VOICE_CONCURRENCY_EXCEEDED");
    else expect(refused?.value).toBeNull();
    expect(d.counts).toEqual([9, 10]);
    expect(d.lockKeys.filter((key) => key === `inbound-capacity:${userId}`)).toHaveLength(2);
    expect(d.rows.get("wireline_signal_presence")).toHaveLength(10);
    expect(d.rows.get("wireline_call_logs")).toHaveLength(1);
  });

  it("refuses a new SIP call for a Bot that is being deleted, before any row or spend", async () => {
    const d = database(0, false);
    d.rows.set("wireline_account_operation_leases", [
      {
        id: "hold",
        userId,
        operation: "bot_deletion:bot",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    await expect(claimOpenAISipCall(call)).rejects.toMatchObject({ code: "BOT_BEING_DELETED" });
    expect(h.fund).not.toHaveBeenCalled();
    expect(d.rows.get("wireline_call_logs")).toHaveLength(0);
    expect(d.rows.get("wireline_signal_presence")).toHaveLength(0);
    expect(d.lockKeys).toContain("bot-admission:bot");
  });

  it("also enforces a tenant ceiling below the global worker limit for concurrent SIP calls", async () => {
    const d = database(0);
    d.rows.set("wireline_subscriptions", [{ userId, plan: "voice" }]);
    const results = await Promise.allSettled([
      claimOpenAISipCall(call),
      claimOpenAISipCall({
        ...call,
        callId: "sip-second",
        inboundTwilioCallSid: `CA${"3".repeat(32)}`,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "VOICE_CONCURRENCY_EXCEEDED" },
    });
    expect(d.counts).toEqual([0, 1]);
    expect(d.rows.get("wireline_signal_presence")).toHaveLength(1);
  });

  it.each([false, true])(
    "does not spend another slot for exact SIP replay (expired=%s)",
    async (expired) => {
      const d = database(10, false);
      d.rows.get("wireline_call_logs")!.push({
        id: 1n,
        userId,
        agentId: call.agentId,
        vapiCallId: `openai:${call.callId}`,
        providerCallId: `openai:${call.callId}`,
        openaiSipSourceId: `twilio:${call.inboundTwilioCallSid}`,
        sourceId: `twilio:${call.inboundTwilioCallSid}`,
        phase: "running",
        ownerToken: "owner",
        leaseExpiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)),
        leaseExpired: expired,
      });
      const result = await claimOpenAISipCall(call);
      if (expired) expect(result).toMatchObject({ callLogId: 1n, resumed: true });
      else expect(result).toBeNull();
      expect(d.counts).toEqual([]);
      expect(d.rows.get("wireline_signal_presence")).toHaveLength(10);
    },
  );
});
