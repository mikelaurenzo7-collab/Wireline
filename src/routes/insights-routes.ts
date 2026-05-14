import { Router, Response } from "express";

import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, gte, lt, or } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import * as claudeBrain from "../lib/claude-brain";
import { claudeErr } from "../lib/claude-response-helpers";
import { cachedInsight, setCachedInsight } from "../lib/insights-cache";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const DEFAULT_AGENT_ROLE = "customer_service";

import { computeDailyBrief } from "../lib/daily-brief";

interface CallRow {
  duration_seconds?: number;
  lead_score?: number;
  intent_label?: string;
  summary?: string;
  created_at: string;
}

interface AgentRow {
  id: string;
  name: string;
  archetype?: string;
  channel?: string;
  role?: string;
}

interface AuditCostRow {
  agent_id?: string;
  cost_usd?: number;
}

router.get("/api/insights/funnel", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [calls, appts, leads] = await Promise.all([
      drizzle.select({ leadScore: schema.callLogs.leadScore, intentLabel: schema.callLogs.intentLabel, durationSeconds: schema.callLogs.durationSeconds, createdAt: schema.callLogs.createdAt }).from(schema.callLogs).where(and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since))),
      drizzle.select({ status: schema.appointments.status, createdAt: schema.appointments.createdAt }).from(schema.appointments).where(and(eq(schema.appointments.userId, req.user.id), gte(schema.appointments.createdAt, since))),
      drizzle.select({ status: schema.outboundLeads.status, createdAt: schema.outboundLeads.createdAt }).from(schema.outboundLeads).where(and(eq(schema.outboundLeads.userId, req.user.id), gte(schema.outboundLeads.createdAt, since))),
    ]);

    const totalCalls = calls?.length || 0;
    const connected = (calls || []).filter((c: any) => (c.durationSeconds || 0) > 10).length;
    const qualified = (calls || []).filter((c: any) => (c.leadScore || 0) >= 50).length;
    const highIntent = (calls || []).filter((c: any) => c.intentLabel === "high").length;
    const bookings = (appts || []).length;
    const completed = (appts || []).filter((a: any) => a.status === "Completed").length;
    const queuedLeads = (leads || []).filter((l: any) => l.status === "Pending" || l.status === "Queued").length;

    res.json({
      window_days: days,
      stages: [
        { name: "Queued",     count: queuedLeads },
        { name: "Calls",      count: totalCalls },
        { name: "Connected",  count: connected },
        { name: "Qualified",  count: qualified },
        { name: "High intent", count: highIntent },
        { name: "Booked",     count: bookings },
        { name: "Completed",  count: completed },
      ],
    });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/heatmap", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const calls = await drizzle
      .select({ createdAt: schema.callLogs.createdAt, leadScore: schema.callLogs.leadScore })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since)));

    const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
    const buckets: Record<string, { c: number; s: number }> = {};
    for (const c of calls || []) {
      const d = new Date(c.createdAt);
      const key = `${d.getDay()}-${d.getHours()}`;
      const b = buckets[key] || { c: 0, s: 0 };
      b.c++;
      b.s += c.leadScore || 0;
      buckets[key] = b;
    }
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const b = buckets[`${w}-${h}`] || { c: 0, s: 0 };
        grid.push({ weekday: w, hour: h, count: b.c, avg_score: b.c ? Math.round(b.s / b.c) : 0 });
      }
    }
    res.json({ window_days: days, grid });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/leaderboard", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [agents, calls, appts, auditLogs] = await Promise.all([
      drizzle.select({ id: schema.agents.id, name: schema.agents.name, archetype: schema.agents.archetype, channel: schema.agents.channel, role: schema.agents.role }).from(schema.agents).where(eq(schema.agents.userId, req.user.id)).limit(500),
      drizzle.select({ agentId: schema.callLogs.agentId, leadScore: schema.callLogs.leadScore, intentLabel: schema.callLogs.intentLabel, durationSeconds: schema.callLogs.durationSeconds, cost: schema.callLogs.cost, createdAt: schema.callLogs.createdAt }).from(schema.callLogs).where(and(eq(schema.callLogs.userId, req.user.id), gte(schema.callLogs.createdAt, since))),
      drizzle.select({ agentId: schema.appointments.agentId }).from(schema.appointments).where(and(eq(schema.appointments.userId, req.user.id), gte(schema.appointments.createdAt, since))),
      drizzle.select({ metadata: schema.auditLog.metadata }).from(schema.auditLog).where(and(eq(schema.auditLog.userId, req.user.id), eq(schema.auditLog.eventType, "ai.api_call"), gte(schema.auditLog.createdAt, since))),
    ]);

    const aiCostByAgent: Record<string, number> = {};
    for (const row of auditLogs || []) {
      const meta = row.metadata as any;
      if (!meta) continue;
      const id = meta.agent_id || "unknown";
      const c = Number(meta.cost_usd) || 0;
      aiCostByAgent[id] = (aiCostByAgent[id] || 0) + c;
    }

    const callsByAgent: Record<string, any[]> = {};
    for (const c of (calls || [])) {
      const id = c.agentId || "unknown";
      (callsByAgent[id] ||= []).push(c);
    }
    const apptsByAgent: Record<string, number> = {};
    for (const a of (appts || [])) {
      const id = a.agentId || "unknown";
      apptsByAgent[id] = (apptsByAgent[id] || 0) + 1;
    }

    const rows = (agents || []).map((a: any) => {
      const agentCalls = callsByAgent[a.id] || [];
      const total = agentCalls.length;
      const qualifiedCount = agentCalls.filter((c) => (c.leadScore || 0) >= 50).length;
      const highIntentCount = agentCalls.filter((c) => c.intentLabel === "high").length;
      const minutes = Math.round(agentCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / 60);
      const cost = Number(agentCalls.reduce((s, c) => s + Number(c.cost || 0), 0).toFixed(2));
      const avgScore = total ? Math.round(agentCalls.reduce((s, c) => s + (c.leadScore || 0), 0) / total) : 0;
      const bookings = apptsByAgent[a.id] || 0;
      const costPerQualified = qualifiedCount ? Number((cost / qualifiedCount).toFixed(2)) : 0;
      const outcomes = qualifiedCount + bookings;
      const costPerOutcome = outcomes ? Number((cost / outcomes).toFixed(2)) : 0;
      const aiCost = Number((aiCostByAgent[a.id] || 0).toFixed(4));
      const totalCost = Number((cost + aiCost).toFixed(4));
      return {
        agent_id: a.id, agent_name: a.name, archetype: a.archetype, role: a.role || DEFAULT_AGENT_ROLE,
        channel: a.channel, total_calls: total, qualified: qualifiedCount, high_intent: highIntentCount,
        bookings, avg_lead_score: avgScore, minutes, cost, ai_cost: aiCost, total_cost: totalCost,
        cost_per_qualified: costPerQualified, cost_per_outcome: costPerOutcome,
        conversion_rate: total ? Math.round((qualifiedCount / total) * 100) : 0,
      };
    }).sort((a: any, b: any) => b.qualified - a.qualified);

    res.json({ window_days: days, agents: rows });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/topics", authenticateUser, enforce24hSpendCap, enforceSpendCap, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `topics:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for topic clustering.", code: "CLAUDE_OFFLINE" });
    }
    const rows = await drizzle
      .select({ summary: schema.callLogs.summary, intentLabel: schema.callLogs.intentLabel })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.userId, req.user.id))
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(120);
    
    if (!rows || rows.length < 3) {
      return res.json({ topics: [], total_analyzed: rows?.length || 0, message: "Not enough data yet — run more calls." });
    }
    const result = await claudeBrain.clusterTopics({
      summaries: rows.map((r: any) => ({ summary: r.summary || "", intent_label: r.intentLabel })),
      windowDays: 14,
    });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/failure-modes", authenticateUser, enforce24hSpendCap, enforceSpendCap, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `failures:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for failure analysis.", code: "CLAUDE_OFFLINE" });
    }

    const rows = await drizzle
      .select({ summary: schema.callLogs.summary, transcript: schema.callLogs.transcript, leadScore: schema.callLogs.leadScore, intentLabel: schema.callLogs.intentLabel })
      .from(schema.callLogs)
      .where(
        and(
          eq(schema.callLogs.userId, req.user.id),
          or(
            lt(schema.callLogs.leadScore, 30),
            eq(schema.callLogs.intentLabel, "low"),
            eq(schema.callLogs.intentLabel, "none")
          )
        )
      )
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(20);

    if (!rows || rows.length < 2) {
      return res.json({ modes: [], message: "Not enough failed calls yet — system is performing well." });
    }
    const result = await claudeBrain.clusterFailureModes({ failedCalls: rows.map(r => ({ summary: r.summary, transcript: r.transcript, lead_score: r.leadScore, intent_label: r.intentLabel })) as any });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/daily-brief", authenticateUser, enforce24hSpendCap, enforceSpendCap, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { payload, cached } = await computeDailyBrief(req.user.id, { force: req.query.refresh === "1" });
    res.json({ ...payload, cached });
  } catch (e: any) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: err.message, code: err.code });
    claudeErr(res, e);
  }
});

export default router;
