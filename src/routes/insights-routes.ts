/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";

import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import * as insightsAi from "../lib/insights-ai";
import { aiErr } from "../lib/ai-response-helpers";
import { cachedInsight, setCachedInsight } from "../lib/insights-cache";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import { withAudit } from "../middleware/audit-middleware";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

import { computeDailyBrief } from "../lib/daily-brief";
import { appointmentsInWindow } from "../lib/appointment-where";

/**
 * LLM-backed Insights endpoints (topics / daily-brief).
 * enforce24hSpendCap is intentionally a no-op telemetry stub — this limiter
 * is the real cost-abuse brake. 20/hour covers interactive refresh while
 * blocking unbounded `?refresh=1` loops.
 */
const insightsAiRateLimit = createRateLimiter({
  bucket: "api:insights-ai",
  windowMs: 60 * 60 * 1000,
  max: 20,
  failClosedOnError: true,
});

router.get(
  "/api/insights/funnel",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const userId = req.user.id;
      const callWhere = and(
        eq(schema.callLogs.userId, userId),
        gte(schema.callLogs.createdAt, since),
      );
      const apptWhere = appointmentsInWindow(userId, since);
      const leadWhere = and(
        eq(schema.outboundLeads.userId, userId),
        gte(schema.outboundLeads.createdAt, since),
      );

      // Single pooled client for the fan-out — see the agent-performance query
      // below: root Drizzle queries each check out their own tenant-scoped
      // client against a five-connection serverless pool.
      const [callRows, apptRows, leadRows] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              totalCalls: count(),
              // "Connected" mirrors the one call-outcome taxonomy
              // (src/lib/call-outcome.ts): a call connected when it has
              // duration and does NOT classify as missed — the old
              // duration>10 threshold counted a 29s missed call as
              // Connected while the call list showed it as Missed.
              connected:
                sql<number>`count(*) filter (where coalesce(${schema.callLogs.durationSeconds}, 0) > 0 and not (
                  (lower(coalesce(${schema.callLogs.outcomeTag}, '')) in ('unreachable', 'missed', 'voicemail')
                    or lower(coalesce(${schema.callLogs.endedReason}, '')) ~ 'silence-timed-out|voicemail|machine-detected|customer-busy|no-answer|did-not-answer')
                  and not (lower(coalesce(${schema.callLogs.outcomeTag}, '')) = 'voicemail' and coalesce(${schema.callLogs.transcript}, '') <> '')
                ))`.mapWith(Number),
              qualified:
                sql<number>`count(*) filter (where coalesce(${schema.callLogs.leadScore}, 0) >= 50)`.mapWith(
                  Number,
                ),
              highIntent:
                sql<number>`count(*) filter (where ${schema.callLogs.intentLabel} = 'high')`.mapWith(
                  Number,
                ),
            })
            .from(schema.callLogs)
            .where(callWhere),
          tx
            .select({
              bookings: count(),
              completed:
                sql<number>`count(*) filter (where ${schema.appointments.status} = 'Completed')`.mapWith(
                  Number,
                ),
            })
            .from(schema.appointments)
            .where(apptWhere),
          tx
            .select({
              queuedLeads:
                sql<number>`count(*) filter (where ${schema.outboundLeads.status} in ('Pending', 'Queued'))`.mapWith(
                  Number,
                ),
            })
            .from(schema.outboundLeads)
            .where(leadWhere),
        ]),
      );

      const callAgg = callRows[0];
      const apptAgg = apptRows[0];
      const leadAgg = leadRows[0];
      const totalCalls = callAgg?.totalCalls ?? 0;
      const connected = callAgg?.connected ?? 0;
      const qualified = callAgg?.qualified ?? 0;
      const highIntent = callAgg?.highIntent ?? 0;
      const bookings = apptAgg?.bookings ?? 0;
      const completed = apptAgg?.completed ?? 0;
      const queuedLeads = leadAgg?.queuedLeads ?? 0;

      res.json({
        window_days: days,
        stages: [
          { name: "Queued", count: queuedLeads },
          { name: "Calls", count: totalCalls },
          { name: "Connected", count: connected },
          { name: "Qualified", count: qualified },
          { name: "High intent", count: highIntent },
          { name: "Booked", count: bookings },
          { name: "Completed", count: completed },
        ],
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

/**
 * Compute + cache the topic clusters for one tenant/window. Extracted so the
 * request path can run it in the background (see the route below).
 */
async function computeTopics(userId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await drizzle
    .select({ summary: schema.callLogs.summary, intentLabel: schema.callLogs.intentLabel })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.userId, userId), gte(schema.callLogs.createdAt, since)))
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(120);

  if (!rows || rows.length < 3) {
    return {
      topics: [],
      total_analyzed: rows?.length || 0,
      message: "Not enough data yet, run more calls.",
    };
  }
  return insightsAi.clusterTopics({
    summaries: rows.map((r: any) => ({
      summary: r.summary || "",
      intent_label: r.intentLabel,
    })),
    windowDays: days,
  });
}

router.get(
  "/api/insights/topics",
  authenticateUser,
  insightsAiRateLimit,
  enforce24hSpendCap,
  enforceSpendCap,
  // enforceSpendCap above reads auditLog.costUsd, so without recording this
  // route's own spend the cap could never be tripped by Insights usage.
  withAudit("insights"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const force = req.query.refresh === "1";
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
      // The cache key carries the window: different windows cluster different
      // call sets (the old per-user-only key served one window's clusters for
      // every window, and the query ignored the window entirely).
      const cacheKey = `topics:${req.user.id}:${days}`;
      if (!force) {
        const cached = cachedInsight(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });
        // Stale-while-revalidate: clustering is a synchronous LLM round-trip
        // over up to 120 summaries and took ~60s in the page-load path. A
        // cold read now answers immediately with a pending state and fills
        // the cache in the background; the client polls until it lands.
        if (insightsAi.isInsightsAiAvailable()) {
          void computeTopics(req.user.id, days)
            .then((result) => setCachedInsight(cacheKey, result))
            .catch((error) => log.error("Background topic clustering failed", { error }));
        }
        return res.json({ topics: [], total_analyzed: 0, pending: true, cached: false });
      }
      if (!insightsAi.isInsightsAiAvailable()) {
        return res
          .status(503)
          .json({ error: "AI runtime required for topic clustering.", code: "AI_RUNTIME_OFFLINE" });
      }
      const result = await computeTopics(req.user.id, days);
      setCachedInsight(cacheKey, result);
      res.json({ ...result, cached: false });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

router.get(
  "/api/insights/daily-brief",
  authenticateUser,
  insightsAiRateLimit,
  enforce24hSpendCap,
  enforceSpendCap,
  withAudit("insights"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { payload, cached } = await computeDailyBrief(req.user.id, {
        force: req.query.refresh === "1",
      });
      res.json({ ...payload, cached });
    } catch (e: any) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "CLAUDE_OFFLINE")
        return res.status(503).json({ error: err.message, code: err.code });
      aiErr(res, e);
    }
  },
);

export default router;
