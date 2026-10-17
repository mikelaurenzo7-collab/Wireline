import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const h = vi.hoisted(() => ({
  db: null as any,
  create: vi.fn(),
  fetch: vi.fn(),
  update: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  reserveSpend: vi.fn(),
  releaseSpend: vi.fn(),
  commitSpend: vi.fn(),
  ambiguousSpend: vi.fn(),
  gate: vi.fn(),
  live: vi.fn(),
  track: vi.fn(),
  jobs: [] as any[],
  client: null as any,
}));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  tenantStore: { run: (_user: string, fn: () => unknown) => fn() },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: h.live,
  assertExternalEntityActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/app-url", () => ({ getCanonicalAppUrl: () => "https://botbound.example" }));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: h.gate }));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async (input: any) => ({
    performed: true,
    result: await input.perform(),
  }),
}));
vi.mock("../src/lib/twilio-service", () => ({ getTwilioClient: () => h.client }));
vi.mock("../src/lib/voice-call-funding", () => ({
  reserveVoiceCallFunding: h.reserve,
  releaseVoiceCallFundingInTransaction: h.release,
}));
vi.mock("../src/lib/voice-usage", () => ({ trackVoiceMinutes: h.track }));
vi.mock("../src/lib/job-queue", () => ({
  enqueue: async (_tx: any, job: any) => {
    h.jobs.push(job);
    return { ok: true };
  },
}));
vi.mock("../src/lib/voice/outbound-call-service", () => ({
  isAmbiguousTwilioCallCreateError: (error: any) => !error.status || error.status >= 500,
}));
vi.mock("../src/lib/voice/openai-sip-config", async (original) => ({
  ...(await original<any>()),
  openAISipConfigured: () => true,
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: h.reserveSpend,
  releasePlatformCostReservation: h.releaseSpend,
  commitPlatformCostReservation: h.commitSpend,
  markPlatformCostReservationAmbiguous: h.ambiguousSpend,
}));
import {
  createPhoneTest,
  endPhoneTest,
  getPhoneTest,
  handlePhoneTestAnswer,
  handlePhoneTestStatus,
  normalizePhoneTestNumber,
  phoneTestCode,
  reconcilePhoneTest,
  reconcilePhoneTestJob,
} from "../src/lib/voice/phone-test";
import { issueOpenAIOutboundToken } from "../src/lib/voice/openai-outbound-token";
import { voicePhoneFingerprint } from "../src/lib/voice-call-identity";
import { adoptPhoneTestSipFunding } from "../src/lib/voice/phone-test-funding";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agentId = "agent-owned";
const requestKey = "12345678-1234-4234-8234-123456789012";
const phone = "+13125550123";
const from = "+13125550124";
const sid = `CA${"1".repeat(32)}`;
const canonical = `outbound:${requestKey}`;
const request = { userId, agentId, requestKey, phone };
function database() {
  const rows: Record<string, any[]> = {
    wireline_outbound_leads: [],
    wireline_credit_ledger: [],
    wireline_consent_log: [],
    wireline_call_logs: [],
    wireline_agents: [{ id: agentId, userId }],
    wireline_phone_numbers: [
      { id: "line", userId, agentId, phoneNumber: from, vapiNumberId: `PN${"2".repeat(32)}` },
    ],
  };
  const dialect = new PgDialect();
  const queries: string[] = [];
  const query = (operation: string, selection?: any, initialTable?: string) => {
    let table = initialTable!;
    let filter = { sql: "", params: [] as any[] };
    let values: any;
    const q: any = {
      from: (t: any) => {
        table = getTableName(t);
        return q;
      },
      where: (predicate: any) => {
        filter = dialect.sqlToQuery(predicate);
        return q;
      },
      limit: () => q,
      orderBy: () => q,
      returning: () => q,
      onConflictDoNothing: () => q,
      values: (input: any) => {
        values = input;
        return q;
      },
      set: (input: any) => {
        values = input;
        return q;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve()
          .then(() => {
            queries.push(`${operation}:${table}`);
            const all = rows[table];
            if (!all) throw new Error(`Unexpected table ${table}`);
            let matched = all.filter((row) => {
              if (!filter.params.length) return true;
              if (typeof filter.params[0] === "bigint") return row.id === filter.params[0];
              if (
                row.userId !== filter.params[0] &&
                !(typeof row.id === "bigint" && filter.params[0] === row.id)
              )
                return false;
              if (table === "wireline_credit_ledger")
                return filter.params.length === 1 || row.idempotencyKey === filter.params[1];
              if (table === "wireline_agents" || table === "wireline_phone_numbers")
                return (
                  !filter.params[1] ||
                  row.id === filter.params[1] ||
                  row.agentId === filter.params[1]
                );
              if (table === "wireline_outbound_leads") {
                if (filter.sql.includes('"idempotency_key"'))
                  return row.idempotencyKey === filter.params[1];
                if (filter.sql.includes('"source"'))
                  return (
                    row.source === filter.params[1] && row.createdAt >= new Date(filter.params[2])
                  );
                if (typeof filter.params[1] === "bigint") return row.id === filter.params[1];
              }
              return true;
            });
            if (operation === "insert") {
              const row = {
                id:
                  table === "wireline_outbound_leads"
                    ? BigInt(all.length + 1)
                    : String(all.length + 1),
                createdAt: new Date(),
                ...values,
              };
              if (row.vapiCallId && all.some((other) => other.vapiCallId === row.vapiCallId))
                return [];
              if (
                row.idempotencyKey &&
                all.some(
                  (other) =>
                    other.userId === row.userId && other.idempotencyKey === row.idempotencyKey,
                )
              )
                throw new Error("Duplicate receipt");
              all.push(row);
              return [row];
            }
            if (operation === "update") {
              matched.forEach((row) => Object.assign(row, values));
              return matched;
            }
            if (selection?.count) return [{ count: matched.length }];
            if (selection?.balance)
              return [
                { balance: String(matched.reduce((sum, row) => sum + Number(row.deltaUsd), 0)) },
              ];
            return matched;
          })
          .then(resolve, reject),
    };
    return q;
  };
  const db: any = {
    execute: vi.fn(async () => []),
    select: (selection: any) => query("select", selection),
    insert: (table: any) => query("insert", undefined, getTableName(table)),
    update: (table: any) => query("update", undefined, getTableName(table)),
    transaction: (fn: (tx: any) => unknown) => fn(db),
  };
  h.db = db;
  return {
    rows,
    queries,
    db,
    leads: rows.wireline_outbound_leads,
    ledger: rows.wireline_credit_ledger,
  };
}
let data: ReturnType<typeof database>;
function token() {
  return issueOpenAIOutboundToken({ leadId: data.leads[0].id, placementId: requestKey }).token;
}
function callback(extra: any = {}) {
  return { token: token(), callSid: sid, to: phone, from, ...extra };
}
function test() {
  return data.leads[0].metadata.native_voice.phone_test;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.jobs.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T18:00:00Z"));
  vi.stubEnv("INTERNAL_JWT_SECRET", "phone-test-unit-secret-never-used-in-production-123456");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_phone_test_only");
  data = database();
  h.gate.mockResolvedValue({ allowed: true });
  h.live.mockResolvedValue(undefined);
  h.track.mockResolvedValue(undefined);
  h.reserveSpend.mockResolvedValue({
    reserved: true,
    reservation: { auditId: 1n, userId, costUsd: 0.1, adopted: false },
  });
  h.reserve.mockImplementation(async (_tx: any, input: any) => {
    if (!data.ledger.some((row) => row.idempotencyKey === `voice_admission:${canonical}`))
      data.ledger.push({
        userId,
        idempotencyKey: `voice_admission:${canonical}`,
        refType: "voice_admission",
        refId: canonical,
        deltaUsd: "0",
        metadata: {
          phone_test_version: 1,
          agent_id: agentId,
          phone_fingerprint: voicePhoneFingerprint(phone),
          from_fingerprint: voicePhoneFingerprint(from),
          deadline_at_ms: Date.now() + 120_000,
        },
      });
    return { maxSeconds: input.maxSeconds, deadlineAtMs: Date.now() + 120_000 };
  });
  h.create.mockResolvedValue({ sid });
  h.fetch.mockResolvedValue({
    sid,
    accountSid: "ACunit",
    to: phone,
    from,
    direction: "outbound-api",
    status: "completed",
    duration: "70",
  });
  const calls: any = () => ({ fetch: h.fetch, update: h.update });
  calls.create = h.create;
  h.client = { calls, accountSid: "ACunit" };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("real self-phone test admission", () => {
  it("commits funding, recovery and the irreversible attempt before creating a bounded carrier parent", async () => {
    h.create.mockImplementation(async (params: any) => {
      expect(test().provider_attempted_at).toBeTruthy();
      expect(data.ledger.some((row) => row.idempotencyKey === `voice_admission:${canonical}`)).toBe(
        true,
      );
      expect(h.jobs[0]).toMatchObject({ type: "phone_test_reconcile", userId });
      expect(h.reserveSpend).toHaveBeenCalledOnce();
      expect(params).toMatchObject({ to: phone, from, timeout: 15, timeLimit: 90 });
      expect(params.machineDetection).toBeUndefined();
      expect(params.record).toBeUndefined();
      return { sid };
    });
    const response = await createPhoneTest(request);
    expect(response).toMatchObject({
      id: requestKey,
      agent_id: agentId,
      status: "ringing",
      phone_last4: "0123",
    });
    expect(response.verification_code).toMatch(/^\d{6}$/);
    expect(
      JSON.stringify(data.rows, (_key, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    ).not.toContain(response.verification_code);
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        isMarketingCall: false,
        requireFederalDncScreening: false,
        isRequestedCallback: true,
      }),
    );
  });
  it("returns the original result without redialing on an exact POST replay", async () => {
    await createPhoneTest(request);
    await createPhoneTest(request);
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.reserveSpend).toHaveBeenCalledOnce();
    await expect(createPhoneTest({ ...request, phone: "+13125550125" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("retains an ambiguous creation hold and never redials it", async () => {
    h.create.mockRejectedValue(new Error("timeout"));
    expect(await createPhoneTest(request)).toMatchObject({ status: "uncertain" });
    expect(await createPhoneTest(request)).toMatchObject({ status: "uncertain" });
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.ambiguousSpend).toHaveBeenCalledOnce();
  });
  it("releases only definite preaccept rejection", async () => {
    h.create.mockRejectedValue({ status: 400 });
    expect(await createPhoneTest(request)).toMatchObject({ status: "failed" });
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.releaseSpend).toHaveBeenCalledOnce();
  });
  it("keeps a known accepted carrier funded when post-accept accounting fails", async () => {
    h.commitSpend.mockRejectedValueOnce({ status: 400 });
    expect(await createPhoneTest(request)).toMatchObject({ status: "ringing" });
    expect(data.leads[0].callId).toBe(sid);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.releaseSpend).not.toHaveBeenCalled();
    expect(h.ambiguousSpend).toHaveBeenCalledOnce();
  });
  it("retries only binding the exact known SID after a transient correlation failure", async () => {
    h.create.mockImplementationOnce(async () => {
      const transaction = data.db.transaction;
      data.db.transaction = vi
        .fn()
        .mockRejectedValueOnce({ status: 400 })
        .mockImplementation(transaction);
      return { sid };
    });
    expect(await createPhoneTest(request)).toMatchObject({ status: "ringing" });
    expect(data.leads[0].callId).toBe(sid);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledOnce();
  });
  it("does not place a call when budget admission fails", async () => {
    h.reserveSpend.mockResolvedValue({ reserved: false, reason: "unavailable" });
    expect(await createPhoneTest(request)).toMatchObject({ status: "failed" });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });
  it("denies DNC, quiet-hours and unsupported international destinations before funding", async () => {
    h.gate.mockResolvedValue({ allowed: false, reason: "blocked_internal_dnc" });
    await expect(createPhoneTest(request)).rejects.toMatchObject({ status: 403 });
    h.gate.mockResolvedValue({ allowed: false, reason: "outside_permitted_calling_hours" });
    await expect(createPhoneTest(request)).rejects.toMatchObject({ status: 409 });
    expect(() => normalizePhoneTestNumber("+442071234567")).toThrow();
    expect(() => normalizePhoneTestNumber("+18765550123")).toThrow();
    expect(() => normalizePhoneTestNumber("+19005550123")).toThrow();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.reserve).not.toHaveBeenCalled();
  });
  it("fences DELETE before a delayed POST, without claiming a possible call was cancelled", async () => {
    expect(await endPhoneTest(userId, agentId, requestKey)).toMatchObject({ status: "cancelled" });
    expect(await createPhoneTest(request)).toMatchObject({ status: "cancelled" });
    expect(h.create).not.toHaveBeenCalled();
  });
  it("never uses GET as provider work or reveals another tenant/Bot receipt", async () => {
    await createPhoneTest(request);
    h.create.mockClear();
    expect(await getPhoneTest(userId, agentId, requestKey)).toMatchObject({ status: "ringing" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    await expect(getPhoneTest(userId, "other-agent", requestKey)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getPhoneTest("other-user", agentId, requestKey)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("same-carrier-call DTMF possession and consent", () => {
  it("announces AI and transcription and cannot bridge before the exact six-digit code", async () => {
    const response = await createPhoneTest(request);
    expect(await handlePhoneTestAnswer(callback())).toContain('<Gather input="dtmf" numDigits="6"');
    expect(await handlePhoneTestAnswer(callback())).toContain("AI bot");
    expect(await handlePhoneTestAnswer(callback())).toContain("transcribed");
    const wrong = await handlePhoneTestAnswer(callback({ digits: "wrong", attempt: 1 }), true);
    expect(wrong).toContain("<Gather");
    expect(wrong).not.toContain("<Sip>");
    const confirmed = await handlePhoneTestAnswer(
      callback({ digits: response.verification_code, attempt: 2 }),
      true,
    );
    expect(confirmed).toContain("<Sip>");
    expect(confirmed).toContain('timeLimit="120"');
    expect(data.ledger.filter((row) => row.refType === "voice_phone_test_verified")).toHaveLength(
      1,
    );
    expect((await getPhoneTest(userId, agentId, requestKey)).verification_code).toBeUndefined();
    expect(data.rows.wireline_consent_log.map((row) => row.event)).toContain(
      "self_phone_test_dtmf_confirmed",
    );
  });
  it("keeps Gather retries from consuming a second attempt", async () => {
    await createPhoneTest(request);
    await handlePhoneTestAnswer(callback());
    await handlePhoneTestAnswer(callback({ digits: "bad", attempt: 1 }), true);
    await handlePhoneTestAnswer(callback({ digits: "bad", attempt: 1 }), true);
    expect(test().attempts).toBe(1);
    expect(await handlePhoneTestAnswer(callback({ digits: "bad", attempt: 2 }), true)).toContain(
      "<Hangup/>",
    );
    expect(test()).toMatchObject({ attempts: 2, status: "ending", cancel_requested: true });
    expect(data.ledger.some((row) => row.refType === "voice_phone_test_verified")).toBe(false);
  });
  it("binds To, From, CallSid, tenant, expiry and Bot rather than trusting a code alone", async () => {
    const response = await createPhoneTest(request);
    await expect(
      handlePhoneTestAnswer(
        callback({ to: "+13125550125", digits: response.verification_code, attempt: 1 }),
        true,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handlePhoneTestAnswer(
        callback({
          callSid: `CA${"2".repeat(32)}`,
          digits: response.verification_code,
          attempt: 1,
        }),
        true,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(phoneTestCode({ ...request, agentId: "other-agent" })).not.toBe(
      response.verification_code,
    );
    vi.advanceTimersByTime(120_001);
    expect(
      await handlePhoneTestAnswer(
        callback({ digits: response.verification_code, attempt: 1 }),
        true,
      ),
    ).toContain("<Hangup/>");
    expect((await getPhoneTest(userId, agentId, requestKey)).status).toBe("uncertain");
  });
  it("requires immutable possession evidence before SIP can adopt the existing hold", async () => {
    const response = await createPhoneTest(request);
    const sip = {
      ...request,
      callId: "owned-sip",
      leadId: data.leads[0].id,
      direction: "outbound" as const,
      phoneTest: true as const,
      outboundPlacementId: requestKey,
      callerNumber: phone,
      calledNumber: from,
    };
    await expect(adoptPhoneTestSipFunding(data.db, sip)).rejects.toMatchObject({ status: 409 });
    await handlePhoneTestAnswer(callback({ digits: response.verification_code, attempt: 1 }), true);
    await expect(adoptPhoneTestSipFunding(data.db, sip)).resolves.toBeTruthy();
    await expect(
      adoptPhoneTestSipFunding(data.db, { ...sip, callId: "another-sip" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(data.ledger.filter((row) => row.refType === "voice_funding_alias")).toHaveLength(2);
  });
});

describe("authoritative carrier settlement and recovery", () => {
  it("settles verification and conversation against one canonical identity", async () => {
    await createPhoneTest(request);
    await handlePhoneTestStatus(callback({ status: "completed", duration: "70" }));
    await handlePhoneTestStatus(callback({ status: "completed", duration: "70" }));
    expect(data.ledger.filter((row) => row.refType === "voice_phone_test_terminal")).toHaveLength(
      1,
    );
    expect(h.track).toHaveBeenCalledWith({ userId, vapiCallId: canonical, durationSeconds: 70 });
    expect((await getPhoneTest(userId, agentId, requestKey)).status).toBe("failed");
    expect(data.rows.wireline_call_logs).toHaveLength(1);
    expect(data.rows.wireline_call_logs[0]).toMatchObject({
      userId,
      agentId,
      vapiCallId: canonical,
      durationSeconds: 70,
      recordingUrl: null,
      transcript: null,
    });
  });
  it("keeps End call pending when the carrier cannot confirm termination", async () => {
    await createPhoneTest(request);
    h.fetch.mockRejectedValue(new Error("network"));
    expect(await endPhoneTest(userId, agentId, requestKey)).toMatchObject({ status: "ending" });
    expect(h.track).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });
  it("confirms parent stop before exposing cancelled, then settles actual duration", async () => {
    await createPhoneTest(request);
    h.fetch
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACunit",
        to: phone,
        from,
        direction: "outbound-api",
        status: "in-progress",
      })
      .mockResolvedValueOnce({
        sid,
        accountSid: "ACunit",
        to: phone,
        from,
        direction: "outbound-api",
        status: "completed",
        duration: "10",
      });
    expect(await endPhoneTest(userId, agentId, requestKey)).toMatchObject({ status: "cancelled" });
    expect(h.update).toHaveBeenCalledWith({ status: "completed" });
    expect(h.track).toHaveBeenCalledWith({ userId, vapiCallId: canonical, durationSeconds: 10 });
  });
  it("will not infer an unknown accepted SID or refund an expired ambiguous attempt", async () => {
    h.create.mockRejectedValue(new Error("timeout"));
    await createPhoneTest(request);
    vi.advanceTimersByTime(121_000);
    await expect(reconcilePhoneTest(userId, agentId, requestKey)).rejects.toMatchObject({
      status: 503,
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });
  it("validates recovery ownership and rejects conflicting carrier identity", async () => {
    await createPhoneTest(request);
    await expect(
      reconcilePhoneTestJob({ userId, user_id: "other", payload: { requestKey, agentId } }),
    ).rejects.toThrow("identity");
    h.fetch.mockResolvedValue({
      sid,
      accountSid: "ACother",
      to: phone,
      from,
      direction: "outbound-api",
      status: "completed",
      duration: "10",
    });
    await expect(reconcilePhoneTest(userId, agentId, requestKey)).rejects.toMatchObject({
      status: 409,
    });
    expect(h.track).not.toHaveBeenCalled();
  });
});
