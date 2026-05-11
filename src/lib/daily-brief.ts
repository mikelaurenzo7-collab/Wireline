/**
 * src/lib/daily-brief.ts
 *
 * Logic for computing the Claude-authored daily brief.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { db } from "./server-context";
import * as claudeBrain from "./claude-brain";
import { cachedInsight, setCachedInsight } from "./insights-cache";

export async function computeDailyBrief(userId: string, opts?: { force?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `brief:${userId}:${today}`;
  if (!opts?.force) {
    const cached = cachedInsight(cacheKey);
    if (cached) return { payload: cached, cached: true };
  }
  if (!claudeBrain.isClaudeAvailable()) {
    const err: any = new Error("Claude required for the daily brief.");
    err.code = "CLAUDE_OFFLINE";
    throw err;
  }

  const yStart = new Date(); yStart.setHours(0, 0, 0, 0); yStart.setDate(yStart.getDate() - 1);
  const yEnd   = new Date(yStart); yEnd.setDate(yEnd.getDate() + 1);
  const wStart = new Date(); wStart.setDate(wStart.getDate() - 7);

  const [{ data: yCalls }, { data: wCalls }, { data: appts }, { data: tasks }, { data: leads }, { data: wins }, { data: losses }] = await Promise.all([
    db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, cost, summary, customer_number").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_call_logs").select("lead_score, duration_seconds, cost").eq("user_id", userId).gte("created_at", wStart.toISOString()),
    db.from("wireline_appointments").select("id").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_fleet_tasks").select("priority, description").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    db.from("wireline_outbound_leads").select("id").eq("user_id", userId).eq("status", "Pending"),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).gte("lead_score", 70).order("lead_score", { ascending: false }).limit(3),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("lead_score", 30).order("created_at", { ascending: false }).limit(3),
  ]);

  const yTotal = yCalls?.length || 0;
  const yMinutes = Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
  const yAvgScore = yTotal ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / yTotal) : 0;
  const yHighIntent = (yCalls || []).filter((c: any) => c.intent_label === "high").length;
  const yCost = Number((yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));

  const wDays = 7;
  const wAvgPerDay = (wCalls?.length || 0) / wDays;
  const wAvgScore = wCalls?.length ? (wCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / wCalls.length : 0;
  const wAvgCostPerDay = (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

  const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
  const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
  const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

  const result = await claudeBrain.dailyBrief({
    yesterdayStats: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
      pending_tasks: tasks?.length || 0,
      new_leads: leads?.length || 0,
    },
    weekDelta: {
      calls_pct: Math.round(callsPct),
      score_pct: Math.round(scorePct),
      cost_pct: Math.round(costPct),
    },
    recentWinSamples: (wins || []).map(w => ({ customer: w.customer_number || "Contact", score: w.lead_score || 0, summary: w.summary || "" })),
    recentLossSamples: (losses || []).map(l => ({ customer: l.customer_number || "Contact", score: l.lead_score || 0, summary: l.summary || "" })),
    openTasks: (tasks || []).map((t: any) => ({ priority: t.priority || "medium", description: t.description || "" })),
  });

  setCachedInsight(cacheKey, result);
  return { payload: result, cached: false };
}
