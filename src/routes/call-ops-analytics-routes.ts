import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { CalendarTimeError, normalizeIanaTimeZone } from "../lib/calendar-time";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * Exact analytics for Call Ops without moving transcript-bearing call rows into
 * the browser. Weekday buckets are computed in the browser's validated IANA
 * timezone so the chart matches the user's local calendar even across DST.
 */
router.get(
  "/api/call-ops/analytics",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      let timeZone: string;
      try {
        timeZone = normalizeIanaTimeZone(req.query.timezone, "UTC");
      } catch (error) {
        if (error instanceof CalendarTimeError) {
          throw AppError.fromHttpStatus(400, error.message);
        }
        throw error;
      }

      const userId = req.user.id;
      const weekdayExpression = sql<number>`extract(dow from timezone(${timeZone}, ${schema.callLogs.createdAt}))::int`;

      const [[aggregate], weekdayRows] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              totalCalls: sql`count(*)`,
              totalSeconds: sql`coalesce(sum(${schema.callLogs.durationSeconds}), 0)`,
              avgQaScore: sql`avg(${schema.callLogs.qaScore})`,
            })
            .from(schema.callLogs)
            .where(eq(schema.callLogs.userId, userId)),
          tx
            .select({
              weekday: weekdayExpression,
              count: sql`count(*)`,
            })
            .from(schema.callLogs)
            .where(eq(schema.callLogs.userId, userId))
            .groupBy(weekdayExpression)
            .orderBy(weekdayExpression),
        ]),
      );

      const totalCalls = Number(aggregate?.totalCalls ?? 0);
      const totalSeconds = Number(aggregate?.totalSeconds ?? 0);
      const avgQaScoreRaw = aggregate?.avgQaScore;
      const avgQaScore =
        avgQaScoreRaw === null || avgQaScoreRaw === undefined ? null : Number(avgQaScoreRaw);
      const weekdayCounts = new Array<number>(7).fill(0);
      for (const row of weekdayRows || []) {
        const weekday = Number(row.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
        weekdayCounts[weekday] = Number(row.count ?? 0);
      }

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({
        totalCalls,
        totalSeconds,
        avgDurationSeconds: totalCalls > 0 ? totalSeconds / totalCalls : 0,
        avgQaScore: Number.isFinite(avgQaScore ?? Number.NaN) ? avgQaScore : null,
        weekdayCounts,
        timeZone,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Call Ops analytics failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Call Ops analytics are temporarily unavailable");
    }
  },
);

export default router;
