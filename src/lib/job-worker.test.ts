import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobRow } from "./job-queue";
import * as jobQueue from "./job-queue";
import * as claudeBrain from "./claude-brain";
import * as geminiBrain from "./gemini-brain";
import { handleJob, initJobWorker } from "./job-worker";

const m = vi.hoisted(() => {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const extractActions = vi.fn();
  const executeAction = vi.fn().mockResolvedValue({ success: true });
  const processAllCampaigns = vi.fn().mockResolvedValue(undefined);
  const enqueue = vi.fn().mockResolvedValue({ ok: true, jobId: "queued" });
  const drizzle = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    execute: vi.fn(),
  };
  return { log, extractActions, executeAction, processAllCampaigns, enqueue, drizzle };
});

vi.mock("./server-context", () => ({
  log: m.log,
  quotaTracker: {
    checkAndIncrement: vi.fn().mockResolvedValue(undefined),
  },
  auditLogger: {
    logAccountDeletion: vi.fn().mockResolvedValue(undefined),
  },
  drizzle: m.drizzle,
}));

vi.mock("./claude-brain", () => ({
  isClaudeAvailable: vi.fn(() => true),
  withAuditCapture: vi.fn(async (fn: () => Promise<unknown>) => {
    const result = await fn();
    return { result, records: [] };
  }),
  postCallAnalysis: vi.fn().mockResolvedValue({
    lead_score: 50,
    intent_label: "support",
    sentiment: "neutral",
    coaching_note: "ok",
    lesson: "",
  }),
  extractActions: m.extractActions,
  synthesizeLesson: vi.fn().mockResolvedValue(""),
}));

vi.mock("./gemini-brain", () => ({
  postCallAnalysis: vi.fn().mockResolvedValue({
    lead_score: 10,
    intent_label: "info",
    sentiment: "neutral",
    coaching_note: "",
    lesson: "",
  }),
}));

vi.mock("./job-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./job-queue")>();
  return { ...actual, enqueue: m.enqueue };
});

vi.mock("./action-engine", () => ({
  executeAction: m.executeAction,
}));

vi.mock("../middleware/audit-middleware", () => ({
  persistClaudeAuditRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./webhook-helpers", () => ({
  buildCallCompletedOutcome: vi.fn(() => ({ customer_number: "+1" })),
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./crm-service", () => ({
  CRMService: vi.fn().mockImplementation(() => ({
    logCall: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock("./apollo-service", () => ({
  enrichLead: vi.fn(),
  searchLeads: vi.fn(),
}));

vi.mock("./account-deletion", () => ({
  purgeAccount: vi.fn(),
}));

vi.mock("../services/campaign-dialer", () => ({
  CampaignDialerService: class {
    processAllCampaigns = m.processAllCampaigns;
  },
}));

function minimalJob(overrides: Partial<JobRow> & Pick<JobRow, "type">): JobRow {
  return {
    id: "job-id",
    user_id: "user-id",
    type: overrides.type,
    payload: overrides.payload ?? {},
    status: "running",
    attempts: 1,
    max_attempts: 5,
    run_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("job-worker · initJobWorker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns null when running on Vercel (VERCEL=1)", () => {
    vi.stubEnv("VERCEL", "1");
    expect(initJobWorker()).toBeNull();
  });

  it("starts the Postgres worker with the global handleJob dispatcher", () => {
    vi.stubEnv("VERCEL", "0");
    const stop = vi.fn();
    const spy = vi.spyOn(jobQueue, "startWorker").mockReturnValue(stop);

    const result = initJobWorker();

    expect(spy).toHaveBeenCalledWith(
      m.drizzle,
      handleJob,
      expect.objectContaining({
        pollIntervalMs: 10_000,
        onError: expect.any(Function),
      }),
    );
    expect(result).toBe(stop);
  });
});

describe("job-worker · handleJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.extractActions.mockReset();
    m.executeAction.mockReset();
    m.processAllCampaigns.mockReset();
    m.enqueue.mockReset();
    m.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
    m.drizzle.execute.mockReset();
    m.drizzle.select.mockReset();
    m.drizzle.from.mockReset();
    m.drizzle.where.mockReset();
    m.drizzle.limit.mockReset();
    m.drizzle.orderBy.mockReset();
    m.drizzle.update.mockReset();
    m.drizzle.set.mockReset();
    m.drizzle.insert.mockReset();
    m.drizzle.values.mockReset();
  });

  it("execute_action: runs executeAction when payload matches ActionItemSchema", async () => {
    const action = {
      type: "notify_slack" as const,
      priority: "high" as const,
      payload: { message: "hello" },
    };
    const job = minimalJob({
      type: "execute_action",
      payload: {
        userId: "user-1",
        action,
        context: { sourceId: "call-1", sourceType: "phone_call" },
      },
    });

    await handleJob(job);

    expect(m.executeAction).toHaveBeenCalledTimes(1);
    expect(m.executeAction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ type: "notify_slack" }),
      { sourceId: "call-1", sourceType: "phone_call" },
    );
  });

  it("execute_action: rejects invalid actions without touching executeAction", async () => {
    const job = minimalJob({
      type: "execute_action",
      payload: {
        userId: "user-1",
        action: { type: "not_a_real_action", priority: "high", payload: {} },
        context: { sourceId: "s", sourceType: "phone_call" },
      },
    });

    await handleJob(job);

    expect(m.executeAction).not.toHaveBeenCalled();
    expect(m.log.error).toHaveBeenCalledWith(
      "Invalid action payload",
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("v2a_action_extraction: enqueues one execute_action job per extracted action", async () => {
    const a1 = {
      type: "notify_slack" as const,
      priority: "medium" as const,
      payload: { message: "a" },
    };
    const a2 = {
      type: "notify_slack" as const,
      priority: "low" as const,
      payload: { message: "b" },
    };
    m.extractActions.mockResolvedValue([a1, a2]);

    const job = minimalJob({
      type: "v2a_action_extraction",
      payload: {
        userId: "u42",
        callId: "call-99",
        transcript: "t",
        summary: "s",
      },
    });

    await handleJob(job);

    expect(m.extractActions).toHaveBeenCalledWith({
      transcript: "t",
      summary: "s",
      customerNumber: undefined,
    });
    expect(m.enqueue).toHaveBeenCalledTimes(2);
    expect(m.enqueue).toHaveBeenCalledWith(
      m.drizzle,
      expect.objectContaining({
        userId: "u42",
        type: "execute_action",
        payload: expect.objectContaining({
          userId: "u42",
          action: a1,
          context: { sourceId: "call-99", sourceType: "phone_call" },
        }),
      }),
    );
    expect(m.log.info).toHaveBeenCalledWith(
      "V2A extraction complete",
      expect.objectContaining({ actionsCount: 2 }),
    );
  });

  it("purge_old_data: warns and returns when user_id is missing", async () => {
    const job = minimalJob({
      type: "purge_old_data",
      payload: { retention_days: 30 },
    });

    await handleJob(job);

    expect(m.log.warn).toHaveBeenCalledWith(
      "purge_old_data job missing user_id",
      expect.objectContaining({ jobId: "job-id" }),
    );
    expect(m.drizzle.execute).not.toHaveBeenCalled();
  });

  it("purge_old_data: invokes SQL purge RPC with default retention when valid", async () => {
    m.drizzle.execute.mockResolvedValue({ rows: [] });
    const job = minimalJob({
      type: "purge_old_data",
      payload: { user_id: "tenant-1" },
    });

    await handleJob(job);

    expect(m.drizzle.execute).toHaveBeenCalledTimes(1);
    const arg = m.drizzle.execute.mock.calls[0][0] as { queryChunks?: unknown[] };
    const flattened = (arg.queryChunks ?? [])
      .map((chunk: any) =>
        Array.isArray(chunk?.value) ? chunk.value.join("") : typeof chunk === "string" ? chunk : "",
      )
      .join("");
    expect(flattened).toContain("wireline_purge_old_data");
    // With parameterized queries, values are passed as parameters, not in the SQL string
    // The retention_days default (365) is verified in the log assertion below
    expect(m.log.info).toHaveBeenCalledWith(
      "purge_old_data job completed",
      expect.objectContaining({ user_id: "tenant-1", retention_days: 365 }),
    );
  });

  it("campaign_dial: loads CampaignDialerService and processes campaigns for the user", async () => {
    const job = minimalJob({
      type: "campaign_dial",
      payload: { userId: "owner-7" },
    });

    await handleJob(job);

    expect(m.processAllCampaigns).toHaveBeenCalledTimes(1);
    expect(m.processAllCampaigns).toHaveBeenCalledWith("owner-7");
  });

  it("post_call_enrichment: uses Gemini when aiTier is starter", async () => {
    const geminiSpy = vi.spyOn(geminiBrain, "postCallAnalysis");
    const claudeSpy = vi.spyOn(claudeBrain, "postCallAnalysis");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ aiTier: "starter", crmType: null }]),
    };
    m.drizzle.select.mockReturnValue(selectChain);

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    m.drizzle.update.mockReturnValue(updateChain);

    const selectLogChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ direction: "inbound", customerNumber: "+15550001111" }]),
    };
    m.drizzle.select.mockReturnValueOnce(selectChain).mockReturnValue(selectLogChain);

    const job = minimalJob({
      type: "post_call_enrichment",
      payload: {
        agentId: "ag1",
        userId: "u1",
        callId: "call-xyz",
        transcript: "hello world",
        summary: "brief",
      },
    });

    await handleJob(job);

    expect(geminiSpy).toHaveBeenCalled();
    expect(claudeSpy).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        leadScore: 10,
        intentLabel: "info",
      }),
    );

    geminiSpy.mockRestore();
    claudeSpy.mockRestore();
  });

  it("post_call_enrichment: returns early when Claude is unavailable and tier is not starter", async () => {
    vi.spyOn(claudeBrain, "isClaudeAvailable").mockReturnValue(false);
    const claudeSpy = vi.spyOn(claudeBrain, "postCallAnalysis");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ aiTier: "pro", crmType: null }]),
    };
    m.drizzle.select.mockReturnValue(selectChain);

    await handleJob(
      minimalJob({
        type: "post_call_enrichment",
        payload: {
          agentId: "ag1",
          userId: "u1",
          callId: "call-early",
          transcript: "t",
          summary: "s",
        },
      }),
    );

    expect(claudeSpy).not.toHaveBeenCalled();
    claudeSpy.mockRestore();
  });

  it("adaptive_optimization: skips synthesizeLesson when no transcript is on the call row", async () => {
    const synth = vi.spyOn(claudeBrain, "synthesizeLesson");
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ transcript: null }]),
    };
    m.drizzle.select.mockReturnValue(chain);

    await handleJob(
      minimalJob({
        type: "adaptive_optimization",
        payload: {
          agentId: "a1",
          userId: "u1",
          callId: "call-db-id",
          score: 22,
          breakdown: {},
        },
      }),
    );

    expect(synth).not.toHaveBeenCalled();
    synth.mockRestore();
  });
});
