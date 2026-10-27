import { AppError } from "../lib/api-error";
/**
 * Performance goals API — mounted at /api/goals.
 *
 * A goal is an Account Holder-set monthly Assistants target. Progress is never
 * stored: every read recomputes the live actual from the tenant's call
 * logs + appointments scoped to the current calendar month, so the Goals
 * tab always reflects fresh data.
 *
 *   GET    /api/goals       — metric catalog + this tenant's goals with
 *                             computed monthly progress.
 *   POST   /api/goals       — create or update the goal for a metric
 *                             (upsert on the user_id + metric pair).
 *   DELETE /api/goals/:id   — remove a goal.
 *
 * All routes are tenant-scoped via authenticateUser → req.user.id.
 */
import { Router, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { validateBody, createGoalSchema } from "../lib/api-validation";
import { appointmentsInWindow } from "../lib/appointment-where";
import {
  GOAL_METRICS,
  isGoalMetric,
  goalMetricDef,
  normalizeTarget,
  normalizeLabel,
  currentPeriod,
  computeActuals,
  computeGoalProgress,
  actualFor,
  type GoalMetric,
  type GoalActuals,
} from "../lib/goals";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GoalRow = typeof schema.goals.$inferSelect;

/**
 * Pull the four goal metrics for the calendar month containing `now` from
 * the tenant's call logs + appointments. Two scoped aggregate queries; the
 * arithmetic itself lives in (and is unit-tested by) src/lib/goals.ts.
 */
async function loadMonthActuals(userId: string, now: number): Promise<GoalActuals> {
  const { start, end } = currentPeriod(now);
  const [calls, apptAgg] = await Promise.all([
    drizzle
      .select({
        durationSeconds: schema.callLogs.durationSeconds,
        leadScore: schema.callLogs.leadScore,
      })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, userId),
          gte(schema.callLogs.createdAt, start),
          lt(schema.callLogs.createdAt, end),
        ),
      ),
    drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.appointments)
      // Shared with the Insights funnel: cancelled bookings never count.
      .where(appointmentsInWindow(userId, start, end)),
  ]);
  return computeActuals({ calls, appointmentCount: Number(apptAgg[0]?.count ?? 0) });
}

/** Serialize a goal row + its live progress into the snake_case SPA shape. */
function serializeGoal(row: GoalRow, actuals: GoalActuals, now: number) {
  const metric = row.metric as GoalMetric;
  const def = goalMetricDef(metric);
  const progress = computeGoalProgress({ target: row.target }, actualFor(metric, actuals), now);
  return {
    id: row.id,
    metric,
    metric_label: def.label,
    unit: def.unit,
    accent: def.accent,
    label: row.label ?? null,
    target: row.target,
    actual: progress.actual,
    percent: progress.percent,
    fraction: progress.fraction,
    remaining: progress.remaining,
    pace_fraction: progress.paceFraction,
    projected: progress.projected,
    days_left: progress.daysLeft,
    status: progress.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Stable display order — matches the GOAL_METRICS catalog. */
const METRIC_ORDER = new Map<string, number>(GOAL_METRICS.map((m, i) => [m.id, i]));

/** GET /api/goals — metric catalog + the tenant's goals with progress. */
router.get("/", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const now = Date.now();
    const period = currentPeriod(now);

    const rows = await drizzle.select().from(schema.goals).where(eq(schema.goals.userId, userId));

    const actuals = await loadMonthActuals(userId, now);

    const goals = rows
      .filter((r) => isGoalMetric(r.metric))
      .sort((a, b) => (METRIC_ORDER.get(a.metric) ?? 99) - (METRIC_ORDER.get(b.metric) ?? 99))
      .map((r) => serializeGoal(r, actuals, now));

    res.json({
      period: period.key,
      period_label: period.label,
      metrics: GOAL_METRICS,
      actuals,
      goals,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("GET /api/goals failed", { error: getErrorMessage(err) });
    throw AppError.fromHttpStatus(500, "Failed to load goals");
  }
});

/** POST /api/goals — create or update the goal for a metric. */
router.post(
  "/",
  authenticateUser,
  validateBody(createGoalSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const metric = req.body?.metric;
      if (!isGoalMetric(metric)) {
        throw AppError.fromHttpStatus(400, "Unknown or missing goal metric");
      }
      const target = normalizeTarget(req.body?.target);
      if (target === null) {
        throw AppError.fromHttpStatus(400, "Target must be a whole number of 1 or more");
      }
      const label = normalizeLabel(req.body?.label);

      const now = new Date();
      const [row] = await drizzle
        .insert(schema.goals)
        .values({ userId, metric, target, label, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.goals.userId, schema.goals.metric],
          set: { target, label, updatedAt: now },
        })
        .returning();

      const actuals = await loadMonthActuals(userId, now.getTime());
      res.json({ ok: true, goal: serializeGoal(row, actuals, now.getTime()) });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/goals failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to save goal");
    }
  },
);

/** DELETE /api/goals/:id — remove a goal owned by the calling tenant. */
router.delete("/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) {
      throw AppError.fromHttpStatus(400, "Invalid goal id");
    }
    const [row] = await drizzle
      .delete(schema.goals)
      .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, req.user.id)))
      .returning({ id: schema.goals.id });

    if (!row) throw AppError.fromHttpStatus(404, "Goal not found");
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("DELETE /api/goals/:id failed", { error: getErrorMessage(err) });
    throw AppError.fromHttpStatus(500, "Failed to delete goal");
  }
});

export default router;
