import { Router, Response } from "express";

import { db } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import * as claudeBrain from "../lib/claude-brain";
import { claudeErr } from "../lib/claude-response-helpers";
import { cachedInsight, setCachedInsight } from "../lib/insights-cache";
import { enforceSpendCap, enforce24hSpendCap } from "../lib/spend-guards";
import { enforceClaudeDailyTokenQuota } from "../middleware/claude-quota-middleware";
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
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: calls }, { data: appts }, { data: leads }] = await Promise.all([
      db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, created_at").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("status").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_outbound_leads").select("status").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const totalCalls = calls?.length || 0;
    const connected = (calls || []).filter((c: CallRow) => (c.duration_seconds || 0) > 10).length;
    const qualified = (calls || []).filter((c: CallRow) => (c.lead_score || 0) >= 50).length;
    const highIntent = (calls || []).filter((c: CallRow) => c.intent_label === "high").length;
    const bookings = (appts || []).length;
    const completed = (appts || []).filter((a: { status?: string }) => a.status === "Completed").length;
    const queuedLeads = (leads || []).filter((l: { status?: string }) => l.status === "Pending" || l.status === "Queued").length;

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
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: calls } = await db
      .from("wireline_call_logs")
      .select("created_at, lead_score")
      .eq("user_id", req.user.id)
      .gte("created_at", since);

    const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
    const buckets: Record<string, { c: number; s: number }> = {};
    for (const c of calls || []) {
      const d = new Date(c.created_at);
      const key = `${d.getDay()}-${d.getHours()}`;
      const b = buckets[key] || { c: 0, s: 0 };
      b.c++;
      b.s += c.lead_score || 0;
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
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: agents }, { data: calls }, { data: appts }, { data: auditCosts }] = await Promise.all([
      db.from("wireline_agents").select("id, name, archetype, channel, role").eq("user_id", req.user.id).limit(500),
      db.from("wireline_call_logs").select("agent_id, lead_score, intent_label, duration_seconds, cost, created_at").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("agent_id").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_audit_log").select("metadata->agent_id, metadata->cost_usd").eq("user_id", req.user.id).eq("event_type", "ai.api_call").eq("provider", "anthropic").gte("created_at", since),
    ]);

    const aiCostByAgent: Record<string, number> = {};
    for (const row of auditCosts || []) {
      const r = row as unknown as AuditCostRow;
      const id = r.agent_id || "unknown";
      const c = Number(r.cost_usd) || 0;
      aiCostByAgent[id] = (aiCostByAgent[id] || 0) + c;
    }

    const callsByAgent: Record<string, CallRow[]> = {};
    for (const c of (calls || []) as CallRow[]) {
      const id = (c as CallRow & { agent_id?: string }).agent_id || "unknown";
      (callsByAgent[id] ||= []).push(c);
    }
    const apptsByAgent: Record<string, number> = {};
    for (const a of (appts || []) as Array<{ agent_id?: string }>) apptsByAgent[a.agent_id || "unknown"] = (apptsByAgent[a.agent_id || "unknown"] || 0) + 1;

    const rows = (agents || []).map((a: AgentRow) => {
      const agentCalls = callsByAgent[a.id] || [];
      const total = agentCalls.length;
      const qualifiedCount = agentCalls.filter((c) => (c.lead_score || 0) >= 50).length;
      const highIntentCount = agentCalls.filter((c) => c.intent_label === "high").length;
      const minutes = Math.round(agentCalls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60);
      const cost = Number(agentCalls.reduce((s, c) => s + Number((c as CallRow & { cost?: number }).cost || 0), 0).toFixed(2));
      const avgScore = total ? Math.round(agentCalls.reduce((s, c) => s + (c.lead_score || 0), 0) / total) : 0;
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
    }).sort((a: { qualified: number }, b: { qualified: number }) => b.qualified - a.qualified);

    res.json({ window_days: days, agents: rows });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/topics", authenticateUser, enforce24hSpendCap, enforceSpendCap, enforceClaudeDailyTokenQuota, async (req: AuthenticatedRequest, res: Response) => {
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
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, intent_label")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (!rows || rows.length < 3) {
      return res.json({ topics: [], total_analyzed: rows?.length || 0, message: "Not enough data yet — run more calls." });
    }
    const result = await claudeBrain.clusterTopics({
      summaries: rows.map((r: { summary?: string; intent_label?: string }) => ({ summary: r.summary || "", intent_label: r.intent_label })),
      windowDays: 14,
    });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/failure-modes", authenticateUser, enforce24hSpendCap, enforceSpendCap, enforceClaudeDailyTokenQuota, async (req: AuthenticatedRequest, res: Response) => {
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
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("user_id", req.user.id)
      .or("lead_score.lt.30,intent_label.eq.low,intent_label.eq.none")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!rows || rows.length < 2) {
      return res.json({ modes: [], message: "Not enough failed calls yet — system is performing well." });
    }
    const result = await claudeBrain.clusterFailureModes({ failedCalls: rows as Parameters<typeof claudeBrain.clusterFailureModes>[0]["failedCalls"] });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

router.get("/api/insights/daily-brief", authenticateUser, enforce24hSpendCap, enforceSpendCap, enforceClaudeDailyTokenQuota, async (req: AuthenticatedRequest, res: Response) => {
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
