import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  jobs: new Map<string, Row>(),
  call: {} as Row,
  purgeDue: false,
  erased: false,
  replay: vi.fn(),
  recover: vi.fn(),
  email: vi.fn(),
  preferences: vi.fn(),
  environment: vi.fn(),
  checkpoints: [] as Row[],
  fences: 0,
}));
vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ["and", ...parts],
  eq: (...parts: unknown[]) => ["eq", ...parts],
  sql: () => ["sql"],
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === "__name" ? name : `${name}.${String(key)}`),
      },
    );
  return {
    callLogs: table("calls"),
    jobs: table("jobs"),
    agents: table("agents"),
    users: table("users"),
    deletionQueue: table("deletion"),
  };
});
vi.mock("../src/lib/server-context", () => {
  function matches(condition: unknown, row: Row): boolean {
    if (!Array.isArray(condition) || condition[0] === "sql") return true;
    if (condition[0] === "and") return condition.slice(1).every((part) => matches(part, row));
    if (condition[0] === "eq") return row[String(condition[1]).split(".")[1]] === condition[2];
    return true;
  }
  function query(
    operation = "select",
    source?: { __name: string },
    fields?: Record<string, string>,
  ) {
    let name = source?.__name;
    let condition: unknown;
    let values: Row = {};
    let deletionEligibility = false;
    const chain = {
      from: (table: { __name: string }) => {
        name = table.__name;
        return chain;
      },
      where: (value: unknown) => {
        condition = value;
        return chain;
      },
      limit: () => chain,
      for: () => chain,
      innerJoin: (table: { __name: string }) => {
        deletionEligibility ||= table.__name === "users";
        return chain;
      },
      leftJoin: () => chain,
      returning: () => chain,
      set: (next: Row) => {
        values = next;
        return chain;
      },
      then: (resolve: (value: unknown[]) => unknown) => {
        const rows =
          name === "jobs" ? [...h.jobs.values()] : name === "calls" && !h.erased ? [h.call] : [];
        const selected =
          deletionEligibility && h.purgeDue ? [] : rows.filter((row) => matches(condition, row));
        if (operation === "update") {
          for (const row of selected) {
            Object.assign(row, values);
            if (values.result) h.checkpoints.push(values.result as Row);
          }
        }
        return Promise.resolve(
          selected.map((row) =>
            fields
              ? Object.fromEntries(
                  Object.entries(fields).map(([alias, column]) => [
                    alias,
                    column === "agents.name" ? "Front Desk" : row[column.split(".")[1]],
                  ]),
                )
              : { ...row },
          ),
        ).then(resolve);
      },
    };
    return chain;
  }
  const db = {
    select: (fields?: Record<string, string>) => query("select", undefined, fields),
    update: (table: { __name: string }) => query("update", table),
    transaction: (perform: (tx: unknown) => Promise<unknown>): Promise<unknown> => perform(db),
  };
  return { drizzle: db, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});
vi.mock("../src/lib/account-deletion-fence", () => ({
  withAccountDeletionFence: (_tx: unknown, _user: string, perform: () => Promise<unknown>) => {
    h.fences++;
    return perform();
  },
}));
vi.mock("../src/lib/email-service", () => ({ sendEmail: h.email }));
vi.mock("../src/lib/job-queue", () => ({ writeTransactionConfig: () => ({}) }));
vi.mock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: () => true }));
vi.mock("../src/lib/post-call-output-preferences", () => ({
  getPostCallOutputPreferences: h.preferences,
  shouldGeneratePostCallArtifact: vi.fn(),
}));
vi.mock("../src/lib/shareable-artifact/publish-call-recap", () => ({
  maybePublishCallRecap: vi.fn(),
}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({ sanitizePhone: vi.fn() }));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
}));
vi.mock("../src/lib/webhook-helpers", () => ({ enqueueCallEscalatedWebhookOnce: vi.fn() }));
vi.mock("../src/lib/voice/openai-sip-session", () => ({
  replayOpenAISipPostCallFinalization: h.replay,
  recoverStaleOpenAISipCall: h.recover,
}));

import { handlePostCallFinalizationRecoveryJob } from "../src/lib/post-call-digest";
import {
  postCallFinalizationRecoveryId,
  POST_CALL_FINALIZATION_RECOVERY_TYPE,
} from "../src/lib/post-call-finalization-recovery";
import type { JobRow } from "../src/lib/job-queue";

const owner = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const childId = postCallFinalizationRecoveryId(owner, parentId);
function original() {
  return {
    id: parentId,
    userId: owner,
    type: "post_call_digest",
    status: "dead",
    attempts: 5,
    result: {},
    error: "original terminal failure",
    payload: {
      userId: owner,
      callLogId: "42",
      dialedNumber: "+13125550101",
      finalization: {
        provider: "openai_sip",
        callId: "rtc_example",
        openingPlaybackConfirmed: true,
        terminalStateReady: true,
        providerHangupRequired: true,
      },
    },
  };
}
function claimed() {
  return {
    id: childId,
    userId: owner,
    type: POST_CALL_FINALIZATION_RECOVERY_TYPE,
    status: "running",
    attempts: 1,
    result: {},
    payload: { criticalRecoveryOf: parentId },
  };
}
const run = () =>
  handlePostCallFinalizationRecoveryJob({ ...h.jobs.get(childId) } as unknown as JobRow);

beforeEach(() => {
  h.jobs = new Map([
    [parentId, original()],
    [childId, claimed()],
  ]);
  h.call = {
    id: 42n,
    userId: owner,
    agentId: "bot",
    customerNumber: "+13125550102",
    direction: "inbound",
    durationSeconds: 75,
    transcript: "Caller: Stop calling me.",
    summary: "Call ended.",
    endedReason: "provider-disconnected",
    vapiCallId: "openai:rtc_example",
    openaiSipPhase: "terminal",
    openaiSipOwnerToken: null,
    openaiSipLeaseExpiresAt: null,
  };
  h.purgeDue = false;
  h.erased = false;
  h.checkpoints = [];
  h.fences = 0;
  h.replay.mockReset().mockResolvedValue(undefined);
  h.recover.mockReset().mockImplementation(async () => {
    Object.assign(h.call, {
      endedReason: "finalization-recovery",
      openaiSipPhase: "terminal",
      openaiSipOwnerToken: null,
      openaiSipLeaseExpiresAt: null,
    });
  });
  h.environment.mockReset().mockRejectedValue(new Error("Optional provider work is forbidden"));
  h.email.mockReset();
  h.preferences.mockReset();
});

describe("critical-only dead digest recovery worker", () => {
  it("reuses mandatory settlement, writes an explicit receipt, and retains the dead original", async () => {
    await run();
    expect(h.fences).toBe(1);
    expect(h.replay).toHaveBeenCalledOnce();
    expect(h.replay).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: owner,
        callLogId: 42n,
        durationSeconds: 75,
        transcript: "Caller: Stop calling me.",
        finalization: expect.objectContaining({
          callId: "rtc_example",
          providerHangupRequired: true,
        }),
      }),
    );
    expect(h.jobs.get(parentId)).toMatchObject({
      status: "dead",
      error: "original terminal failure",
      attempts: 5,
    });
    expect(h.checkpoints.at(-1)).toMatchObject({
      finalization: { state: "completed" },
      criticalRecovery: {
        state: "completed",
        parentJobId: parentId,
        callLogId: "42",
        providerCallId: "openai:rtc_example",
        attempt: 1,
      },
    });
    expect(h.environment).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    expect(h.preferences).not.toHaveBeenCalled();
  });
  it("reuses a completed child receipt after a crash without replaying provider work", async () => {
    await run();
    h.jobs.get(childId)!.attempts = 2;
    await run();
    expect(h.replay).toHaveBeenCalledOnce();
  });
  it.each(["running", "pending", "done"])("rejects a parent that is now %s", async (status) => {
    h.jobs.get(parentId)!.status = status;
    await expect(run()).rejects.toThrow("matching unfinished dead digest");
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("rejects a child with extra caller-supplied authority", async () => {
    h.jobs.get(childId)!.payload = {
      criticalRecoveryOf: parentId,
      finalization: original().payload.finalization,
    };
    await expect(run()).rejects.toThrow("Invalid critical recovery job identity");
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("rejects a mismatched queue owner without consulting providers", async () => {
    h.jobs.get(childId)!.userId = "33333333-3333-4333-8333-333333333333";
    await expect(run()).rejects.toThrow();
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("rejects provider mismatch on the authoritative call before replay", async () => {
    h.call.vapiCallId = "openai:another_call";
    await expect(run()).rejects.toThrow("provider identity");
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("rejects a supposedly terminal call with a retained live owner", async () => {
    h.call.openaiSipOwnerToken = "still-owned";
    await expect(run()).rejects.toThrow("active ownership");
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("does not preempt a live lease through stale-call recovery", async () => {
    (
      h.jobs.get(parentId)!.payload as ReturnType<typeof original>["payload"]
    ).finalization.terminalStateReady = false;
    Object.assign(h.call, {
      endedReason: null,
      openaiSipPhase: "running",
      openaiSipOwnerToken: "owner",
      openaiSipLeaseExpiresAt: new Date(Date.now() + 60_000),
    });
    await expect(run()).rejects.toThrow("live owner");
    expect(h.recover).not.toHaveBeenCalled();
    expect(h.replay).not.toHaveBeenCalled();
  });
  it("uses the existing stale recovery only after lease expiry, then settles", async () => {
    (
      h.jobs.get(parentId)!.payload as ReturnType<typeof original>["payload"]
    ).finalization.terminalStateReady = false;
    Object.assign(h.call, {
      endedReason: null,
      openaiSipPhase: "running",
      openaiSipOwnerToken: "owner",
      openaiSipLeaseExpiresAt: new Date(Date.now() - 60_000),
    });
    await run();
    expect(h.recover).toHaveBeenCalledOnce();
    expect(h.replay).toHaveBeenCalledOnce();
  });
  it("resumes after partial stale recovery left the call terminal but parent metadata unchanged", async () => {
    (
      h.jobs.get(parentId)!.payload as ReturnType<typeof original>["payload"]
    ).finalization.terminalStateReady = false;
    Object.assign(h.call, {
      endedReason: null,
      openaiSipPhase: "running",
      openaiSipOwnerToken: "owner",
      openaiSipLeaseExpiresAt: new Date(Date.now() - 60_000),
    });
    h.replay.mockRejectedValueOnce(new Error("usage settlement temporarily unavailable"));
    await expect(run()).rejects.toThrow("usage settlement temporarily unavailable");
    expect(h.call).toMatchObject({
      openaiSipPhase: "terminal",
      openaiSipOwnerToken: null,
      openaiSipLeaseExpiresAt: null,
    });
    expect(h.checkpoints).toEqual([]);
    h.jobs.get(childId)!.attempts = 2;
    await run();
    expect(h.replay).toHaveBeenCalledTimes(2);
    expect(h.checkpoints.at(-1)).toMatchObject({
      criticalRecovery: { state: "completed", attempt: 2 },
    });
    expect(
      (h.jobs.get(parentId)!.payload as ReturnType<typeof original>["payload"]).finalization
        .terminalStateReady,
    ).toBe(false);
  });
  it("leaves unresolved termination/usage errors retryable without a success receipt", async () => {
    h.replay.mockRejectedValue(new Error("Carrier duration unavailable"));
    await expect(run()).rejects.toThrow("Carrier duration unavailable");
    expect(h.checkpoints).toEqual([]);
    expect(h.jobs.get(parentId)!.status).toBe("dead");
  });
  it("suppresses its success checkpoint after losing the running attempt", async () => {
    h.replay.mockImplementation(async () => {
      h.jobs.get(childId)!.attempts = 2;
    });
    await expect(run()).rejects.toThrow("attempt fence");
    expect(h.checkpoints).toEqual([]);
  });
  it("never performs provider work after terminal deletion becomes due", async () => {
    h.purgeDue = true;
    await run();
    expect(h.replay).not.toHaveBeenCalled();
    expect(h.checkpoints.at(-1)).toMatchObject({
      criticalRecovery: { state: "stopped", reason: "account_or_call_erased_or_purge_due" },
    });
  });
});
