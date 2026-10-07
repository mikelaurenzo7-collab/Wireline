import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { ComputerTaskEvent, ComputerTaskStatus } from "../../db/computer-task-schema";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import { recordAmbiguousProviderAttempt, recordUsage } from "../ai-audit";
import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "../ai-client";
import { AppError } from "../api-error";
import { getTenantChannelEntitlements } from "../channel-entitlements";
import { getPostgresErrorCode } from "../pg-errors";
import { isProductionDeployment } from "../deployment-environment";
import { runWithManagedAiSpend } from "../managed-ai-operation-spend";
import { getAgentCoachingBrief } from "../mcp-agent-coaching";
import { rateLimit } from "../rate-limit";
import { drizzle, log, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  CLOUD_COMPUTER_LIMITS,
  runCloudComputerAgent,
  type CloudComputerEvent,
  type CloudComputerOutcome,
} from "./agent";
import type { CloudBrowserSession } from "./browser-session";
import {
  cloudComputerClient,
  cloudComputerConnection,
  loadAnthropicSdk,
  type AnthropicSdk,
  cloudComputerModel,
  cloudComputerProcessCapacity,
  cloudComputerReadiness,
} from "./config";
import { displayUrl, parseNavigateTarget } from "./url-policy";

const MAX_EVENTS = 150;
const FRAME_RETENTION_MS = 30 * 60_000;
const STALE_AFTER_MS = 3 * 60_000;
// A live task touches its row well inside STALE_AFTER_MS, so a long model
// call or an owner question never reads as abandoned to another process.
const HEARTBEAT_MS = 60_000;
const ACTIVE_STATUSES: ComputerTaskStatus[] = ["running", "needs_input"];
const INTERRUPTED_SUMMARY = "This task was interrupted by a BotBound update. Start it again.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Cache reads cost a tenth of fresh input; a task replays its whole context
// every turn, so the daily token quota counts them at that ratio.
const CACHE_READ_QUOTA_WEIGHT = 0.1;

/**
 * Text bound for Postgres: text and jsonb columns reject NUL, and page-supplied
 * strings (button labels, tab titles) can carry any control character.
 */
function cleanText(value: string, max: number, keepNewlines = false): string {
  const stripped = keepNewlines
    ? // eslint-disable-next-line no-control-regex
      value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    : // eslint-disable-next-line no-control-regex
      value.replace(/[\u0000-\u001f\u007f]/g, " ");
  return stripped.slice(0, max);
}

type LiveTask = {
  taskId: string;
  userId: string;
  agentId: string;
  stop: boolean;
  frame: Buffer | null;
  frameAt: number;
  events: ComputerTaskEvent[];
  turns: number;
  actions: number;
  reply: ((value: string | null) => void) | null;
  finished: boolean;
};

const live = new Map<string, LiveTask>();
/** Accounts with a start in flight: one start per account, counted against capacity. */
const starting = new Set<string>();

function runningCount(): number {
  let count = 0;
  for (const task of live.values()) if (!task.finished) count += 1;
  return count;
}

function pruneFinished(now = Date.now()) {
  for (const [id, task] of live) {
    if (task.finished && now - task.frameAt > FRAME_RETENTION_MS) live.delete(id);
  }
}

export type ComputerTaskView = {
  id: string;
  agentId: string;
  goal: string;
  startUrl: string | null;
  status: ComputerTaskStatus;
  summary: string | null;
  question: string | null;
  sources: string[];
  events: ComputerTaskEvent[];
  errorCode: string | null;
  turnCount: number;
  actionCount: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  liveView: boolean;
};

type TaskRow = typeof schema.computerTasks.$inferSelect;

function toView(row: TaskRow): ComputerTaskView {
  const task = live.get(row.id);
  return {
    id: row.id,
    agentId: row.agentId,
    goal: row.goal,
    startUrl: row.startUrl,
    status: row.status,
    summary: row.summary,
    question: row.question,
    sources: Array.isArray(row.sources) ? row.sources : [],
    events: Array.isArray(row.events) ? row.events : [],
    errorCode: row.errorCode,
    turnCount: row.turnCount,
    actionCount: row.actionCount,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    liveView: Boolean(task && !task.finished && task.frame && task.userId === row.userId),
  };
}

export type ComputerStatus = {
  available: boolean;
  reason:
    | "ready"
    | "model_unconfigured"
    | "browser_unconfigured"
    | "storage_unavailable"
    | "plan_required";
  model: string;
  limits: { maxMinutes: number; maxSteps: number };
};

let storageReady = false;

/**
 * The task ledger ships in migration 0176, promoted separately from the code.
 * Until it exists the computer reports itself as being set up instead of
 * failing requests. A positive answer is cached for the life of the process.
 */
async function computerStorageReady(): Promise<boolean> {
  if (storageReady) return true;
  try {
    const result = (await drizzle.execute(
      sql`SELECT to_regclass('public.wireline_computer_tasks') IS NOT NULL AS ready`,
    )) as { rows?: Array<{ ready?: boolean }> } | Array<{ ready?: boolean }>;
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    storageReady = Boolean(rows[0]?.ready);
  } catch (error) {
    log.warn("Cloud computer storage check failed", { error: getErrorMessage(error) });
  }
  return storageReady;
}

function isMissingTable(error: unknown): boolean {
  return getPostgresErrorCode(error) === "42P01";
}

export async function getComputerStatus(userId: string): Promise<ComputerStatus> {
  const readiness = cloudComputerReadiness();
  const base = {
    model: cloudComputerModel(),
    limits: {
      maxMinutes: Math.round(CLOUD_COMPUTER_LIMITS.maxRunMs / 60_000),
      maxSteps: CLOUD_COMPUTER_LIMITS.maxTurns,
    },
  };
  if (!readiness.available) return { ...base, available: false, reason: readiness.reason };
  if (!(await computerStorageReady())) {
    return { ...base, available: false, reason: "storage_unavailable" };
  }
  const entitlement = await getTenantChannelEntitlements(userId);
  if (!entitlement.planId || !["active", "trialing"].includes(entitlement.subscriptionStatus)) {
    return { ...base, available: false, reason: "plan_required" };
  }
  return { ...base, available: true, reason: "ready" };
}

function parseStartInput(body: unknown): { goal: string; startUrl: string | null } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const goal = typeof record.goal === "string" ? cleanText(record.goal, 10_000, true).trim() : "";
  if (goal.length < 4) throw AppError.badRequest("Describe the task in a sentence or two.");
  if (goal.length > CLOUD_COMPUTER_LIMITS.goalChars) {
    throw AppError.badRequest(`Keep the task under ${CLOUD_COMPUTER_LIMITS.goalChars} characters.`);
  }
  let startUrl: string | null = null;
  if (typeof record.startUrl === "string" && record.startUrl.trim()) {
    const target = parseNavigateTarget(record.startUrl);
    if (target.kind !== "url") {
      throw AppError.badRequest(
        target.kind === "refused" ? target.reason : "Use a full web address for the start page.",
      );
    }
    startUrl = target.url.toString();
  }
  return { goal, startUrl };
}

async function enforceTaskLimits(userId: string): Promise<void> {
  if (
    isProductionDeployment() &&
    (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
  ) {
    throw AppError.serviceUnavailable("Cloud computer limits are unavailable. Try again shortly.");
  }
  for (const [bucket, windowMs, max] of [
    ["computer-task-hour", 60 * 60_000, 8],
    ["computer-task-day", 24 * 60 * 60_000, 25],
  ] as const) {
    const limit = await rateLimit(userId, { bucket, windowMs, max, failClosedOnError: true });
    if (!limit.allowed) {
      throw new AppError(
        429,
        "COMPUTER_TASK_RATE_LIMIT",
        "Your Bot has run its cloud computer a lot recently. Try again later.",
      );
    }
  }
}

export async function startComputerTask(
  userId: string,
  agentId: string,
  body: unknown,
): Promise<ComputerTaskView> {
  const { goal, startUrl } = parseStartInput(body);
  const readiness = cloudComputerReadiness();
  const connection = cloudComputerConnection();
  if (!readiness.available || !connection || !(await computerStorageReady())) {
    throw new AppError(
      503,
      "COMPUTER_UNAVAILABLE",
      "The cloud computer is not available yet. It turns on once BotBound finishes setting it up.",
    );
  }
  // Claim the account's start slot and a capacity slot synchronously, before
  // any await, so two simultaneous starts cannot both pass the checks below.
  if (starting.has(userId)) throw busyError();
  pruneFinished();
  if (runningCount() + starting.size >= cloudComputerProcessCapacity()) {
    throw new AppError(
      503,
      "COMPUTER_AT_CAPACITY",
      "Cloud computers are busy right now. Try again in a minute.",
    );
  }
  starting.add(userId);
  try {
    return await admitComputerTask(userId, agentId, goal, startUrl, connection);
  } finally {
    starting.delete(userId);
  }
}

function busyError(): AppError {
  return new AppError(
    409,
    "COMPUTER_BUSY",
    "Your Bot is already working on a computer task. Stop it or wait for it to finish.",
  );
}

async function admitComputerTask(
  userId: string,
  agentId: string,
  goal: string,
  startUrl: string | null,
  connection: NonNullable<ReturnType<typeof cloudComputerConnection>>,
): Promise<ComputerTaskView> {
  const brief = await getAgentCoachingBrief(userId, agentId);
  const entitlement = await getTenantChannelEntitlements(userId);
  if (!entitlement.planId || !["active", "trialing"].includes(entitlement.subscriptionStatus)) {
    throw new AppError(
      402,
      "COMPUTER_PLAN_REQUIRED",
      "An active paid plan gives your Bot its cloud computer.",
      { recovery_path: "/settings/billing" },
    );
  }
  await assertLiveExternalActionAllowed(userId, "computer.browse");

  const busy = await drizzle
    .select({ id: schema.computerTasks.id, updatedAt: schema.computerTasks.updatedAt })
    .from(schema.computerTasks)
    .where(
      and(
        eq(schema.computerTasks.userId, userId),
        inArray(schema.computerTasks.status, ACTIVE_STATUSES),
      ),
    );
  const cutoff = Date.now() - STALE_AFTER_MS;
  // A heartbeat-fresh row may belong to another process; only a row this
  // process knows finished, or one whose heartbeat stopped, frees the account.
  if (
    busy.some((row) =>
      live.has(row.id) ? !live.get(row.id)?.finished : row.updatedAt.getTime() >= cutoff,
    )
  ) {
    throw busyError();
  }
  await enforceTaskLimits(userId);

  const model = cloudComputerModel();
  // A row whose heartbeat stopped is a task that died with its process; settle
  // it so the one-active-task index does not hold the account forever.
  await drizzle
    .update(schema.computerTasks)
    .set({
      status: "interrupted",
      summary: INTERRUPTED_SUMMARY,
      question: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.computerTasks.userId, userId),
        inArray(schema.computerTasks.status, ACTIVE_STATUSES),
        lt(schema.computerTasks.updatedAt, new Date(cutoff)),
      ),
    );
  let row: TaskRow | undefined;
  try {
    [row] = await drizzle
      .insert(schema.computerTasks)
      .values({ userId, agentId: brief.agent_id, goal, startUrl, status: "running", model })
      .returning();
  } catch (error) {
    // The partial unique index is the cross-process guard for one active task.
    if (getPostgresErrorCode(error) === "23505") throw busyError();
    throw error;
  }
  if (!row) throw AppError.fromHttpStatus(500, "The task could not be created.");

  const task: LiveTask = {
    taskId: row.id,
    userId,
    agentId: brief.agent_id,
    stop: false,
    frame: null,
    frameAt: Date.now(),
    events: [],
    turns: 0,
    actions: 0,
    reply: null,
    finished: false,
  };
  live.set(row.id, task);

  const bot = {
    name: brief.agent_name,
    role: brief.role,
    facts: brief.training_facts.map((fact) => fact.content),
    rules: brief.operating_rules.map((rule) => rule.content),
  };
  void tenantStore
    .run(userId, () => executeTask(task, { goal, startUrl, model, bot, connection }))
    .catch((error) => {
      log.error("Cloud computer task crashed", { taskId: row.id, error: getErrorMessage(error) });
    });
  return toView(row);
}

/**
 * Writes only while the row is still active. The row is the cross-process stop
 * signal: when Stop lands on another process (or the row was settled), the
 * update matches nothing and this executor stops at its next checkpoint.
 */
async function persist(task: LiveTask, patch: Partial<typeof schema.computerTasks.$inferInsert>) {
  try {
    const updated = await drizzle
      .update(schema.computerTasks)
      .set({
        events: task.events,
        turnCount: task.turns,
        actionCount: task.actions,
        updatedAt: new Date(),
        ...patch,
      })
      .where(
        and(
          eq(schema.computerTasks.id, task.taskId),
          eq(schema.computerTasks.userId, task.userId),
          inArray(schema.computerTasks.status, ACTIVE_STATUSES),
        ),
      )
      .returning({ id: schema.computerTasks.id });
    if (!updated.length && !task.finished) {
      task.stop = true;
      task.reply?.(null);
    }
  } catch (error) {
    log.error("Cloud computer task update failed", {
      taskId: task.taskId,
      error: getErrorMessage(error),
    });
  }
}

function pushEvent(task: LiveTask, event: CloudComputerEvent) {
  const url = event.url ? cleanText(displayUrl(event.url), 500) : "";
  task.events.push({
    at: new Date().toISOString(),
    kind: event.kind,
    text: cleanText(event.text, 400),
    ...(url ? { url } : {}),
    ...(typeof event.ok === "boolean" ? { ok: event.ok } : {}),
  });
  if (task.events.length > MAX_EVENTS) task.events.splice(0, task.events.length - MAX_EVENTS);
}

function failureOutcome(error: unknown, sdk: AnthropicSdk | null): CloudComputerOutcome {
  if (error instanceof AppError) {
    return { status: "failed", code: error.code || "COMPUTER_FAILED", summary: error.message };
  }
  if (error instanceof DefiniteProviderRejectionError) {
    return {
      status: "failed",
      code: "COMPUTER_MODEL_REJECTED",
      summary: "The AI provider rejected this request. Try rephrasing the task.",
    };
  }
  if (error instanceof RuntimeUnavailableError || (sdk && error instanceof sdk.default.APIError)) {
    return {
      status: "failed",
      code: "COMPUTER_MODEL_UNAVAILABLE",
      summary: "The AI model is unavailable right now. Try again in a few minutes.",
    };
  }
  return {
    status: "failed",
    code: "COMPUTER_FAILED",
    summary: "The cloud computer stopped unexpectedly. Try again.",
  };
}

async function executeTask(
  task: LiveTask,
  input: {
    goal: string;
    startUrl: string | null;
    model: string;
    bot: { name: string; role: string; facts: string[]; rules: string[] };
    connection: NonNullable<ReturnType<typeof cloudComputerConnection>>;
  },
): Promise<void> {
  let session: CloudBrowserSession | null = null;
  let sdk: AnthropicSdk | null = null;
  let outcome: CloudComputerOutcome;
  const taskHash = createHash("sha256").update(task.taskId).digest("hex").slice(0, 24);
  const heartbeat = setInterval(() => void persist(task, {}), HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    sdk = await loadAnthropicSdk();
    const { default: Anthropic } = sdk;
    const client = await cloudComputerClient();
    try {
      // Playwright loads with the first task, never on an API cold start.
      const { CloudBrowserSession } = await import("./browser-session");
      session = await CloudBrowserSession.open(input.connection);
    } catch (error) {
      log.error("Cloud browser connection failed", {
        taskId: task.taskId,
        error: getErrorMessage(error),
      });
      throw new AppError(
        503,
        "COMPUTER_BROWSER_UNAVAILABLE",
        "The cloud computer could not start a browser. Try again in a few minutes.",
      );
    }
    if (input.startUrl) {
      const opened = await session.execute("navigate", { url: input.startUrl });
      pushEvent(task, {
        kind: opened.ok ? "action" : "error",
        text: opened.activity,
        url: session.activeUrl(),
        ok: opened.ok,
      });
      const frame = await session.frame();
      if (frame) {
        task.frame = frame;
        task.frameAt = Date.now();
      }
      await persist(task, {});
    }
    const activeSession = session;
    outcome = await runCloudComputerAgent({
      client,
      model: input.model,
      session: activeSession,
      bot: input.bot,
      goal: input.goal,
      startUrl: input.startUrl,
      hooks: {
        emit: async (event) => {
          if (event.kind === "action" || event.kind === "error") task.actions += 1;
          pushEvent(task, event);
          await persist(task, {});
        },
        frame: (jpeg) => {
          task.frame = jpeg;
          task.frameAt = Date.now();
        },
        stopRequested: () => task.stop,
        askOwner: async (question) => {
          // Stop pressed during the model call: do not park on a new question.
          if (task.stop) return null;
          await persist(task, { status: "needs_input", question: cleanText(question, 300) });
          if (task.stop) return null;
          const reply = await new Promise<string | null>((resolve) => {
            const timer = setTimeout(() => {
              task.reply = null;
              resolve(null);
            }, CLOUD_COMPUTER_LIMITS.ownerReplyWaitMs);
            task.reply = (value) => {
              clearTimeout(timer);
              task.reply = null;
              resolve(value);
            };
          });
          await persist(task, { status: "running", question: null });
          return reply;
        },
        meter: async ({ reserveUsd, turn, operation }) => {
          task.turns = turn;
          // Each provider attempt is its own reservation: the SDK never retries
          // behind the meter, and a transient overload gets one metered retry.
          const attempt = (retry: number) =>
            runWithManagedAiSpend({
              userId: task.userId,
              action: "computer.browse",
              model: input.model,
              reserveUsd,
              cacheReadQuotaWeight: CACHE_READ_QUOTA_WEIGHT,
              requestMeta: { agent_id: task.agentId, task_hash: taskHash, turn, retry },
              operation: async () => {
                try {
                  return await operation();
                } catch (error) {
                  if (
                    error instanceof Anthropic.APIConnectionError ||
                    error instanceof Anthropic.APIConnectionTimeoutError
                  ) {
                    // Submitted but unconfirmed: keep the conservative reservation.
                    recordAmbiguousProviderAttempt();
                    throw error;
                  }
                  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
                    if ([400, 401, 403, 404, 413, 422].includes(error.status)) {
                      throw new DefiniteProviderRejectionError("Anthropic", error.status);
                    }
                    throw new RuntimeUnavailableError();
                  }
                  throw error;
                }
              },
            });
          try {
            return await attempt(0);
          } catch (error) {
            if (!(error instanceof RuntimeUnavailableError) || task.stop) throw error;
            await new Promise((resolve) => setTimeout(resolve, 3_000));
            return attempt(1);
          }
        },
        recordUsage: (model, response, latencyMs) => {
          // With refusal fallback, top-level usage covers only the attempt that
          // produced the message; usage.iterations bills every attempt.
          const iterations = (response.usage as { iterations?: unknown } | undefined)?.iterations;
          const attempts = Array.isArray(iterations)
            ? (iterations as Array<Record<string, unknown>>).filter(
                (entry) => entry?.type === "message" || entry?.type === "fallback_message",
              )
            : [];
          if (!attempts.length) {
            recordUsage(model, response as unknown as Parameters<typeof recordUsage>[1], latencyMs);
            return;
          }
          attempts.forEach((entry, index) => {
            recordUsage(
              model,
              {
                model:
                  typeof entry.model === "string" && entry.model
                    ? entry.model
                    : entry.type === "fallback_message"
                      ? response.model
                      : model,
                usage: entry,
              },
              index === attempts.length - 1 ? latencyMs : 0,
            );
          });
        },
      },
    });
  } catch (error) {
    outcome = failureOutcome(error, sdk);
    if (!(error instanceof AppError)) {
      log.warn("Cloud computer task failed", {
        taskId: task.taskId,
        error: getErrorMessage(error),
      });
    }
  } finally {
    clearInterval(heartbeat);
    if (session) await session.close();
  }

  task.finished = true;
  task.reply = null;
  task.frame = null;
  pushEvent(task, {
    kind:
      outcome.status === "completed" ? "result" : outcome.status === "failed" ? "error" : "result",
    text:
      outcome.status === "completed"
        ? "Finished the task"
        : outcome.status === "blocked"
          ? "Needs you to finish"
          : outcome.status === "stopped"
            ? "Stopped"
            : "Could not finish",
  });
  await persist(task, {
    status: outcome.status,
    summary: cleanText(outcome.summary, 1_500, true),
    sources: "sources" in outcome ? outcome.sources.map((source) => cleanText(source, 500)) : [],
    errorCode: outcome.status === "failed" ? outcome.code : null,
    question: null,
    finishedAt: new Date(),
  });
}

/** Tasks that were active when their process restarted cannot resume. */
async function settleStaleTasks(rows: TaskRow[]): Promise<TaskRow[]> {
  const cutoff = Date.now() - STALE_AFTER_MS;
  const stale = rows.filter(
    (row) =>
      ACTIVE_STATUSES.includes(row.status) &&
      !live.get(row.id)?.finished &&
      !live.has(row.id) &&
      row.updatedAt.getTime() < cutoff,
  );
  if (!stale.length) return rows;
  const ids = stale.map((row) => row.id);
  const now = new Date();
  await drizzle
    .update(schema.computerTasks)
    .set({
      status: "interrupted",
      summary: INTERRUPTED_SUMMARY,
      question: null,
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(schema.computerTasks.id, ids),
        inArray(schema.computerTasks.status, ACTIVE_STATUSES),
        lt(schema.computerTasks.updatedAt, new Date(cutoff)),
      ),
    );
  return rows.map((row) =>
    ids.includes(row.id)
      ? {
          ...row,
          status: "interrupted" as const,
          summary: INTERRUPTED_SUMMARY,
          question: null,
          finishedAt: now,
          updatedAt: now,
        }
      : row,
  );
}

export async function listComputerTasks(
  userId: string,
  agentId?: string,
): Promise<ComputerTaskView[]> {
  let rows: TaskRow[];
  try {
    rows = await drizzle
      .select()
      .from(schema.computerTasks)
      .where(
        agentId
          ? and(eq(schema.computerTasks.userId, userId), eq(schema.computerTasks.agentId, agentId))
          : eq(schema.computerTasks.userId, userId),
      )
      .orderBy(desc(schema.computerTasks.createdAt))
      .limit(20);
  } catch (error) {
    // Before migration 0176 is promoted there is simply no history yet.
    if (isMissingTable(error)) return [];
    throw error;
  }
  pruneFinished();
  return (await settleStaleTasks(rows)).map(toView);
}

async function ownedRow(userId: string, taskId: string): Promise<TaskRow> {
  if (!UUID_PATTERN.test(taskId)) throw AppError.notFound("Task not found.");
  let row: TaskRow | undefined;
  try {
    [row] = await drizzle
      .select()
      .from(schema.computerTasks)
      .where(and(eq(schema.computerTasks.id, taskId), eq(schema.computerTasks.userId, userId)))
      .limit(1);
  } catch (error) {
    if (isMissingTable(error)) throw AppError.notFound("Task not found.");
    throw error;
  }
  if (!row) throw AppError.notFound("Task not found.");
  return row;
}

export async function getComputerTask(userId: string, taskId: string): Promise<ComputerTaskView> {
  const [row] = await settleStaleTasks([await ownedRow(userId, taskId)]);
  return toView(row);
}

export async function getComputerFrame(userId: string, taskId: string): Promise<Buffer | null> {
  const task = live.get(taskId);
  if (!task || task.userId !== userId) {
    await ownedRow(userId, taskId);
    return null;
  }
  // The screen is cleared once a task ends; nothing is retained after it.
  return task.finished ? null : task.frame;
}

export async function stopComputerTask(userId: string, taskId: string): Promise<ComputerTaskView> {
  const row = await ownedRow(userId, taskId);
  const task = live.get(taskId);
  if (task && task.userId === userId && !task.finished) {
    task.stop = true;
    task.reply?.(null);
    return toView({ ...row, status: row.status });
  }
  if (ACTIVE_STATUSES.includes(row.status)) {
    const now = new Date();
    const [updated] = await drizzle
      .update(schema.computerTasks)
      .set({
        status: "stopped",
        summary: "Stopped by the owner.",
        question: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(schema.computerTasks.id, taskId), eq(schema.computerTasks.userId, userId)))
      .returning();
    return toView(updated ?? row);
  }
  return toView(row);
}

export async function replyToComputerTask(
  userId: string,
  taskId: string,
  body: unknown,
): Promise<ComputerTaskView> {
  const row = await ownedRow(userId, taskId);
  const message =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).message === "string"
      ? cleanText(String((body as Record<string, unknown>).message), 2_000, true).trim()
      : "";
  if (!message) throw AppError.badRequest("Write a reply for your Bot.");
  if (message.length > 1_000) throw AppError.badRequest("Keep replies under 1,000 characters.");
  const task = live.get(taskId);
  if (!task || task.userId !== userId || !task.reply) {
    throw new AppError(409, "COMPUTER_NOT_WAITING", "This task is not waiting for a reply.");
  }
  task.reply(message);
  return toView({ ...row, status: "running", question: null });
}

/** Test seam: clear in-process state between cases. */
export function __resetCloudComputerRunnerForTests() {
  live.clear();
}
