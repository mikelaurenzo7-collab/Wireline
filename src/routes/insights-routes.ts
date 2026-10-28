/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { LEGACY_CALL_REVIEW_FAILURE_NOTES } from "../lib/call-review-note";

import { drizzle, serialQueryBatch } from "../lib/server-context";
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

const DEFAULT_AGENT_ROLE = "customer_service";
const reviewableLeadScore = sql<number | null>`CASE
  WHEN btrim(coalesce(${schema.callLogs.coachingNote}, '')) IN (${LEGACY_CALL_REVIEW_FAILURE_NOTES[0]}, ${LEGACY_CALL_REVIEW_FAILURE_NOTES[1]}) THEN NULL
  ELSE coalesce(${schema.callLogs.leadScore}, 0)
END`;

import { computeDailyBrief } from "../lib/daily-brief";
import { appointmentsInWindow } from "../lib/appointment-where";
import { createInsightsSingleFlight } from "../lib/insights-single-flight";

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

// Keep the legacy API available for existing clients; the Leaderboard UI remains retired.
router.get(
  "/api/insights/leaderboard",
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
      const apptWhere = and(
        eq(schema.appointments.userId, userId),
        gte(schema.appointments.createdAt, since),
      );

      const [agents, callStats, apptStats, aiCostStats] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              id: schema.agents.id,
              name: schema.agents.name,
              markKey: schema.agents.markKey,
              archetype: schema.agents.archetype,
              channel: schema.agents.channel,
              role: schema.agents.role,
            })
            .from(schema.agents)
            .where(eq(schema.agents.userId, userId))
            .limit(500),
          tx
            .select({
              agentId: schema.callLogs.agentId,
              totalCalls: count(),
              qualified:
                sql<number>`count(*) filter (where coalesce(${schema.callLogs.leadScore}, 0) >= 50)`.mapWith(
                  Number,
                ),
              highIntent:
                sql<number>`count(*) filter (where ${schema.callLogs.intentLabel} = 'high')`.mapWith(
                  Number,
                ),
              minutes:
                sql<number>`coalesce(round(sum(coalesce(${schema.callLogs.durationSeconds}, 0)) / 60.0), 0)::int`.mapWith(
                  Number,
                ),
              cost: sql<string>`coalesce(sum(coalesce(${schema.callLogs.cost}, 0)), 0)`.mapWith(
                String,
              ),
              avgScore: sql<number>`coalesce(round(avg(${reviewableLeadScore})), 0)::int`.mapWith(
                Number,
              ),
            })
            .from(schema.callLogs)
            .where(callWhere)
            .groupBy(schema.callLogs.agentId),
          tx
            .select({
              agentId: schema.appointments.agentId,
              bookings: count(),
            })
            .from(schema.appointments)
            .where(apptWhere)
            .groupBy(schema.appointments.agentId),
          tx
            .select({
              agentId:
                sql<string>`coalesce(${schema.auditLog.metadata}->>'agent_id', 'unknown')`.mapWith(
                  String,
                ),
              aiCost:
                sql<string>`coalesce(sum(coalesce((${schema.auditLog.metadata}->>'cost_usd')::numeric, 0)), 0)`.mapWith(
                  String,
                ),
            })
            .from(schema.auditLog)
            .where(
              and(
                eq(schema.auditLog.userId, userId),
                eq(schema.auditLog.eventType, "ai.api_call"),
                gte(schema.auditLog.createdAt, since),
              ),
            )
            .groupBy(sql`coalesce(${schema.auditLog.metadata}->>'agent_id', 'unknown')`),
        ]),
      );

      const callByAgent = new Map((callStats || []).map((r) => [r.agentId || "unknown", r]));
      const apptsByAgent = new Map(
        (apptStats || []).map((r) => [r.agentId || "unknown", r.bookings ?? 0]),
      );
      const aiCostByAgent = new Map(
        (aiCostStats || []).map((r) => [r.agentId, Number(r.aiCost || 0)]),
      );

      const rows = (agents || [])
        .map((a: any) => {
          const stats = callByAgent.get(a.id);
          const total = stats?.totalCalls ?? 0;
          const qualifiedCount = stats?.qualified ?? 0;
          const highIntentCount = stats?.highIntent ?? 0;
          const minutes = stats?.minutes ?? 0;
          const cost = Number(Number(stats?.cost ?? 0).toFixed(2));
          const avgScore = stats?.avgScore ?? 0;
          const bookings = apptsByAgent.get(a.id) ?? 0;
          const costPerQualified = qualifiedCount ? Number((cost / qualifiedCount).toFixed(2)) : 0;
          const outcomes = qualifiedCount + bookings;
          const costPerOutcome = outcomes ? Number((cost / outcomes).toFixed(2)) : 0;
          const aiCost = Number((aiCostByAgent.get(a.id) ?? 0).toFixed(4));
          const totalCost = Number((cost + aiCost).toFixed(4));
          return {
            agent_id: a.id,
            agent_name: a.name,
            mark_key: a.markKey,
            archetype: a.archetype,
            role: a.role || DEFAULT_AGENT_ROLE,
            channel: a.channel,
            total_calls: total,
            qualified: qualifiedCount,
            high_intent: highIntentCount,
            bookings,
            avg_lead_score: avgScore,
            minutes,
            cost,
            ai_cost: aiCost,
            total_cost: totalCost,
            cost_per_qualified: costPerQualified,
            cost_per_outcome: costPerOutcome,
            conversion_rate: total ? Math.round((qualifiedCount / total) * 100) : 0,
          };
        })
        .sort(
          (
            a: { bookings: number; total_calls: number },
            b: { bookings: number; total_calls: number },
          ) => b.bookings - a.bookings || b.total_calls - a.total_calls,
        );

      res.json({ window_days: days, agents: rows });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

/**
 * Compute the topic clusters for one tenant/window.
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

const topicFlights = createInsightsSingleFlight<Awaited<ReturnType<typeof computeTopics>>>();

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
      }
      if (!insightsAi.isInsightsAiAvailable()) {
        return res
          .status(503)
          .json({ error: "AI runtime required for topic clustering.", code: "AI_RUNTIME_OFFLINE" });
      }
      // Await the owner request: withAudit captures usage at response end.
      // Returning first would leave the provider spend outside that capture.
      // Concurrent reads for the same tenant/window share the computation.
      const result = await topicFlights.run(cacheKey, async () => {
        const computed = await computeTopics(req.user.id, days);
        setCachedInsight(cacheKey, computed);
        return computed;
      });
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
