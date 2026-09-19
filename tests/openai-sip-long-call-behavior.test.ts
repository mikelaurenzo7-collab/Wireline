import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sockets: [] as Array<{
    emit: (event: string, ...args: unknown[]) => boolean;
    close: () => void;
    readyState: number;
  }>,
  sent: [] as Array<Record<string, any>>,
  writes: [] as Array<Record<string, any>>,
  account: vi.fn(),
  usage: vi.fn(),
  digest: vi.fn(),
  tool: vi.fn(),
  provider: vi.fn(),
  environment: vi.fn(),
  presenceStatus: "connected" as string | undefined,
  presenceUser: "tenant",
  presenceScopes: [] as unknown[],
  transactionTail: Promise.resolve() as Promise<unknown>,
}));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    constructor() {
      super();
      h.sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit("open");
      });
    }
    send(raw: string) {
      h.sent.push(JSON.parse(raw));
    }
    ping() {
      queueMicrotask(() => this.emit("pong"));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit("close", 1000, Buffer.from("finished"));
    }
    terminate() {
      this.close();
    }
  }
  return { default: Socket };
});
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  or: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  sql: () => "sql",
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, key) => (key === "__name" ? name : String(key)) });
  return {
    callLogs: table("calls"),
    signalPresence: table("presence"),
    outboundLeads: table("leads"),
    consentLog: table("consent"),
    outboundPlacements: table("placements"),
  };
});
vi.mock("../src/lib/server-context", () => {
  const query = (operation = "select", table?: { __name: string }) => {
    let target = table?.__name;
    let values: Record<string, unknown> | undefined;
    let where: unknown;
    const requestedUser = (node: unknown): string | undefined => {
      if (!Array.isArray(node)) return undefined;
      if (node[0] === "userId") return String(node[1]);
      return node.map(requestedUser).find((value) => value !== undefined);
    };
    const chain: any = {
      from: (source: { __name: string }) => {
        target = source.__name;
        return chain;
      },
      where: (filter: unknown) => {
        where = filter;
        if (target === "presence") h.presenceScopes.push(filter);
        return chain;
      },
      limit: () => chain,
      for: () => chain,
      onConflictDoUpdate: () => chain,
      onConflictDoNothing: () => chain,
      set: (value: Record<string, unknown>) => {
        values = value;
        h.writes.push(value);
        return chain;
      },
      values: (value: Record<string, unknown>) => {
        values = value;
        h.writes.push(value);
        return chain;
      },
      returning: () => chain,
      then: (resolve: (rows: unknown[]) => void, reject?: (error: unknown) => void) =>
        Promise.resolve()
          .then(() => {
            if (target !== "presence") return [{ id: 1n, status: "connected" }];
            const user = requestedUser(where);
            if (user !== undefined && user !== h.presenceUser) return [];
            if (operation === "delete") h.presenceStatus = undefined;
            if (values?.status) h.presenceStatus = String(values.status);
            return h.presenceStatus ? [{ id: 1n, status: h.presenceStatus }] : [];
          })
          .then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: () => query(),
    insert: (table: { __name: string }) => query("insert", table),
    update: (table: { __name: string }) => query("update", table),
    delete: (table: { __name: string }) => query("delete", table),
    execute: vi.fn().mockResolvedValue(undefined),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      // Model the shared DB call-control lock across separately loaded runtimes.
      const result = h.transactionTail.then(() => fn(db));
      h.transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  return {
    drizzle: db,
    tenantStore: { run: (_id: string, fn: () => unknown) => fn() },
    fetchWithTimeout: h.provider,
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});
vi.mock("../src/lib/agent-tool-dispatch", () => ({ dispatchAgentToolCall: h.tool }));
vi.mock("../src/lib/agent-runtime", () => ({
  complianceFirstMessagePrefix: () => "I am an AI assistant. ",
  formatCallbackNumberForSpeech: () => "the business",
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: h.environment,
}));
vi.mock("../src/lib/mobile-push", () => ({
  notifyInboundCall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/outbound-call-purpose", () => ({ isMarketingCallPurpose: () => false }));
vi.mock("../src/lib/outbound-status", () => ({ LEAD_STATUS: {} }));
vi.mock("../src/lib/post-call-digest", () => ({ enqueuePostCallDigest: h.digest }));
vi.mock("../src/lib/error-reporter", () => ({ reportError: vi.fn() }));
vi.mock("../src/lib/tcpa-consent", () => ({
  buildConsentLedgerRow: vi.fn(),
  CONSENT_RULE_VERSION: "test",
  detectOptOut: () => ({ kind: "none" }),
  getConsentRuleForPhone: vi.fn(),
}));
vi.mock("../src/lib/call-dnc-suppression", () => ({ persistTranscriptDncSuppression: vi.fn() }));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: h.usage }));
vi.mock("../src/middleware/audit-middleware", () => ({
  extendCommittedPlatformCostReservation: h.account,
}));
vi.mock("../src/lib/realtime-spend-reservation", () => ({
  reconcileOpenAISipDurationSpend: vi.fn(),
}));
vi.mock("../src/lib/voice/openai-phone-agent-runtime", () => ({
  buildOpenAIRealtimeAgentRuntime: vi.fn(),
}));
vi.mock("../src/lib/voice/ai-disclosure-evidence", () => ({
  AI_DISCLOSURE_EVENTS: [],
  classifyAiDisclosureEvidence: vi.fn(),
  firstAgentTranscript: vi.fn(),
}));

import { runOpenAISipCallSession } from "../src/lib/voice/openai-sip-session";

const call = {
  callId: "rtc_test",
  userId: "tenant",
  agentId: "bot",
  callerNumber: "+12025550101",
  calledNumber: "+12025550102",
};
const runtime = {
  agentName: "Service Bot",
  greeting: "How can I help?",
  session: { type: "realtime", instructions: "Help the customer", tools: [] },
};
const claim = { callLogId: 1n, recoveryJobId: "job", ownerToken: "owner", resumed: false };
const reservation = { auditId: 1n, userId: "tenant", costUsd: 1, adopted: false };
const start = () => runOpenAISipCallSession(call, runtime as any, 1n, claim, reservation);
const emit = async (event: Record<string, unknown>) => {
  h.sockets[0].emit("message", Buffer.from(JSON.stringify(event)));
  await vi.advanceTimersByTimeAsync(0);
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  vi.stubEnv("OPENAI_API_KEY", "test-only-no-provider-calls");
  vi.stubEnv("OPENAI_SIP_MAX_CALL_SECONDS", "3600");
  h.sockets = [];
  h.sent = [];
  h.writes = [];
  h.account.mockReset().mockResolvedValue(undefined);
  h.usage.mockReset().mockResolvedValue(undefined);
  h.digest.mockReset().mockResolvedValue({ jobId: "job" });
  h.tool.mockReset().mockResolvedValue({ result: { answer: "approved" } });
  h.provider.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.environment.mockReset().mockResolvedValue(undefined);
  h.presenceStatus = "connected";
  h.presenceUser = "tenant";
  h.presenceScopes = [];
  h.transactionTail = Promise.resolve();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("long business-call lifecycle", () => {
  it("keeps tools, transcript, ownership leases and rolling spend alive for a full hour, then finalizes once", async () => {
    const session = start();
    await vi.advanceTimersByTimeAsync(0);
    await emit({ type: "output_audio_buffer.stopped" });
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.provider).not.toHaveBeenCalled();
    await emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "turn-late",
      transcript: "Please check the approved policy.",
    });
    await emit({
      type: "response.function_call_arguments.done",
      name: "search_agent_knowledge",
      call_id: "tool-late",
      arguments: '{"query":"policy"}',
    });
    await emit({ type: "response.done", response: { status: "completed" } });
    expect(h.tool).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(40 * 60_000);
    await session;
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.writes.filter((row) => row.openaiSipLeaseExpiresAt === "sql").length).toBeGreaterThan(
      100,
    );
    expect(h.account.mock.calls.at(-1)?.[1]).toBeGreaterThan(3300);
    expect(h.account.mock.calls.at(-1)?.[1]).toBeLessThanOrEqual(3600);
    expect(
      h.sent.some((event) => String(event.session?.instructions || "").includes("one minute")),
    ).toBe(true);
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 3600 }));
    expect(h.usage).toHaveBeenCalledOnce();
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 3600,
        transcript: expect.stringContaining("Please check the approved policy."),
        endedReason: "botbound-max-duration",
      }),
      expect.anything(),
      expect.objectContaining({ refreshPending: true }),
    );
  });
  it("does not bill database cleanup time after the provider call closes", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.account.mockImplementationOnce(() => held);
    const session = start();
    await vi.advanceTimersByTimeAsync(331_000);
    expect(h.account).toHaveBeenCalled();
    h.sockets[0].close();
    await vi.advanceTimersByTimeAsync(120_000);
    release();
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 331 }));
    expect(h.account.mock.calls.every(([, seconds]) => seconds <= 331)).toBe(true);
  });
  it("retries failed rolling accounting and keeps admitted speech live", async () => {
    h.account.mockRejectedValueOnce(new Error("temporary ledger failure"));
    const session = start();
    await vi.advanceTimersByTimeAsync(370_000);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.account).toHaveBeenCalledTimes(2);
    h.sockets[0].close();
    await session;
    expect(h.usage).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 370 }));
  });
});

async function remoteCallControl() {
  // A separate module instance has its own liveSipSessions map, as Vercel does.
  // Only the mocked database and provider boundary are shared with the worker.
  vi.resetModules();
  return import("../src/lib/voice/openai-sip-session");
}

function heldResult<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("cross-process SIP transfers", () => {
  it("observes a successful remote REFER, disarms the deadline and finalizes as transferred", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    remote.notifyOpenAISipCallTransferred(call.callId);
    expect(h.sockets[0].readyState).toBe(1);
    expect(h.presenceStatus).toBe("transferred");

    await vi.advanceTimersByTimeAsync(25_000);
    await session;
    expect(h.sockets[0].readyState).toBe(3);
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({ endedReason: "transferred" }),
      expect.anything(),
      expect.anything(),
    );
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toContain("/refer");
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.presenceScopes).toContainEqual([
      ["id", "openai:rtc_test"],
      ["userId", "tenant"],
    ]);
  });

  it("keeps provider failures live and never records a successful transfer", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.provider.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(
      remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
    ).rejects.toThrow("503");
    expect(h.presenceStatus).toBe("connected");
    expect(h.writes.some((value) => value.status === "transferred")).toBe(false);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(h.sockets[0].readyState).toBe(1);
    h.sockets[0].close();
    await session;
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({ endedReason: "provider-disconnected" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("retains transfer success when the provider closes sideband before returning REFER success", async () => {
    const remote = await remoteCallControl();
    const session = start();
    await vi.advanceTimersByTimeAsync(10_000);
    h.provider.mockImplementationOnce(async () => {
      h.sockets[0].close();
      return { ok: true, status: 200 };
    });
    await remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    await session;
    expect(h.digest).toHaveBeenCalledWith(
      expect.objectContaining({ endedReason: "transferred", durationSeconds: 10 }),
      expect.anything(),
      expect.anything(),
    );
    expect(h.presenceStatus).toBeUndefined();
    await expect(
      remote.referOpenAISipCall(call.userId, call.callId, "+12025550103"),
    ).rejects.toThrow("no longer active");
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it.each(["deadline", "runtime error"] as const)(
    "does not hang up a transfer whose success arrives while the %s waits",
    async (boundary) => {
      const remote = await remoteCallControl();
      const session = start();
      await vi.advanceTimersByTimeAsync(boundary === "deadline" ? 3_599_000 : 1_000);
      const provider = heldResult<{ ok: boolean; status: number }>();
      h.provider.mockImplementationOnce(() => provider.promise);
      const transfer = remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
      await vi.advanceTimersByTimeAsync(0);
      expect(h.provider).toHaveBeenCalledOnce();
      if (boundary === "runtime error") {
        h.sockets[0].emit("error", new Error("sideband disconnected during handoff"));
      }
      await vi.advanceTimersByTimeAsync(1_000);
      provider.resolve({ ok: true, status: 200 });
      await transfer;
      await vi.advanceTimersByTimeAsync(0);
      await session;
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.digest).toHaveBeenCalledWith(
        expect.objectContaining({ endedReason: "transferred" }),
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it("rechecks account policy after waiting for call-control ownership", async () => {
    const remote = await remoteCallControl();
    const lock = heldResult<void>();
    h.transactionTail = lock.promise;
    const transfer = remote.referOpenAISipCall(call.userId, call.callId, "+12025550103");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.environment).not.toHaveBeenCalled();
    h.environment.mockRejectedValue(new Error("Workspace was reclassified"));
    const rejection = expect(transfer).rejects.toThrow("reclassified");
    lock.resolve();
    await rejection;
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.presenceStatus).toBe("connected");
  });

  it("cannot publish a transfer signal for another tenant", async () => {
    const remote = await remoteCallControl();
    await expect(
      remote.referOpenAISipCall("other-tenant", call.callId, "+12025550103"),
    ).rejects.toThrow("no longer active");
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.presenceStatus).toBe("connected");
    expect(h.presenceScopes).toContainEqual([
      ["id", "openai:rtc_test"],
      ["userId", "other-tenant"],
    ]);
  });
});
