import { Router, type Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const MAX_DAY_BOUNDARY_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Exact, lightweight operational counts for Call Ops.
 *
 * The call list is deliberately paginated and transcript-bearing; KPI tiles must
 * not infer workspace-wide state from whichever page happens to be loaded. The
 * browser supplies its local midnight as `since`, preserving the user's meaning
 * of "Today" without storing or guessing a workspace timezone here.
 */
router.get(
  "/api/call-ops/metrics",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sinceRaw = String(req.query.since ?? "").trim();
      const since = new Date(sinceRaw);
      const sinceMs = since.getTime();
      const now = Date.now();
      if (
        !sinceRaw ||
        !Number.isFinite(sinceMs) ||
        sinceMs > now + MAX_CLOCK_SKEW_MS ||
        sinceMs < now - MAX_DAY_BOUNDARY_AGE_MS
      ) {
        throw AppError.fromHttpStatus(400, "A valid local day boundary is required");
      }

      const userId = req.user.id;
      const [[todayResult], [taskResult], [agentResult]] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({ count: sql`count(*)` })
            .from(schema.callLogs)
            .where(and(eq(schema.callLogs.userId, userId), gte(schema.callLogs.createdAt, since))),
          tx
            .select({
              pending: sql`count(*)`,
              escalations: sql`count(*) filter (where ${schema.followUpTasks.taskType} = 'human_escalation')`,
            })
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, userId),
                eq(schema.followUpTasks.status, "pending"),
              ),
            ),
          tx
            .select({ count: sql`count(*)` })
            .from(schema.agents)
            .where(eq(schema.agents.userId, userId)),
        ]),
      );

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({
        today: Number(todayResult?.count ?? 0),
        pending: Number(taskResult?.pending ?? 0),
        agents: Number(agentResult?.count ?? 0),
        escalations: Number(taskResult?.escalations ?? 0),
        since: since.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Call Ops metrics failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Call Ops metrics are temporarily unavailable");
    }
  },
);

export default router;
