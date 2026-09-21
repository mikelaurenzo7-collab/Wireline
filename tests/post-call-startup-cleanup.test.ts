import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  progress: {} as Record<string, unknown>,
  checkpoints: [] as Record<string, unknown>[],
  replay: vi.fn(),
  environment: vi.fn(),
  launchGate: vi.fn(),
  email: vi.fn(),
  preferences: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => parts,
  eq: (...parts: unknown[]) => parts,
  sql: () => "sql",
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, key) => (key === "__name" ? name : String(key)) });
  return {
    callLogs: table("calls"),
    jobs: table("jobs"),
    agents: table("agents"),
    users: table("users"),
    deletionQueue: table("deletion"),
  };
});
vi.mock("../src/lib/server-context", () => {
  const query = (operation = "select", table?: { __name: string }) => {
    let name = table?.__name;
    let values: Record<string, unknown> = {};
    const chain: any = {
      from: (source: { __name: string }) => {
        name = source.__name;
        return chain;
      },
      where: () => chain,
      limit: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      returning: () => chain,
      set: (next: Record<string, unknown>) => {
        values = next;
        return chain;
      },
      then: (resolve: (value: unknown[]) => void) => {
        if (name === "jobs") {
          if (operation === "update") {
            h.progress = values.result as Record<string, unknown>;
            h.checkpoints.push(h.progress);
          }
          return Promise.resolve([{ id: "job", result: h.progress }]).then(resolve);
        }
        if (name !== "calls") throw new Error(`Unexpected ${operation} on ${name}`);
        return Promise.resolve([
          {
            id: 1n,
            agentId: "bot",
            direction: "inbound",
            durationSeconds: 0,
            endedReason: "pre-session-rejected",
            pipelineError: "spend_commit_failed",
            vapiCallId: "openai:rtc_test",
            summary: "Rejected before session startup.",
          },
        ]).then(resolve);
      },
    };
    return chain;
  };
  const db: any = {
    select: () => query(),
    update: (table: { __name: string }) => query("update", table),
    transaction: (perform: (tx: unknown) => Promise<unknown>) => perform(db),
  };
  return { drizzle: db, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});
vi.mock("../src/lib/account-deletion-fence", () => ({
  withAccountDeletionFence: (_tx: unknown, _user: string, perform: () => Promise<unknown>) =>
    perform(),
}));
vi.mock("../src/lib/action-engine", () => ({ executeAction: vi.fn() }));
vi.mock("../src/lib/crm-service", () => ({ CRMService: vi.fn() }));
vi.mock("../src/lib/email-service", () => ({ sendEmail: h.email }));
vi.mock("../src/lib/job-queue", () => ({ writeTransactionConfig: () => ({}) }));
vi.mock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: h.launchGate }));
vi.mock("../src/lib/post-call-output-preferences", () => ({
  getPostCallOutputPreferences: h.preferences,
  shouldGeneratePostCallArtifact: vi.fn(),
}));
vi.mock("../src/lib/sales-integration-policy", () => ({
  requiresSalesApprovalForIntegration: vi.fn(),
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
  recoverStaleOpenAISipCall: vi.fn(),
}));

import { handlePostCallDigestJob } from "../src/lib/post-call-digest";

const job = {
  id: "job",
  type: "post_call_digest",
  userId: "tenant",
  status: "running",
  attempts: 1,
  payload: {
    userId: "tenant",
    callLogId: "1",
    finalization: {
      provider: "openai_sip",
      callId: "rtc_test",
      openingPlaybackConfirmed: false,
      terminalStateReady: true,
      providerHangupRequired: true,
    },
  },
} as any;

beforeEach(() => {
  h.progress = {};
  h.checkpoints = [];
  h.replay.mockReset().mockResolvedValue(undefined);
  h.environment
    .mockReset()
    .mockRejectedValue(new Error("Startup cleanup must not run digest work"));
  h.launchGate.mockReset().mockReturnValue(true);
  h.email.mockReset();
  h.preferences.mockReset();
});

describe("pre-session provider cleanup jobs", () => {
  it("retries failed hangup and checkpoints only confirmed cleanup without customer notifications", async () => {
    h.replay.mockRejectedValueOnce(new Error("OpenAI hangup returned HTTP 503"));
    await expect(handlePostCallDigestJob(job)).rejects.toThrow("503");
    expect(h.checkpoints).toEqual([]);
    await expect(handlePostCallDigestJob({ ...job, attempts: 2 })).resolves.toBeUndefined();
    expect(h.replay).toHaveBeenCalledTimes(2);
    expect(h.progress).toEqual({ finalization: { state: "completed" } });
    expect(h.environment).not.toHaveBeenCalled();
    expect(h.launchGate).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
    expect(h.preferences).not.toHaveBeenCalled();
  });

  it("does not turn a completed cleanup checkpoint into a normal digest on retry", async () => {
    h.progress = { finalization: { state: "completed" } };
    await expect(handlePostCallDigestJob(job)).resolves.toBeUndefined();
    expect(h.replay).not.toHaveBeenCalled();
    expect(h.checkpoints).toEqual([]);
    expect(h.environment).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
  });
});
