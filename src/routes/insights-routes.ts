/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";

import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, gte, lt, or, sql, count } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import * as insightsAi from "../lib/insights-ai";
import { aiErr } from "../lib/ai-response-helpers";
import { cachedInsight, setCachedInsight } from "../lib/insights-cache";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const DEFAULT_AGENT_ROLE = "customer_service";

type FailureModeSourceRow = {
  summary: string | null;
  transcript: string | null;
  leadScore: number | null;
  intentLabel: string | null;
};

function buildFastFailureModes(rows: FailureModeSourceRow[]) {
  const counts = { noIntent: 0, lowIntent: 0, lowScore: 0 };
  for (const row of rows) {
    if (row.intentLabel === "none") counts.noIntent += 1;
    else if (row.intentLabel === "low") counts.lowIntent += 1;
    else if (row.leadScore != null && row.leadScore < 30) counts.lowScore += 1;
  }
  const severity = (count: number) => (count >= 8 ? "high" : count >= 3 ? "medium" : "low");
  return [
    {
      failure_type: "No clear intent",
      severity: severity(counts.noIntent),
      fix_target: "Opening prompt",
      count: counts.noIntent,
      recommended_fix:
        "Confirm the caller's goal earlier and offer a clear fallback when intent stays ambiguous.",
    },
    {
      failure_type: "Low caller intent",
      severity: severity(counts.lowIntent),
      fix_target: "Conversation flow",
      count: counts.lowIntent,
      recommended_fix:
        "Shorten the opening, confirm the caller's goal, and present one concrete next step.",
    },
    {
      failure_type: "Low qualification score",
      severity: severity(counts.lowScore),
      fix_target: "Qualification",
      count: counts.lowScore,
      recommended_fix:
        "Tighten qualification questions and make the success criteria explicit before handoff.",
    },
  ].filter((mode) => mode.count > 0);
}

import { computeDailyBrief } from "../lib/daily-brief";

/**
 * LLM-backed Insights endpoints (topics / failure-modes / daily-brief).
 * enforce24hSpendCap is intentionally a no-op telemetry stub — this limiter
 * is the real cost-abuse brake. 20/hour covers interactive refresh while
 * blocking unbounded `?refresh=1` loops.
 */
const insightsAiRateLimit = createRateLimiter({
  bucket: "api:insights-ai",
  windowMs: 60 * 60 * 1000,
  max: 20,
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
      const apptWhere = and(
        eq(schema.appointments.userId, userId),
        gte(schema.appointments.createdAt, since),
      );
      const leadWhere = and(
        eq(schema.outboundLeads.userId, userId),
        gte(schema.outboundLeads.createdAt, since),
      );

      // Single pooled client for the fan-out — see the agent-performance query
      // below: root Drizzle queries each check out their own tenant-scoped
      // client against a five-connection serverless pool.
      const [callRows, apptRows, leadRows] = await drizzle.transaction((tx) =>
        Promise.all([
          tx
            .select({
              totalCalls: count(),
              connected:
                sql<number>`count(*) filter (where coalesce(${schema.callLogs.durationSeconds}, 0) > 10)`.mapWith(
                  Number,
                ),
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

router.get(
  "/api/insights/heatmap",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const buckets = await drizzle
        .select({
          weekday: sql<number>`extract(dow from ${schema.callLogs.createdAt})::int`.mapWith(Number),
          hour: sql<number>`extract(hour from ${schema.callLogs.createdAt})::int`.mapWith(Number),
          count: count(),
          avgScore:
            sql<number>`coalesce(round(avg(coalesce(${schema.callLogs.leadScore}, 0))), 0)::int`.mapWith(
              Number,
            ),
        })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since)))
        .groupBy(
          sql`extract(dow from ${schema.callLogs.createdAt})`,
          sql`extract(hour from ${schema.callLogs.createdAt})`,
        );

      const bucketMap = new Map<string, { c: number; s: number }>();
      for (const row of buckets) {
        bucketMap.set(`${row.weekday}-${row.hour}`, { c: row.count, s: row.avgScore });
      }

      const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
      for (let w = 0; w < 7; w++) {
        for (let h = 0; h < 24; h++) {
          const b = bucketMap.get(`${w}-${h}`) || { c: 0, s: 0 };
          grid.push({
            weekday: w,
            hour: h,
            count: b.c,
            avg_score: b.c ? b.s : 0,
          });
        }
      }
      res.json({ window_days: days, grid });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

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
        Promise.all([
          tx
            .select({
              id: schema.agents.id,
              name: schema.agents.name,
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
              avgScore:
                sql<number>`coalesce(round(avg(coalesce(${schema.callLogs.leadScore}, 0))), 0)::int`.mapWith(
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
        .sort((a: any, b: any) => b.qualified - a.qualified);

      res.json({ window_days: days, agents: rows });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

router.get(
  "/api/insights/topics",
  authenticateUser,
  insightsAiRateLimit,
  enforce24hSpendCap,
  enforceSpendCap,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const force = req.query.refresh === "1";
      const cacheKey = `topics:${req.user.id}`;
      if (!force) {
        const cached = cachedInsight(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });
      }
      if (!insightsAi.isInsightsAiAvailable()) {
        return res
          .status(503)
          .json({ error: "AI runtime required for topic clustering.", code: "AI_RUNTIME_OFFLINE" });
      }
      const rows = await drizzle
        .select({ summary: schema.callLogs.summary, intentLabel: schema.callLogs.intentLabel })
        .from(schema.callLogs)
        .where(eq(schema.callLogs.userId, req.user.id))
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(120);

      if (!rows || rows.length < 3) {
        return res.json({
          topics: [],
          total_analyzed: rows?.length || 0,
          message: "Not enough data yet — run more calls.",
        });
      }
      const result = await insightsAi.clusterTopics({
        summaries: rows.map((r: any) => ({
          summary: r.summary || "",
          intent_label: r.intentLabel,
        })),
        windowDays: 14,
      });
      setCachedInsight(cacheKey, result);
      res.json({ ...result, cached: false });
    } catch (e) {
      if (e instanceof AppError) throw e;
      aiErr(res, e);
    }
  },
);

router.get(
  "/api/insights/failure-modes",
  authenticateUser,
  insightsAiRateLimit,
  enforce24hSpendCap,
  enforceSpendCap,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const force = req.query.refresh === "1";
      const cacheKey = `failures:${req.user.id}`;
      if (!force) {
        const cached = cachedInsight(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });
      }
      const rows = await drizzle
        .select({
          summary: schema.callLogs.summary,
          transcript: schema.callLogs.transcript,
          leadScore: schema.callLogs.leadScore,
          intentLabel: schema.callLogs.intentLabel,
        })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, req.user.id),
            or(
              lt(schema.callLogs.leadScore, 30),
              eq(schema.callLogs.intentLabel, "low"),
              eq(schema.callLogs.intentLabel, "none"),
            ),
          ),
        )
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(20);

      if (!rows || rows.length < 2) {
        return res.json({
          modes: [],
          message: "Not enough failed calls yet — system is performing well.",
        });
      }

      if (!force) {
        const result = { modes: buildFastFailureModes(rows), analysis_mode: "fast" as const };
        setCachedInsight(cacheKey, result);
        return res.json({ ...result, cached: false });
      }

      // Only the explicit `?refresh=1` deep pass needs a provider. Gating the
      // whole route on AI availability made the instant path — which is pure
      // local aggregation over rows already read — return 503 during any
      // provider outage, which is exactly when it is most useful.
      if (!insightsAi.isInsightsAiAvailable()) {
        return res
          .status(503)
          .json({ error: "AI runtime required for failure analysis.", code: "AI_RUNTIME_OFFLINE" });
      }

      const result = await insightsAi.clusterFailureModes({
        failedCalls: rows.map((r) => ({
          summary: r.summary,
          transcript: r.transcript,
          lead_score: r.leadScore,
          intent_label: r.intentLabel,
        })) as any,
      });
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
