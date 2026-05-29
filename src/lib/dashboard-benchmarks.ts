// ────────────────────────────────────────────────────────────────────────
//  Dashboard performance benchmarks math.
//
//  /api/dashboard/benchmarks compares the operator's actual 30-day stats
//  against industry-average reference points so the PerformanceBenchmarks
//  panel on the Dashboard's Brief tab can render the comparison bars.
//
//  Previously inline ~60 lines of aggregation + the entire benchmark
//  reference table in the route handler. Extracted so:
//    1. The reference numbers (and tips) are visible/editable in one
//       place rather than buried in server.ts.
//    2. The aggregation has unit tests that pin every metric's rule
//       (avg over rows, hot-lead threshold, contact-status whitelist,
//       utilization clamp).
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface CallLogRow {
  duration_seconds?: number | null;
  lead_score?: number | null;
  intent_label?: string | null;
  cost?: number | string | null;
  qa_score?: number | null;
}

export interface OutboundLeadRow {
  status?: string | null;
}

export type BetterWhen = "higher" | "lower" | "closer";

export interface BenchmarkEntry {
  label: string;
  user: number;
  benchmark: number;
  unit: string;
  better_when: BetterWhen;
  tip: string;
}

export interface DashboardBenchmarks {
  call_volume: BenchmarkEntry;
  avg_duration: BenchmarkEntry;
  lead_score: BenchmarkEntry;
  conversion_rate: BenchmarkEntry;
  contact_rate: BenchmarkEntry;
  agent_utilization: BenchmarkEntry;
}

export const HOT_LEAD_THRESHOLD = 70;

// "Contacted" outbound statuses — anything that means the agent
// successfully reached the lead, regardless of outcome. Used as the
// numerator for contact-rate. Centralised so the InsightsView funnel
// and any future caller stay consistent.
export const CONTACTED_STATUSES = new Set(["Completed", "Interested", "Callback"]);

// Reference benchmarks — research-based industry averages for AI voice
// agents. The label/unit/better_when/tip strings are operator-facing,
// so changing them means updating snapshots / UI assumptions; the
// numbers are calibration knobs.
export const BENCHMARK_TARGETS = {
  call_volume: {
    label: "Monthly Call Volume",
    benchmark: 150,
    unit: "calls",
    better_when: "higher" as BetterWhen,
    tip: "Run an outbound campaign to increase volume — aim for 5-10 calls per hour per agent.",
  },
  avg_duration: {
    label: "Avg Call Duration",
    benchmark: 180,
    unit: "sec",
    better_when: "closer" as BetterWhen,
    tip: "Calls under 60s often indicate hang-ups. Calls over 5min may mean the agent isn't qualifying fast enough.",
  },
  lead_score: {
    label: "Avg Lead Score",
    benchmark: 55,
    unit: "/ 100",
    better_when: "higher" as BetterWhen,
    tip: "Improve lead score by refining your agent's qualification questions in Agent Training.",
  },
  conversion_rate: {
    label: "Hot Lead Rate",
    benchmark: 22,
    unit: "%",
    better_when: "higher" as BetterWhen,
    tip: "Hot lead rate below 10% usually means targeting issues. Review your outbound lead list quality.",
  },
  contact_rate: {
    label: "Outbound Contact Rate",
    benchmark: 35,
    unit: "%",
    better_when: "higher" as BetterWhen,
    tip: "Contact rate improves with better timing — try calling between 10am-12pm and 4pm-6pm local time.",
  },
  agent_utilization: {
    label: "Agent Utilization",
    benchmark: 70,
    unit: "%",
    better_when: "higher" as BetterWhen,
    tip: "Deploy more agents or increase your outbound campaign volume to improve utilization.",
  },
};

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

export function computeDashboardBenchmarks(input: {
  calls: CallLogRow[];
  leads: OutboundLeadRow[];
  agentCount: number;
}): { benchmarks: DashboardBenchmarks; total_calls: number } {
  const { calls, leads, agentCount } = input;

  const totalCalls = calls.length;
  const totalDuration = calls.reduce((s, c) => s + num(c.duration_seconds), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  const hotLeadsCount = calls.filter((c) => num(c.lead_score) >= HOT_LEAD_THRESHOLD).length;
  const conversionRate = totalCalls > 0 ? Math.round((hotLeadsCount / totalCalls) * 100) : 0;

  const totalLeadScore = calls.reduce((s, c) => s + num(c.lead_score), 0);
  const avgLeadScore = totalCalls > 0 ? Math.round(totalLeadScore / totalCalls) : 0;

  const dialedLeads = leads.length;
  const contactedLeads = leads.filter(
    (l) => l.status != null && CONTACTED_STATUSES.has(l.status),
  ).length;
  const contactRate = dialedLeads > 0 ? Math.round((contactedLeads / dialedLeads) * 100) : 0;

  // Utilization is "what % of an agent's nominal monthly capacity
  // (~100 calls / month) is being used", capped at 100. With zero
  // agents it's 0 — we don't divide by zero.
  const utilization =
    agentCount > 0 ? Math.min(100, Math.round((totalCalls / (agentCount * 100)) * 100)) : 0;

  const benchmarks: DashboardBenchmarks = {
    call_volume: { ...BENCHMARK_TARGETS.call_volume, user: totalCalls },
    avg_duration: { ...BENCHMARK_TARGETS.avg_duration, user: avgDuration },
    lead_score: { ...BENCHMARK_TARGETS.lead_score, user: avgLeadScore },
    conversion_rate: { ...BENCHMARK_TARGETS.conversion_rate, user: conversionRate },
    contact_rate: { ...BENCHMARK_TARGETS.contact_rate, user: contactRate },
    agent_utilization: { ...BENCHMARK_TARGETS.agent_utilization, user: utilization },
  };

  return { benchmarks, total_calls: totalCalls };
}
