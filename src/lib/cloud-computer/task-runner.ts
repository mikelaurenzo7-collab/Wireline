import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import type { ComputerTaskEvent, ComputerTaskStatus } from "../../db/computer-task-schema";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import { recordAmbiguousProviderAttempt, recordUsage } from "../ai-audit";
import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "../ai-client";
import { normalizeResponsesUsage } from "../ai-usage";
import { AppError } from "../api-error";
import { getTenantChannelEntitlements } from "../channel-entitlements";
import { getPostgresErrorCode } from "../pg-errors";
import { isProductionDeployment } from "../deployment-environment";
import { planById } from "../plan-catalog";
import { runWithManagedAiSpend } from "../managed-ai-operation-spend";
import { getAgentCoachingBrief } from "../mcp-agent-coaching";
import { rateLimit } from "../rate-limit";
import { drizzle, log, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  CLOUD_COMPUTER_LIMITS,
  CONTEXT_LIMIT_OUTCOME,
  CLOUD_COMPUTER_TOOL_CALL_USD,
  runCloudComputerAgent,
  type CloudComputerEvent,
  type CloudComputerOutcome,
} from "./agent";
import type { CloudBrowserSession, OwnerControlInput } from "./browser-session";
import {
  cloudComputerClient,
  cloudComputerConnection,
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
// The heartbeat also ends a task whose executor is stuck (a browser call
// that never returns): one still running this long after Stop was pressed,
// or one older than its working time, its whole owner-wait budget, and slack
// for a last turn that starts just inside the working limit (two 5-minute
// model attempts, one browser step, and margin).
const STOP_GRACE_MS = 60_000;
const MAX_TASK_LIFETIME_MS =
  CLOUD_COMPUTER_LIMITS.maxRunMs + CLOUD_COMPUTER_LIMITS.ownerWaitBudgetMs + 12 * 60_000;
// A failed final write is retried before the outcome is left for a read to settle.
const TERMINAL_PERSIST_BACKOFF_MS = [0, 500, 1_500] as const;
const SESSION_CLOSE_DEADLINE_MS = 10_000;
const SHUTDOWN_DEADLINE_MS = 5_000;
const ACTIVE_STATUSES: ComputerTaskStatus[] = ["running", "needs_input"];
const INTERRUPTED_SUMMARY = "This task was interrupted by a BotBound update. Start it again.";
const STOPPED_SUMMARY = "Stopped by the owner.";
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

/** The final state a finished task writes to its row. */
type TerminalOutcome = {
  status: Exclude<ComputerTaskStatus, "running" | "needs_input">;
  summary: string;
  sources: string[];
  errorCode: string | null;
  finishedAt: Date;
};

type LiveTask = {
  taskId: string;
  userId: string;
  agentId: string;
  startedAt: number;
  stop: boolean;
  /** When stop was first requested. */
  stopAt: number | null;
  session: CloudBrowserSession | null;
  frame: Buffer | null;
  frameAt: number;
  currentUrl: string | null;
  events: ComputerTaskEvent[];
  turns: number;
  actions: number;
  reply: ((value: string | null) => void) | null;
  ownerControl: boolean;
  ownerInputBusy: boolean;
  finished: boolean;
  /** Set when the task finishes, and kept until the row holds it. */
  outcome: TerminalOutcome | null;
  outcomeSaved: boolean;
};

const live = new Map<string, LiveTask>();
/** Accounts with a start in flight: one start per account, counted against capacity. */
const starting = new Set<string>();
/** Cleared by the shutdown hook: a task started now would die with the process. */
let acceptingTasks = true;

function runningCount(): number {
  let count = 0;
  for (const task of live.values()) if (!task.finished) count += 1;
  return count;
}

function pruneFinished(now = Date.now()) {
  for (const [id, task] of live) {
    // An outcome its row does not hold yet stays until a read settles it.
    if (task.finished && task.outcomeSaved && now - task.frameAt > FRAME_RETENTION_MS) {
      live.delete(id);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stop at the executor's next checkpoint, and end any wait for an owner reply. */
function requestStop(task: LiveTask) {
  if (!task.stop) {
    task.stop = true;
    task.stopAt = Date.now();
  }
  task.ownerControl = false;
  task.session?.cancelCurrentInput();
  task.reply?.(null);
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
  currentUrl: string | null;
  /** True only while this process is holding an owner takeover at a Bot checkpoint. */
  ownerControl: boolean;
  /** Stop was requested; the task ends at its executor's next checkpoint. */
  stopping: boolean;
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
    currentUrl: task?.userId === row.userId && !task.finished ? task.currentUrl : null,
    ownerControl: Boolean(
      task &&
      !task.finished &&
      !task.stop &&
      task.reply &&
      task.ownerControl &&
      task.userId === row.userId &&
      row.status === "needs_input",
    ),
    stopping: Boolean(
      task &&
      !task.finished &&
      task.stop &&
      task.userId === row.userId &&
      ACTIVE_STATUSES.includes(row.status),
    ),
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

/** The cloud computer is a paid feature; an active Free Builder plan is not enough. */
export function hasPaidComputerPlan(entitlement: {
  planId: string | null;
  subscriptionStatus: string;
}): boolean {
  const plan = planById(entitlement.planId);
  return Boolean(
    plan &&
    (plan.price_usd_monthly > 0 || plan.price_usd_annual > 0) &&
    ["active", "trialing"].includes(entitlement.subscriptionStatus),
  );
}

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
  if (!hasPaidComputerPlan(entitlement)) {
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
  if (!acceptingTasks) {
    throw new AppError(
      503,
      "COMPUTER_RESTARTING",
      "BotBound is restarting for an update. Start the task again in a minute.",
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
  if (!hasPaidComputerPlan(entitlement)) {
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
  // A task this process finished whose final write did not land still holds
  // the account's one active row: write its stored outcome first.
  for (const row of busy) {
    const task = live.get(row.id);
    if (task?.finished) await saveOutcome(task);
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
    startedAt: Date.now(),
    stop: false,
    stopAt: null,
    session: null,
    frame: null,
    frameAt: Date.now(),
    currentUrl: null,
    events: [],
    turns: 0,
    actions: 0,
    reply: null,
    ownerControl: false,
    ownerInputBusy: false,
    finished: false,
    outcome: null,
    outcomeSaved: false,
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
async function persist(
  task: LiveTask,
  patch: Partial<typeof schema.computerTasks.$inferInsert>,
): Promise<"written" | "unmatched" | "error"> {
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
    if (updated.length) return "written";
    if (!task.finished) requestStop(task);
    return "unmatched";
  } catch (error) {
    log.error("Cloud computer task update failed", {
      taskId: task.taskId,
      error: getErrorMessage(error),
    });
    return "error";
  }
}

function terminalOutcome(outcome: CloudComputerOutcome): TerminalOutcome {
  return {
    status: outcome.status,
    summary: cleanText(outcome.summary, 1_500, true),
    sources: "sources" in outcome ? outcome.sources.map((source) => cleanText(source, 500)) : [],
    errorCode: outcome.status === "failed" ? outcome.code : null,
    finishedAt: new Date(),
  };
}

function terminalPatch(outcome: TerminalOutcome) {
  return {
    status: outcome.status,
    summary: outcome.summary,
    sources: outcome.sources,
    errorCode: outcome.errorCode,
    question: null,
    finishedAt: outcome.finishedAt,
  };
}

const FINAL_EVENTS: Record<TerminalOutcome["status"], CloudComputerEvent> = {
  completed: { kind: "result", text: "Finished the task" },
  blocked: { kind: "result", text: "Needs you to finish" },
  stopped: { kind: "result", text: "Stopped" },
  failed: { kind: "error", text: "Could not finish" },
  interrupted: { kind: "error", text: "Interrupted by a BotBound update" },
};

/**
 * Finish a task with its outcome, exactly once. The executor, the heartbeat
 * watchdog and the shutdown hook can each finish a task; only the first
 * counts, and the others then write nothing. Synchronous, so the finished
 * flag is set before any later await can observe the task.
 */
function finishTask(task: LiveTask, outcome: TerminalOutcome): boolean {
  if (task.finished) return false;
  task.finished = true;
  task.outcome = outcome;
  task.ownerControl = false;
  task.currentUrl = null;
  task.reply?.(null);
  task.reply = null;
  task.frame = null;
  pushEvent(task, FINAL_EVENTS[outcome.status]);
  return true;
}

/** Write a finished task's stored outcome while its row is still active. */
async function saveOutcome(task: LiveTask): Promise<boolean> {
  if (!task.outcome) return false;
  if ((await persist(task, terminalPatch(task.outcome))) === "error") return false;
  // Written, or the row was already ended by another writer: nothing is left to save.
  task.outcomeSaved = true;
  return true;
}

/** The final write, retried with a short backoff; a read settles it if all attempts fail. */
async function persistTerminal(task: LiveTask): Promise<void> {
  for (const delay of TERMINAL_PERSIST_BACKOFF_MS) {
    if (delay) await sleep(delay);
    if (task.outcomeSaved || (await saveOutcome(task))) return;
  }
  log.error("Cloud computer task outcome is not saved yet; the next read of the task settles it", {
    taskId: task.taskId,
  });
}

/** Close a browser without letting a dead connection hold the caller. */
async function closeSession(session: CloudBrowserSession | null): Promise<void> {
  if (!session) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    session.close().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SESSION_CLOSE_DEADLINE_MS);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * End a task its executor cannot end (a browser call that never returns, or
 * a process shutting down): stop it, settle its row, and close its browser.
 * The executor, if it ever resumes, finds the task finished and writes nothing.
 */
async function forceFinish(task: LiveTask, outcome: TerminalOutcome): Promise<void> {
  requestStop(task);
  if (!finishTask(task, outcome)) return;
  await Promise.allSettled([persistTerminal(task), closeSession(task.session)]);
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

function failureOutcome(error: unknown): CloudComputerOutcome {
  if (error instanceof AppError) {
    return { status: "failed", code: error.code || "COMPUTER_FAILED", summary: error.message };
  }
  if (error instanceof DefiniteProviderRejectionError) {
    // 413: the task's history outgrew the API's request size, not a bad task.
    if (error.status === 413) return { ...CONTEXT_LIMIT_OUTCOME };
    return {
      status: "failed",
      code: "COMPUTER_MODEL_REJECTED",
      summary: "The AI provider rejected this request. Try rephrasing the task.",
    };
  }
  if (error instanceof RuntimeUnavailableError) {
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
  let outcome: CloudComputerOutcome;
  const taskHash = createHash("sha256").update(task.taskId).digest("hex").slice(0, 24);
  const heartbeat = setInterval(() => void heartbeatTick(task, heartbeat), HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    const client = cloudComputerClient();
    try {
      // Playwright loads with the first task, never on an API cold start.
      const { CloudBrowserSession } = await import("./browser-session");
      session = await CloudBrowserSession.open(input.connection);
    } catch {
      log.error("Cloud browser connection failed", {
        taskId: task.taskId,
        stage: "browser_connect",
      });
      throw new AppError(
        503,
        "COMPUTER_BROWSER_UNAVAILABLE",
        "The cloud computer could not start a browser. Try again in a few minutes.",
      );
    }
    task.session = session;
    task.currentUrl = displayUrl(session.activeUrl()) || null;
    if (input.startUrl && !task.stop) {
      const opened = await session.execute("navigate", { url: input.startUrl });
      pushEvent(task, {
        kind: opened.ok ? "action" : "error",
        text: opened.activity,
        url: displayUrl(session.activeUrl()) || undefined,
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
      taskHash,
      hooks: {
        emit: async (event) => {
          if (event.kind === "action" || event.kind === "error") task.actions += 1;
          pushEvent(task, event);
          if (event.url) task.currentUrl = displayUrl(event.url) || task.currentUrl;
          await persist(task, {});
        },
        frame: (jpeg) => {
          task.frame = jpeg;
          task.frameAt = Date.now();
        },
        stopRequested: () => task.stop,
        askOwner: async (question, waitMs) => {
          // Stop pressed during the model call: do not park on a new question.
          if (task.stop) return null;
          const checkpoint = await persist(task, {
            status: "needs_input",
            question: cleanText(question, 300),
          });
          // If the owner cannot see the question, waiting here leaves the Bot
          // stuck until its timeout with no way for the owner to take control.
          if (checkpoint !== "written") {
            if (task.stop || task.finished) return null;
            throw AppError.serviceUnavailable(
              "The cloud computer could not show your Bot's question. Try the task again.",
            );
          }
          if (task.stop) return null;
          // waitMs is what remains of the task's owner-wait budget.
          const reply = await new Promise<string | null>((resolve) => {
            const timer = setTimeout(() => {
              task.reply = null;
              resolve(null);
            }, waitMs);
            task.reply = (value) => {
              clearTimeout(timer);
              task.reply = null;
              resolve(value);
            };
          });
          if (!task.finished) await persist(task, { status: "running", question: null });
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
                    error instanceof DefiniteProviderRejectionError ||
                    error instanceof RuntimeUnavailableError
                  )
                    throw error;
                  recordAmbiguousProviderAttempt();
                  throw new RuntimeUnavailableError();
                }
              },
            });
          try {
            return await attempt(0);
          } catch (error) {
            if (!(error instanceof RuntimeUnavailableError) || task.stop) throw error;
            await sleep(3_000);
            // Stop pressed during the backoff: reserve and send nothing more.
            if (task.stop) throw error;
            return attempt(1);
          }
        },
        recordUsage: (model, response, latencyMs) => {
          const rawUsage =
            response.usage && typeof response.usage === "object"
              ? (response.usage as Record<string, unknown>)
              : {};
          const usage = normalizeResponsesUsage(rawUsage);
          const output = Array.isArray(response.output) ? response.output : [];
          const computerToolCalls = output.filter((item) =>
            Boolean(
              item &&
              typeof item === "object" &&
              (item as Record<string, unknown>).type === "computer_call",
            ),
          ).length;
          recordUsage(
            model,
            {
              model: typeof response.model === "string" ? response.model : model,
              usage: {
                input_tokens: usage.inputTokens,
                output_tokens: usage.outputTokens,
                cache_read_input_tokens: usage.cacheReadTokens,
                cache_creation_input_tokens: usage.cacheWriteTokens,
              },
              provider_tool_call_cost_usd: computerToolCalls * CLOUD_COMPUTER_TOOL_CALL_USD,
            },
            latencyMs,
          );
        },
      },
    });
  } catch (error) {
    // A step that failed after the owner pressed Stop is still the owner's stop.
    outcome = task.stop ? { status: "stopped", summary: STOPPED_SUMMARY } : failureOutcome(error);
    if (!(error instanceof AppError)) {
      log.warn("Cloud computer task failed", {
        taskId: task.taskId,
        taskHash,
        error: getErrorMessage(error),
      });
    }
  } finally {
    clearInterval(heartbeat);
    await closeSession(session);
  }

  // The watchdog or the shutdown hook may have finished the task already.
  if (finishTask(task, terminalOutcome(outcome))) await persistTerminal(task);
}

/**
 * One heartbeat: keep the row fresh so other processes see the task alive,
 * or end the task when its executor is stuck. Stop and every limit are
 * honored at the executor's checkpoints; a browser call with no deadline
 * never reaches one, and would otherwise hold the account and a capacity
 * slot until the process restarts.
 */
async function heartbeatTick(task: LiveTask, heartbeat: ReturnType<typeof setInterval>) {
  if (task.finished) {
    clearInterval(heartbeat);
    return;
  }
  const now = Date.now();
  const stopIgnored = task.stopAt !== null && now - task.stopAt > STOP_GRACE_MS;
  if (!stopIgnored && now - task.startedAt <= MAX_TASK_LIFETIME_MS) {
    await persist(task, {});
    return;
  }
  clearInterval(heartbeat);
  log.warn("Cloud computer task stopped responding; ending it", {
    taskId: task.taskId,
    stopRequested: task.stop,
  });
  await forceFinish(
    task,
    terminalOutcome(
      task.stop
        ? { status: "stopped", summary: STOPPED_SUMMARY }
        : {
            status: "failed",
            code: "COMPUTER_TIMEOUT",
            summary: "The cloud computer stopped responding, so the task was ended. Try again.",
          },
    ),
  );
}

/**
 * Process shutdown: refuse new tasks, then settle every running task as
 * interrupted and close its browser, so no row or owner view keeps showing a
 * task that no process runs. Bounded so it never holds a deploy.
 */
export async function interruptCloudComputerTasks(): Promise<void> {
  acceptingTasks = false;
  const running = [...live.values()].filter((task) => !task.finished);
  if (!running.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(
      // Shutdown runs outside any request: write each row as its owner.
      running.map((task) =>
        tenantStore.run(task.userId, () =>
          forceFinish(task, {
            status: "interrupted",
            summary: INTERRUPTED_SUMMARY,
            sources: [],
            errorCode: null,
            finishedAt: new Date(),
          }),
        ),
      ),
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_DEADLINE_MS);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Settle active rows no executor will write again. A task this process
 * finished whose final write did not land gets its stored outcome. A task
 * whose process restarted (its heartbeat stopped) cannot resume and is
 * marked interrupted. Both writes only touch rows that are still active.
 */
async function settleStaleTasks(rows: TaskRow[]): Promise<TaskRow[]> {
  const saved = new Map<string, TaskRow>();
  for (const row of rows) {
    const task = live.get(row.id);
    if (!ACTIVE_STATUSES.includes(row.status) || !task?.finished || !task.outcome) continue;
    // A failed write leaves the row active, so the next read tries again.
    if (!(await saveOutcome(task))) continue;
    saved.set(row.id, {
      ...row,
      ...terminalPatch(task.outcome),
      events: task.events,
      turnCount: task.turns,
      actionCount: task.actions,
      updatedAt: new Date(),
    });
  }
  const cutoff = Date.now() - STALE_AFTER_MS;
  const stale = rows.filter(
    (row) =>
      ACTIVE_STATUSES.includes(row.status) && !live.has(row.id) && row.updatedAt.getTime() < cutoff,
  );
  if (!stale.length) return rows.map((row) => saved.get(row.id) ?? row);
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
      : (saved.get(row.id) ?? row),
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
  if (task && task.userId === userId) {
    if (!task.finished) {
      requestStop(task);
      return toView({ ...row, status: row.status });
    }
    // The task finished before Stop arrived: its own report stands.
    if (ACTIVE_STATUSES.includes(row.status)) {
      const [settled] = await settleStaleTasks([row]);
      return toView(settled);
    }
  }
  if (ACTIVE_STATUSES.includes(row.status)) {
    const now = new Date();
    const [updated] = await drizzle
      .update(schema.computerTasks)
      .set({
        status: "stopped",
        summary: STOPPED_SUMMARY,
        question: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.computerTasks.id, taskId),
          eq(schema.computerTasks.userId, userId),
          inArray(schema.computerTasks.status, ACTIVE_STATUSES),
        ),
      )
      .returning();
    // No longer active: the task ended on its own between the read and this
    // write (here or on another process). Show its real outcome.
    return toView(updated ?? (await ownedRow(userId, taskId)));
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
  if (task.ownerControl) {
    throw new AppError(
      409,
      "COMPUTER_OWNER_CONTROL_ACTIVE",
      "Return control to your Bot before sending it a reply.",
    );
  }
  task.reply(message);
  return toView({ ...row, status: "running", question: null });
}

export async function takeComputerControl(
  userId: string,
  taskId: string,
): Promise<ComputerTaskView> {
  const row = await ownedRow(userId, taskId);
  const task = live.get(taskId);
  if (
    row.status !== "needs_input" ||
    !task ||
    task.userId !== userId ||
    task.finished ||
    task.stop ||
    !task.reply ||
    !task.session
  ) {
    throw new AppError(
      409,
      "COMPUTER_NOT_WAITING",
      "Your Bot is not waiting at a live browser checkpoint.",
    );
  }
  task.ownerControl = true;
  if ((await persist(task, { status: "needs_input" })) !== "written") {
    task.ownerControl = false;
    throw new AppError(409, "COMPUTER_NOT_WAITING", "This browser task has ended.");
  }
  return toView({ ...row, status: "needs_input", events: task.events });
}

export async function sendComputerOwnerInput(
  userId: string,
  taskId: string,
  input: OwnerControlInput,
): Promise<ComputerTaskView> {
  const row = await ownedRow(userId, taskId);
  const task = live.get(taskId);
  if (
    row.status !== "needs_input" ||
    !task ||
    task.userId !== userId ||
    task.finished ||
    task.stop ||
    !task.reply ||
    !task.ownerControl ||
    !task.session
  ) {
    throw new AppError(
      409,
      "COMPUTER_CONTROL_REQUIRED",
      "Take control of the browser before interacting with it.",
    );
  }
  if (task.ownerInputBusy) {
    throw new AppError(
      409,
      "COMPUTER_INPUT_BUSY",
      "Wait for the current browser action to finish.",
    );
  }
  task.ownerInputBusy = true;
  try {
    let frame: Buffer;
    try {
      frame = await task.session.executeOwnerInput(input);
    } catch {
      // Browser errors may include page-provided strings or entered values.
      // Keep them out of API output, logs, and the task ledger.
      throw new AppError(
        409,
        "COMPUTER_INPUT_FAILED",
        "That browser action did not go through. Check the screen and try again.",
      );
    }
    if (task.stop || task.finished || !task.ownerControl) {
      throw new AppError(
        409,
        "COMPUTER_TASK_ENDED",
        "This browser task is no longer in your control.",
      );
    }
    task.frame = frame;
    task.frameAt = Date.now();
    task.currentUrl = displayUrl(task.session.activeUrl()) || task.currentUrl;
    return toView({ ...row, status: "needs_input", events: task.events });
  } finally {
    task.ownerInputBusy = false;
  }
}

export async function returnComputerControlToBot(
  userId: string,
  taskId: string,
): Promise<ComputerTaskView> {
  const row = await ownedRow(userId, taskId);
  const task = live.get(taskId);
  if (
    row.status !== "needs_input" ||
    !task ||
    task.userId !== userId ||
    task.finished ||
    task.stop ||
    !task.reply ||
    !task.ownerControl ||
    !task.session
  ) {
    throw new AppError(
      409,
      "COMPUTER_CONTROL_REQUIRED",
      "Your Bot is not waiting for you to return browser control.",
    );
  }
  if (task.ownerInputBusy) {
    throw new AppError(
      409,
      "COMPUTER_INPUT_BUSY",
      "Wait for the current browser action to finish.",
    );
  }

  const resume = task.reply;
  let frame: Buffer | null;
  try {
    frame = await task.session.frame();
  } catch {
    frame = null;
  }
  if (!frame) {
    throw new AppError(
      409,
      "COMPUTER_SCREEN_UNAVAILABLE",
      "The browser could not confirm a safe screen. Keep control and try again after the page settles.",
    );
  }
  if (
    task.reply !== resume ||
    task.finished ||
    task.stop ||
    !task.ownerControl ||
    task.ownerInputBusy
  ) {
    throw new AppError(
      409,
      "COMPUTER_TASK_ENDED",
      "This browser task is no longer waiting for you.",
    );
  }
  task.frame = frame;
  task.frameAt = Date.now();
  task.currentUrl = displayUrl(task.session.activeUrl()) || task.currentUrl;
  task.ownerControl = false;
  const saved = await persist(task, { status: "running", question: null });
  if (saved !== "written") {
    if (saved === "error" && !task.finished && !task.stop) task.ownerControl = true;
    throw new AppError(
      saved === "error" ? 503 : 409,
      saved === "error" ? "COMPUTER_HANDOFF_FAILED" : "COMPUTER_TASK_ENDED",
      saved === "error"
        ? "BotBound could not return control to your Bot. Your browser session is still open. Try again."
        : "This browser task has ended.",
    );
  }
  if (task.stop || task.finished || task.reply !== resume) {
    throw new AppError(
      409,
      "COMPUTER_TASK_ENDED",
      "This browser task is no longer waiting for you.",
    );
  }
  pushEvent(task, { kind: "note", text: "You returned browser control to your Bot." });
  // The model gets a fixed handoff signal, never the owner's typed values.
  resume(
    "The owner returned browser control. Inspect the current redacted screen before deciding whether the step succeeded. Ask the owner again if you still need help.",
  );
  return toView({ ...row, status: "running", question: null, events: task.events });
}

/** Test seam: clear in-process state between cases. */
export function __resetCloudComputerRunnerForTests() {
  live.clear();
}
