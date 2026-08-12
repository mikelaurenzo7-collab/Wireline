import { Router, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { getCachedNavCounts, setCachedNavCounts } from "../lib/nav-counts-cache";
import { ACTIVE_OPERATOR_TASK_STATUSES } from "../lib/operator-work-status";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import * as schema from "../db/schema";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * Canonical attention counts for authenticated navigation.
 *
 * An operator item remains owned until completed/cancelled, so pending, open,
 * and in-progress must all keep their attention badge. This route shadows the
 * historical pending-only implementation without widening unrelated dashboard
 * behavior.
 */
router.get(
  "/api/nav-counts",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const cached = getCachedNavCounts(userId);
      if (cached) return res.json(cached);

      const [[workResult], [emailResult], [outboundResult], liveSignals] =
        await drizzle.transaction((tx) =>
          serialQueryBatch([
            tx
              .select({ count: sql`count(*)` })
              .from(schema.followUpTasks)
              .where(
                and(
                  eq(schema.followUpTasks.userId, userId),
                  inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES]),
                ),
              ),
            tx
              .select({ count: sql`count(*)` })
              .from(schema.emailThreads)
              .where(
                and(eq(schema.emailThreads.userId, userId), eq(schema.emailThreads.read, false)),
              ),
            tx
              .select({ count: sql`count(*)` })
              .from(schema.outboundLeads)
              .where(
                and(
                  eq(schema.outboundLeads.userId, userId),
                  eq(schema.outboundLeads.status, "Queued"),
                ),
              ),
            tx
              .select({ label: schema.signalPresence.label })
              .from(schema.signalPresence)
              .where(eq(schema.signalPresence.userId, userId)),
          ]),
        );

      const activeWorkCount = Number(workResult?.count ?? 0);
      const emailCount = Number(emailResult?.count ?? 0);
      const outboundCount = Number(outboundResult?.count ?? 0);
      const distressedCount = (liveSignals || []).filter(
        (signal: { label: string | null }) =>
          typeof signal.label === "string" && signal.label.startsWith("⚠"),
      ).length;

      const counts = {
        "/overview": activeWorkCount,
        "/inbox": emailCount,
        "/phone": activeWorkCount + outboundCount + distressedCount,
      };
      setCachedNavCounts(userId, counts);
      res.json(counts);
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.warn("nav-counts truth route failed", {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({
        error: "Nav badge counts are temporarily unavailable.",
        code: "NAV_COUNTS_UNAVAILABLE",
      });
    }
  },
);

export default router;
