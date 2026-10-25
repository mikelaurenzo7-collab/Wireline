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
import { isUsagePlanId, planById } from "../plan-catalog";
import { runWithManagedAiSpend } from "../managed-ai-operation-spend";
import { getAgentCoachingBrief } from "../mcp-agent-coaching";
import { rateLimit } from "../rate-limit";
import { drizzle, log, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { usageBillingEnabled } from "../usage-billing-config";
import {
  CLOUD_COMPUTER_LIMITS,
  CONTEXT_LIMIT_OUTCOME,
  CLOUD_COMPUTER_TOOL_CALL_USD,
  runCloudComputerAgent,
  type CloudComputerEvent,
  type CloudComputerOutcome,
} from "./agent";
import type { CloudBrowserSession, OwnerBrowserTab, OwnerControlInput } from "./browser-session";
import {
  OWNER_BROWSER_CAPABILITIES,
  type OwnerBrowserCapabilities,
  type OwnerBrowserDownload,
  type OwnerBrowserHistory,
  type OwnerSavedLogin,
} from "./browser-capabilities";
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
const OWNER_FRAME_REFRESH_MS = 2_500;
const AGENT_POINTER_VISIBLE_MS = 15_000;
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
const SESSION_CLOSE_DEADLINE_MS = 10_000;
// Browserless bills one unit per started 30 seconds; its paid-plan overage is
// $0.002 per unit. Reserve the full watchdog envelope before opening a browser,
// then settle the actual connected time. The buffer covers a late heartbeat and
// closing a stuck socket without assuming the account's current vendor tier.
const BROWSERLESS_UNIT_MS = 30_000;
const BROWSERLESS_UNIT_USD = 0.002;
const BROWSERLESS_RESERVE_MS =
  MAX_TASK_LIFETIME_MS + HEARTBEAT_MS + SESSION_CLOSE_DEADLINE_MS + 60_000;
const BROWSERLESS_RESERVE_USD = browserlessSessionCostUsd(BROWSERLESS_RESERVE_MS);

export function browserlessSessionCostUsd(connectionMs: number): number {
  if (!Number.isFinite(connectionMs) || connectionMs <= 0) return 0;
  return Math.ceil(connectionMs / BROWSERLESS_UNIT_MS) * BROWSERLESS_UNIT_USD;
}
// A failed final write is retried before the outcome is left for a read to settle.
const TERMINAL_PERSIST_BACKOFF_MS = [0, 500, 1_500] as const;
const SHUTDOWN_DEADLINE_MS = 5_000;
const ACTIVE_STATUSES: ComputerTaskStatus[] = ["running", "needs_input"];
const INTERRUPTED_SUMMARY = "This task was interrupted by a BotBound update. Start it again.";
const STOPPED_SUMMARY = "Stopped by the owner.";
const EXPIRED_BROWSER_OUTCOME = {
  status: "failed",
  code: "COMPUTER_BROWSER_EXPIRED",
  summary: "This browser session ended. Start a new task.",
} satisfies CloudComputerOutcome;
const BROWSE_FIRST_GOAL = "Browse first, then give your Bot a task.";
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
  /** Billed through usage meters (computer minutes) instead of the AI allowance. */
  usageMetered: boolean;
  usagePeriodKey: string | null;
  stop: boolean;
  /** The provider ended the browser while the owner was using it. */
  expiredBrowser: boolean;
  /** When stop was first requested. */
  stopAt: number | null;
  session: CloudBrowserSession | null;
  frame: Buffer | null;
  frameAt: number;
  frameUrl: string | null;
  currentUrl: string | null;
  ownerFrameRefresh: Promise<void> | null;
  ownerFrameEpoch: number;
  agentPointer: { x: number; y: number; at: number } | null;
  events: ComputerTaskEvent[];
  turns: number;
  actions: number;
  reply: ((value: string | null) => void) | null;
  ownerControl: boolean;
  controlRequested: boolean;
  controlRequestSaving: boolean;
  handoffBusy: boolean;
  preparingBrowser: boolean;
  handoffGoal: string | null;
  ownerInputBusy: boolean;
  finished: boolean;
  /** Set when the task finishes, and kept until the row holds it. */
  outcome: TerminalOutcome | null;
  outcomeSaved: boolean;
};

const live = new Map<string, LiveTask>();
const loggedBrowserClosures = new WeakSet<LiveTask>();
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

function waitForOwner(task: LiveTask, waitMs: number): Promise<string | null> {
  return new Promise((resolve) => {
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
}

/** Stop at the executor's next checkpoint, and end any wait for an owner reply. */
function requestStop(task: LiveTask) {
  if (!task.stop) {
    task.stop = true;
    task.stopAt = Date.now();
  }
  task.ownerControl = false;
  task.controlRequested = false;
  task.agentPointer = null;
  task.session?.cancelCurrentInput();
  task.reply?.(null);
}

function failExpiredBrowser(task: LiveTask): never {
  logUnexpectedBrowserClosure(task);
  task.expiredBrowser = true;
  requestStop(task);
  throw new AppError(410, EXPIRED_BROWSER_OUTCOME.code, EXPIRED_BROWSER_OUTCOME.summary);
}

function logUnexpectedBrowserClosure(task: LiveTask): void {
  const reason = task.session?.unexpectedCloseReason;
  if (
    !task.session?.isClosed ||
    loggedBrowserClosures.has(task) ||
    !["provider_disconnected", "network_guard_failed", "guard_startup_failed"].includes(
      reason ?? "",
    )
  )
    return;
  loggedBrowserClosures.add(task);
  log.warn("Cloud computer browser ended unexpectedly", { taskId: task.taskId, reason });
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
  frameCapturedAt: string | null;
  frameUrl: string | null;
  currentUrl: string | null;
  /** Recent Bot pointer position on the 1280x800 browser frame, never persisted. */
  agentPointer?: { x: number; y: number; at: string } | null;
  /** True only while this process is holding an owner takeover at a Bot checkpoint. */
  ownerControl: boolean;
  /** Waiting for the executor's next safe checkpoint, not owner input yet. */
  controlRequested: boolean;
  ownerTabs: OwnerBrowserTab[];
  browserCapabilities?: OwnerBrowserCapabilities | null;
  ownerHistory?: OwnerBrowserHistory[];
  ownerDownloads?: OwnerBrowserDownload[];
  ownerDownloadNotice?: string | null;
  ownerSavedLogins?: OwnerSavedLogin[];
  preparingBrowser: boolean;
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
    // A finished task reports its retained final frame the same way, so the
    // completed session stays reviewable in place until the task is pruned.
    frameCapturedAt:
      task && task.frame && task.userId === row.userId
        ? new Date(task.frameAt).toISOString()
        : null,
    frameUrl: task && task.userId === row.userId ? task.frameUrl : null,
    currentUrl: task?.userId === row.userId && !task.finished ? task.currentUrl : null,
    agentPointer:
      task &&
      task.userId === row.userId &&
      !task.finished &&
      !task.stop &&
      row.status === "running" &&
      task.agentPointer &&
      Date.now() - task.agentPointer.at <= AGENT_POINTER_VISIBLE_MS
        ? { ...task.agentPointer, at: new Date(task.agentPointer.at).toISOString() }
        : null,
    ownerControl: Boolean(
      task &&
      !task.finished &&
      !task.stop &&
      task.reply &&
      task.ownerControl &&
      task.userId === row.userId &&
      row.status === "needs_input",
    ),
    controlRequested: Boolean(
      task &&
      task.userId === row.userId &&
      !task.finished &&
      !task.stop &&
      task.controlRequested &&
      row.status === "running",
    ),
    ownerTabs:
      task && !task.finished && task.ownerControl && task.userId === row.userId
        ? (task.session?.ownerTabs() ?? [])
        : [],
    browserCapabilities:
      task && !task.finished && task.session && task.userId === row.userId
        ? OWNER_BROWSER_CAPABILITIES
        : null,
    ownerHistory:
      task && !task.finished && task.ownerControl && task.userId === row.userId
        ? (task.session?.ownerHistory?.() ?? [])
        : [],
    ownerDownloads:
      task && !task.finished && task.ownerControl && task.userId === row.userId
        ? (task.session?.ownerDownloads?.() ?? [])
        : [],
    ownerDownloadNotice:
      task && !task.finished && task.ownerControl && task.userId === row.userId
        ? (task.session?.ownerDownloadNotice?.() ?? null)
        : null,
    ownerSavedLogins:
      task && !task.finished && task.ownerControl && task.userId === row.userId
        ? (task.session?.ownerSavedLogins?.() ?? [])
        : [],
    preparingBrowser: Boolean(task && !task.finished && task.preparingBrowser),
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

function parseGoal(value: unknown): string {
  const goal = typeof value === "string" ? cleanText(value, 10_000, true).trim() : "";
  if (goal.length < 4) throw AppError.badRequest("Describe the task in a sentence or two.");
  if (goal.length > CLOUD_COMPUTER_LIMITS.goalChars) {
    throw AppError.badRequest(`Keep the task under ${CLOUD_COMPUTER_LIMITS.goalChars} characters.`);
  }
  return goal;
}

function parseStartInput(body: unknown): {
  goal: string;
  startUrl: string | null;
  prepareBrowser: boolean;
} {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const prepareBrowser = record.prepareBrowser === true;
  if (prepareBrowser && record.goal) {
    throw AppError.badRequest("Open the browser first, then give your Bot a task.");
  }
  const goal = prepareBrowser ? BROWSE_FIRST_GOAL : parseGoal(record.goal);
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
  return { goal, startUrl, prepareBrowser };
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
  const { goal, startUrl, prepareBrowser } = parseStartInput(body);
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
    return await admitComputerTask(userId, agentId, goal, startUrl, prepareBrowser, connection);
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
  prepareBrowser: boolean,
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
  // Usage billing: refuse at the monthly spending limit; otherwise the task is
  // billed as computer minutes and stays off the managed AI allowance.
  let usageMetered = false;
  let usagePeriodKey: string | null = null;
  if (isUsagePlanId(entitlement.planId) && usageBillingEnabled()) {
    const { admitAccountUsage } = await import("../usage-billing-store");
    const admission = await admitAccountUsage(userId, "computer_minutes");
    usageMetered = admission !== null;
    usagePeriodKey = admission?.periodKey ?? null;
  }

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
    usageMetered,
    usagePeriodKey,
    stop: false,
    expiredBrowser: false,
    stopAt: null,
    session: null,
    frame: null,
    frameAt: Date.now(),
    frameUrl: null,
    currentUrl: null,
    ownerFrameRefresh: null,
    ownerFrameEpoch: 0,
    agentPointer: null,
    events: [],
    turns: 0,
    actions: 0,
    reply: null,
    ownerControl: false,
    controlRequested: false,
    controlRequestSaving: false,
    handoffBusy: false,
    preparingBrowser: false,
    handoffGoal: null,
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
    .run(userId, () =>
      executeTask(task, { goal, startUrl, prepareBrowser, model, bot, connection }),
    )
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

/** Publish a serialized owner checkpoint before accepting direct browser input. */
export async function waitForComputerOwner(
  task: LiveTask,
  question: string,
  waitMs: number,
  options?: { takeControl: true },
): Promise<string | null> {
  if (task.stop || task.finished) return null;
  task.handoffBusy = true;
  task.agentPointer = null;
  const takingControl = options?.takeControl || task.controlRequested;
  task.controlRequested = false;
  task.ownerControl = Boolean(takingControl);
  // Register before publishing needs_input. The transition fence prevents a
  // stale running-state request from re-arming a pause during the save.
  const reply = waitForOwner(task, waitMs);
  try {
    const checkpoint = await persist(task, {
      status: "needs_input",
      question: cleanText(question, 300),
    });
    if (checkpoint !== "written") {
      task.reply?.(null);
      task.ownerControl = false;
      if (task.stop || task.finished) return null;
      throw AppError.serviceUnavailable(
        "The cloud computer could not show your Bot's question. Try the task again.",
      );
    }
    if (task.stop) {
      task.reply?.(null);
      return null;
    }
  } finally {
    task.handoffBusy = false;
  }
  const ownerReply = await reply;
  task.ownerControl = false;
  task.session?.cancelCurrentInput();
  if (task.stop || task.finished) return null;
  const resumed = await persist(task, { status: "running", question: null });
  if (resumed !== "written") {
    if (task.stop || task.finished) return null;
    throw AppError.serviceUnavailable(
      "The cloud computer could not confirm that your Bot resumed. Start a new task.",
    );
  }
  return ownerReply;
}

function terminalOutcome(outcome: CloudComputerOutcome): TerminalOutcome {
  return {
    status: outcome.status,
    summary: cleanText(outcome.summary, CLOUD_COMPUTER_LIMITS.reportChars, true),
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
  task.controlRequested = false;
  task.agentPointer = null;
  task.currentUrl = null;
  task.reply?.(null);
  task.reply = null;
  // The final frame and its page stay on the finished task so the owner can
  // review the session in place; pruneFinished retires them with the task.
  pushEvent(task, FINAL_EVENTS[outcome.status]);
  return true;
}

/** Write a finished task's stored outcome while its row is still active. */
async function saveOutcome(task: LiveTask): Promise<boolean> {
  if (!task.outcome) return false;
  // Persist the billing receipt with the outcome. Retrying a terminal write
  // cannot extend the charged duration, and process exit cannot lose the meter.
  const usageReceipt = task.usagePeriodKey
    ? {
        periodKey: task.usagePeriodKey,
        quantity:
          Math.min(
            Math.max(0, task.outcome.finishedAt.getTime() - task.startedAt),
            MAX_TASK_LIFETIME_MS,
          ) / 60_000,
        occurredAt: new Date(task.startedAt).toISOString(),
      }
    : null;
  const saved = await persist(task, { ...terminalPatch(task.outcome), usageReceipt });
  if (saved === "error") return false;
  if (usageReceipt && saved === "written") {
    try {
      const { recordSettledUsageReceipt } = await import("../usage-billing-store");
      await recordSettledUsageReceipt({
        userId: task.userId,
        meter: "computer_minutes",
        sourceType: "computer_task",
        sourceId: task.taskId,
        receipt: usageReceipt,
      });
    } catch (error) {
      log.warn("Computer usage receipt will be retried by the sweep", {
        taskId: task.taskId,
        error: getErrorMessage(error),
      });
    }
  }
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

export function failureOutcome(error: unknown): CloudComputerOutcome {
  if (error instanceof AppError) {
    return { status: "failed", code: error.code || "COMPUTER_FAILED", summary: error.message };
  }
  if (error instanceof DefiniteProviderRejectionError) {
    // 413: the task's history outgrew the API's request size, not a bad task.
    if (error.status === 413) return { ...CONTEXT_LIMIT_OUTCOME };
    return {
      status: "failed",
      code: "COMPUTER_MODEL_REJECTED",
      summary:
        error.status === 400
          ? "The browser task could not continue. Try again; if it repeats, contact support."
          : "The AI provider rejected this request. Try rephrasing the task.",
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
  input: Parameters<typeof executeTaskWithBrowser>[1],
): Promise<void> {
  try {
    await runWithManagedAiSpend({
      userId: task.userId,
      action: "computer.browser",
      model: "browserless/session",
      reserveUsd: BROWSERLESS_RESERVE_USD,
      requestMeta: {
        agent_id: task.agentId,
        task_hash: createHash("sha256").update(task.taskId).digest("hex").slice(0, 24),
        ...(task.usageMetered ? { usage_metered: true } : {}),
      },
      operation: async () => {
        try {
          await executeTaskWithBrowser(task, input);
        } finally {
          // A failed connection has no usable session, and BotBound absorbs
          // that setup attempt. Once connected, include owner-control idle time.
          const connectionMs = task.session?.browserlessConnectionMs ?? 0;
          recordUsage(
            "browserless/session",
            {
              inference_provider: "browserless",
              provider_tool_call_cost_usd: browserlessSessionCostUsd(connectionMs),
              usage: {},
            },
            connectionMs,
          );
        }
      },
    });
  } catch (error) {
    // A failed pre-connection reservation still needs a durable task outcome.
    if (!task.finished) await forceFinish(task, terminalOutcome(failureOutcome(error)));
  }
}

async function executeTaskWithBrowser(
  task: LiveTask,
  input: {
    goal: string;
    startUrl: string | null;
    prepareBrowser: boolean;
    model: string;
    bot: { name: string; role: string; facts: string[]; rules: string[] };
    connection: NonNullable<ReturnType<typeof cloudComputerConnection>>;
  },
): Promise<void> {
  let session: CloudBrowserSession | null = null;
  let outcome: CloudComputerOutcome = { status: "stopped", summary: STOPPED_SUMMARY };
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
    if (input.prepareBrowser && !task.stop) {
      if (input.startUrl) {
        // The owner may choose a start page before the remote browser opens.
        // Navigate before publishing its first frame so the handoff starts on
        // that page. A failed site load still leaves the browser available for
        // the owner to enter another address.
        const opened = await session.execute("navigate", { url: input.startUrl });
        task.currentUrl = displayUrl(session.activeUrl()) || null;
        task.actions += 1;
        pushEvent(task, {
          kind: opened.ok ? "action" : "error",
          text: opened.ok
            ? opened.activity
            : "The starting page did not open. Enter another web address.",
          ...(opened.ok && task.currentUrl ? { url: task.currentUrl } : {}),
          ok: opened.ok,
        });
      }
      if (task.stop) {
        throw new AppError(409, "COMPUTER_TASK_ENDED", "The browser task was stopped.");
      }
      const firstFrame = await session.frame();
      if (!firstFrame) {
        throw AppError.serviceUnavailable("The browser could not open a safe screen. Try again.");
      }
      if (task.stop) {
        throw new AppError(409, "COMPUTER_TASK_ENDED", "The browser task was stopped.");
      }
      task.frame = firstFrame;
      task.frameAt = Date.now();
      task.frameUrl = displayUrl(session.activeUrl()) || null;
      task.preparingBrowser = true;
      pushEvent(task, { kind: "note", text: "Browser ready for you to explore." });
      await waitForComputerOwner(
        task,
        "Browse the web, then tell your Bot what to do from this browser.",
        CLOUD_COMPUTER_LIMITS.ownerReplyWaitMs,
        { takeControl: true },
      );
      task.preparingBrowser = false;
      task.ownerControl = false;
      if (task.stop) {
        outcome = { status: "stopped", summary: STOPPED_SUMMARY };
      } else if (!task.handoffGoal) {
        outcome = {
          status: "blocked",
          summary:
            "The browser setup timed out before a task was given. Start a new browser session.",
          sources: [],
        };
      } else {
        input.goal = task.handoffGoal;
        const currentUrl = session.activeUrl();
        input.startUrl = /^https?:\/\//i.test(currentUrl) ? displayUrl(currentUrl) : null;
      }
    }
    if (!input.prepareBrowser || task.handoffGoal) {
      if (input.startUrl && !input.prepareBrowser && !task.stop) {
        const opened = await session.execute("navigate", { url: input.startUrl });
        task.currentUrl = displayUrl(session.activeUrl()) || null;
        task.actions += 1;
        pushEvent(task, {
          kind: opened.ok ? "action" : "error",
          text: opened.activity,
          url: task.currentUrl || undefined,
          ok: opened.ok,
        });
        const frame = await session.frame();
        if (frame) {
          task.frame = frame;
          task.frameAt = Date.now();
          task.frameUrl = displayUrl(session.activeUrl()) || null;
          task.currentUrl = task.frameUrl;
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
            // A new screen may be a different page; the action callback below
            // restores a pointer only when it belongs to this captured frame.
            task.agentPointer = null;
            task.frame = jpeg;
            task.frameAt = Date.now();
            task.frameUrl = displayUrl(activeSession.activeUrl()) || null;
          },
          cursor: (point) => {
            task.agentPointer = { ...point, at: Date.now() };
          },
          stopRequested: () => task.stop,
          controlRequested: () => task.controlRequested,
          askOwner: (question, waitMs, options) =>
            waitForComputerOwner(task, question, waitMs, options),
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
                requestMeta: {
                  agent_id: task.agentId,
                  task_hash: taskHash,
                  turn,
                  retry,
                  ...(task.usageMetered ? { usage_metered: true } : {}),
                },
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
    }
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
    logUnexpectedBrowserClosure(task);
    await closeSession(session);
  }

  // A provider disconnect is a failed session, even though stopping the
  // executor is how we wake it from a pending owner handoff.
  if (task.expiredBrowser) outcome = EXPIRED_BROWSER_OUTCOME;

  // The watchdog or the shutdown hook may have finished the task already.
  if (finishTask(task, terminalOutcome(outcome))) await persistTerminal(task);
}

/** End a disconnected browser even while the executor is waiting on a model response. */
export function computerHeartbeatDecision(input: {
  finished: boolean;
  expiredBrowser: boolean;
  stopRequested: boolean;
  waitingForOwner: boolean;
  browserClosed: boolean;
  stopAt: number | null;
  startedAt: number;
  now: number;
}): "finished" | "expired_browser" | "continue" | "timeout" {
  if (input.finished) return "finished";
  // A hosted browser can expire during any task phase. Waiting for a model
  // response does not make the disconnected session usable. A prior owner Stop
  // still wins when closing the browser was part of stopping that task.
  if (input.expiredBrowser || (!input.stopRequested && input.browserClosed))
    return "expired_browser";
  const stopIgnored = input.stopAt !== null && input.now - input.stopAt > STOP_GRACE_MS;
  return !stopIgnored && input.now - input.startedAt <= MAX_TASK_LIFETIME_MS
    ? "continue"
    : "timeout";
}

/**
 * One heartbeat: keep the row fresh so other processes see the task alive,
 * or end a disconnected browser or an executor stuck past its limits.
 */
async function heartbeatTick(task: LiveTask, heartbeat: ReturnType<typeof setInterval>) {
  const decision = computerHeartbeatDecision({
    finished: task.finished,
    expiredBrowser: task.expiredBrowser,
    stopRequested: task.stop,
    waitingForOwner: Boolean(task.reply),
    browserClosed: task.session?.isClosed === true,
    stopAt: task.stopAt,
    startedAt: task.startedAt,
    now: Date.now(),
  });
  if (decision === "finished") {
    clearInterval(heartbeat);
    return;
  }
  if (decision === "expired_browser") {
    logUnexpectedBrowserClosure(task);
    task.expiredBrowser = true;
    clearInterval(heartbeat);
    await forceFinish(task, terminalOutcome(EXPIRED_BROWSER_OUTCOME));
    return;
  }
  if (decision === "continue") {
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
        ? task.expiredBrowser
          ? EXPIRED_BROWSER_OUTCOME
          : { status: "stopped", summary: STOPPED_SUMMARY }
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

type OwnerFrameState = Pick<
  LiveTask,
  | "session"
  | "frame"
  | "frameAt"
  | "frameUrl"
  | "currentUrl"
  | "ownerFrameRefresh"
  | "ownerFrameEpoch"
  | "ownerControl"
  | "ownerInputBusy"
  | "finished"
  | "stop"
>;

/** Refresh a paused owner's browser without racing a newer click or navigation. */
export async function refreshComputerOwnerFrame(task: OwnerFrameState): Promise<void> {
  if (
    task.finished ||
    task.stop ||
    !task.ownerControl ||
    task.ownerInputBusy ||
    !task.session ||
    task.session.isClosed
  )
    return;
  if (task.ownerFrameRefresh) return task.ownerFrameRefresh;
  if (Date.now() - task.frameAt < OWNER_FRAME_REFRESH_MS) return;

  const session = task.session;
  const epoch = task.ownerFrameEpoch;
  const capturedAfterFrameAt = task.frameAt;
  const pending = (async () => {
    // frame() checks every open tab before and after the screenshot. A null
    // frame must not leave an older image available after a blocked redirect.
    const jpeg = await session.frame().catch(() => null);
    if (
      task.finished ||
      task.stop ||
      !task.ownerControl ||
      task.ownerInputBusy ||
      task.session !== session ||
      session.isClosed ||
      task.ownerFrameEpoch !== epoch ||
      task.frameAt !== capturedAfterFrameAt
    )
      return;
    task.frame = jpeg;
    task.frameAt = Date.now();
    task.frameUrl = jpeg ? displayUrl(session.activeUrl()) || null : null;
    task.currentUrl = displayUrl(session.activeUrl()) || null;
  })();
  task.ownerFrameRefresh = pending;
  try {
    await pending;
  } finally {
    if (task.ownerFrameRefresh === pending) task.ownerFrameRefresh = null;
  }
}

export async function getComputerFrame(userId: string, taskId: string): Promise<Buffer | null> {
  const task = live.get(taskId);
  if (!task || task.userId !== userId) {
    await ownedRow(userId, taskId);
    return null;
  }
  // A finished task serves the final frame it retained at finish; it is
  // never refreshed, because its browser is gone.
  if (task.finished) return task.frame;
  await refreshComputerOwnerFrame(task);
  return task.frame;
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
  if (task.handoffBusy) {
    throw new AppError(409, "COMPUTER_INPUT_BUSY", "Wait for the browser handoff to finish.");
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
  if (!task || task.userId !== userId || task.finished || task.stop || !task.session) {
    throw new AppError(
      409,
      "COMPUTER_NOT_WAITING",
      "Your Bot is not waiting at a live browser checkpoint.",
    );
  }
  if (task.handoffBusy || task.ownerInputBusy || task.controlRequestSaving) {
    throw new AppError(409, "COMPUTER_INPUT_BUSY", "Wait for the browser action to finish.");
  }
  if (task.session.isClosed) failExpiredBrowser(task);
  if (row.status === "running") {
    if (task.controlRequested) return toView(row);
    task.controlRequestSaving = true;
    try {
      pushEvent(task, { kind: "note", text: "You requested browser control." });
      const saved = await persist(task, {});
      if (saved === "error") {
        throw AppError.serviceUnavailable(
          "The browser control request could not be saved. Check the task and try again.",
        );
      }
      if (saved !== "written") {
        throw new AppError(409, "COMPUTER_NOT_WAITING", "This browser task has ended.");
      }
      // Stop or a newer owner transition may have won while the save awaited.
      // Never publish a queued pause before its save, or re-arm an initial
      // prepared-browser checkpoint as an immediate second pause.
      if (task.stop || task.finished) return toView(await ownedRow(userId, taskId));
      if (task.handoffBusy || task.ownerInputBusy) {
        throw new AppError(409, "COMPUTER_INPUT_BUSY", "Wait for the browser handoff to finish.");
      }
      if (task.reply) {
        task.ownerControl = true;
        task.ownerFrameEpoch += 1;
        task.agentPointer = null;
      } else if (!task.preparingBrowser) {
        task.controlRequested = true;
      }
      return toView(await ownedRow(userId, taskId));
    } finally {
      task.controlRequestSaving = false;
    }
  }
  if (row.status !== "needs_input" || !task.reply) {
    throw new AppError(
      409,
      "COMPUTER_NOT_WAITING",
      "Your Bot is not waiting at a live browser checkpoint.",
    );
  }
  task.controlRequested = false;
  task.handoffBusy = true;
  try {
    task.ownerFrameEpoch += 1;
    task.ownerControl = true;
    task.agentPointer = null;
    if ((await persist(task, { status: "needs_input" })) !== "written") {
      task.ownerControl = false;
      throw new AppError(409, "COMPUTER_NOT_WAITING", "This browser task has ended.");
    }
    return toView({ ...row, status: "needs_input", events: task.events });
  } finally {
    task.handoffBusy = false;
  }
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
  if (task.ownerInputBusy || task.handoffBusy) {
    throw new AppError(
      409,
      "COMPUTER_INPUT_BUSY",
      "Wait for the current browser action to finish.",
    );
  }
  task.ownerInputBusy = true;
  task.ownerFrameEpoch += 1;
  try {
    if (task.session.isClosed) failExpiredBrowser(task);
    let frame: Buffer;
    try {
      frame = await task.session.executeOwnerInput(input);
    } catch {
      if (task.session.isClosed) failExpiredBrowser(task);
      // Browser errors may include page-provided strings or entered values.
      // Keep them out of API output, logs, and the task ledger.
      throw new AppError(
        409,
        "COMPUTER_INPUT_FAILED",
        "That browser action did not go through. Check the screen and try again.",
      );
    }
    if (task.session.isClosed) failExpiredBrowser(task);
    if (task.stop || task.finished || !task.ownerControl) {
      throw new AppError(
        409,
        "COMPUTER_TASK_ENDED",
        "This browser task is no longer in your control.",
      );
    }
    task.frame = frame;
    task.frameAt = Date.now();
    task.frameUrl = displayUrl(task.session.activeUrl()) || null;
    task.currentUrl = displayUrl(task.session.activeUrl()) || task.currentUrl;
    return toView({ ...row, status: "needs_input", events: task.events });
  } finally {
    task.ownerInputBusy = false;
  }
}

/** Ephemeral owner-requested files never become task evidence or public assets. */
export async function getComputerDownload(
  userId: string,
  taskId: string,
  downloadId: string,
): Promise<{ name: string; data: Buffer }> {
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
      "Take control of this browser to retrieve its files.",
    );
  }
  if (task.session.isClosed) failExpiredBrowser(task);
  if (!/^download-[1-9]\d*$/.test(downloadId))
    throw AppError.notFound("That browser file is no longer available.");
  const download = task.session.ownerDownload(downloadId);
  if (!download) throw AppError.notFound("That browser file is no longer available.");
  return download;
}

export async function returnComputerControlToBot(
  userId: string,
  taskId: string,
  body?: unknown,
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
  if (task.ownerInputBusy || task.handoffBusy) {
    throw new AppError(
      409,
      "COMPUTER_INPUT_BUSY",
      "Wait for the current browser action to finish.",
    );
  }

  task.handoffBusy = true;
  try {
    const handoffGoal = task.preparingBrowser
      ? parseGoal(body && typeof body === "object" ? (body as Record<string, unknown>).goal : null)
      : null;

    const resume = task.reply;
    if (task.session.isClosed) failExpiredBrowser(task);
    let frame: Buffer | null;
    try {
      frame = await task.session.frame();
    } catch {
      frame = null;
    }
    if (!frame) {
      if (task.session.isClosed) failExpiredBrowser(task);
      throw new AppError(
        409,
        "COMPUTER_SCREEN_UNAVAILABLE",
        "The browser could not confirm a safe screen. Keep control and try again after the page settles.",
      );
    }
    if (task.session.isClosed) failExpiredBrowser(task);
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
    task.frameUrl = displayUrl(task.session.activeUrl()) || null;
    task.currentUrl = displayUrl(task.session.activeUrl()) || task.currentUrl;
    task.ownerFrameEpoch += 1;
    task.ownerControl = false;
    const saved = await persist(task, {
      status: "running",
      question: null,
      ...(handoffGoal ? { goal: handoffGoal } : {}),
    });
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
    task.session.cancelCurrentInput();
    if (task.stop || task.finished || task.reply !== resume) {
      throw new AppError(
        409,
        "COMPUTER_TASK_ENDED",
        "This browser task is no longer waiting for you.",
      );
    }
    if (handoffGoal) {
      task.handoffGoal = handoffGoal;
      task.preparingBrowser = false;
    }
    pushEvent(task, { kind: "note", text: "You returned browser control to your Bot." });
    // The model gets a fixed handoff signal, never the owner's typed values.
    resume(
      "The owner returned browser control. Inspect the current redacted screen before deciding whether the step succeeded. Ask the owner again if you still need help.",
    );
    return toView({
      ...row,
      status: "running",
      goal: handoffGoal ?? row.goal,
      question: null,
      events: task.events,
    });
  } finally {
    task.handoffBusy = false;
  }
}

/** Test seam: clear in-process state between cases. */
export function __resetCloudComputerRunnerForTests(fixtures: LiveTask[] = []) {
  live.clear();
  for (const task of fixtures) live.set(task.taskId, task);
}
