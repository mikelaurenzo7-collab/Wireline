/**
 * Director Client Intelligence
 * ----------------------------
 * Turns each operator's raw activity (calls, bookings, pipeline, fleet tasks,
 * voice telemetry) into a proactive, per-account "Situation Report" plus
 * concrete per-agent DIRECTION the Director can act on every turn.
 *
 * Goal: nothing slips through the cracks. The Director should open each
 * conversation already knowing where this client is losing money and exactly
 * how to tune their fleet to win it back.
 *
 * Read-only and defensive: every query is wrapped so a degraded signal never
 * breaks a Director turn — callers fall back to basic week stats.
 */
import { and, eq, gte, lt, sql, inArray, isNotNull } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { HOT_LEAD_THRESHOLD } from "./dashboard-benchmarks";
import { getErrorMessage } from "./server-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-agent performance window (days) — long enough to be statistically meaningful. */
const AGENT_WINDOW_DAYS = 14;
/** Minimum calls before per-agent quality verdicts are trustworthy. */
const MIN_CALLS_FOR_VERDICT = 8;
/** A qualified/demo deal with no contact in this many days is "stalled". */
const STALLED_DEAL_DAYS = 5;

export interface DirectorAgentDirection {
  agentId: string;
  agentName: string;
  calls: number;
  bookings: number;
  bookRate: number; // 0..1
  avgLeadScore: number;
  negativeRate: number; // 0..1
  avgCsat: number | null; // 1..5
  avgTtftMs: number | null;
  errorRate: number; // 0..1 (stt|tts|pipeline)
  /** Single-line health verdict: Healthy | Watch | Critical | Underused | Quiet. */
  verdict: "Healthy" | "Watch" | "Critical" | "Underused" | "Quiet";
  /** Ordered, concrete tuning recommendations for THIS agent. */
  recommendations: string[];
}

export interface DirectorClientIntelligence {
  ok: true;
  funnel: {
    calls7d: number;
    bookings7d: number;
    callsPrev7d: number;
    bookingsPrev7d: number;
    /** Booking conversion this week, 0..1 (bookings / calls). */
    bookRate7d: number;
    /** Signed % change in call volume vs prior week (e.g. -18 = down 18%). */
    callsTrendPct: number | null;
    /** Signed % change in bookings vs prior week. */
    bookingsTrendPct: number | null;
  };
  openTasks: number;
  /** Hot callers (leadScore >= threshold) in 7d that never converted to a booking. */
  uncapturedHotLeads: number;
  /** Outbound leads whose scheduled callback is now overdue. */
  overdueCallbacks: number;
  /** Qualified/demo-stage deals with no recent contact. */
  stalledDeals: number;
  /** Negative-sentiment or low-CSAT calls in 7d needing recovery. */
  recoveryNeeded: number;
  /** Per-agent direction, worst-performing first. */
  agents: DirectorAgentDirection[];
}

export type DirectorClientIntelligenceResult = DirectorClientIntelligence | { ok: false };

export function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * Load and compute the full per-account intelligence. Never throws; returns
 * `{ ok: false }` if the headline queries fail so callers can degrade.
 */
export async function loadDirectorClientIntelligence(
  userId: string,
): Promise<DirectorClientIntelligenceResult> {
  try {
    const now = Date.now();
    const since7d = new Date(now - 7 * DAY_MS);
    const sincePrev7d = new Date(now - 14 * DAY_MS);
    const sinceAgentWindow = new Date(now - AGENT_WINDOW_DAYS * DAY_MS);
    const stalledBefore = new Date(now - STALLED_DEAL_DAYS * DAY_MS);
    const nowTs = new Date(now);

    const realCall = and(eq(schema.callLogs.demo, false));

    const [
      callsRow,
      bookingsRow,
      callsPrevRow,
      bookingsPrevRow,
      hotRow,
      overdueRow,
      stalledRow,
      recoveryRow,
      tasksRow,
      agentRows,
    ] = await Promise.all([
      // calls last 7d (real only)
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, since7d),
            realCall,
          ),
        ),
      // bookings last 7d
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.userId, userId),
            gte(schema.appointments.createdAt, since7d),
            eq(schema.appointments.demo, false),
          ),
        ),
      // calls prior 7d (7-14d ago)
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, sincePrev7d),
            lt(schema.callLogs.createdAt, since7d),
            realCall,
          ),
        ),
      // bookings prior 7d
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.userId, userId),
            gte(schema.appointments.createdAt, sincePrev7d),
            lt(schema.appointments.createdAt, since7d),
            eq(schema.appointments.demo, false),
          ),
        ),
      // uncaptured hot leads: hot score in 7d but outcome not booked
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, since7d),
            realCall,
            gte(schema.callLogs.leadScore, HOT_LEAD_THRESHOLD),
            sql`coalesce(${schema.callLogs.outcomeTag}, '') <> 'booked'`,
          ),
        ),
      // overdue callbacks
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, userId),
            isNotNull(schema.outboundLeads.callbackScheduledAt),
            lt(schema.outboundLeads.callbackScheduledAt, nowTs),
            sql`coalesce(${schema.outboundLeads.status}, '') not in ('Completed', 'Blocked-DNC', 'Max-Attempts')`,
          ),
        ),
      // stalled deals: qualified/demo stage, no recent contact
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, userId),
            inArray(schema.outboundLeads.pipelineStage, ["qualified", "demo"]),
            sql`coalesce(${schema.outboundLeads.lastCalledAt}, ${schema.outboundLeads.callbackScheduledAt}, to_timestamp(0)) < ${stalledBefore}`,
          ),
        ),
      // recovery needed: negative sentiment or low CSAT in 7d
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, since7d),
            realCall,
            sql`(${schema.callLogs.sentiment} = 'negative' or ${schema.callLogs.csatScore} <= 2)`,
          ),
        ),
      // open fleet tasks
      drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.fleetTasks)
        .where(
          and(
            eq(schema.fleetTasks.userId, userId),
            inArray(schema.fleetTasks.status, ["pending", "open", "in_progress"]),
          ),
        ),
      // per-agent performance over the agent window
      drizzle
        .select({
          agentId: schema.callLogs.agentId,
          calls: sql<number>`count(*)::int`,
          booked: sql<number>`count(*) filter (where ${schema.callLogs.outcomeTag} = 'booked')::int`,
          avgScore: sql<number>`coalesce(avg(${schema.callLogs.leadScore}), 0)::float`,
          negatives: sql<number>`count(*) filter (where ${schema.callLogs.sentiment} = 'negative')::int`,
          csatSum: sql<number>`coalesce(sum(${schema.callLogs.csatScore}), 0)::float`,
          csatCount: sql<number>`count(${schema.callLogs.csatScore})::int`,
          ttftSum: sql<number>`coalesce(sum(${schema.callLogs.ttftMs}), 0)::float`,
          ttftCount: sql<number>`count(${schema.callLogs.ttftMs})::int`,
          errors: sql<number>`count(*) filter (where ${schema.callLogs.sttError} = true or ${schema.callLogs.ttsError} = true or ${schema.callLogs.pipelineError} is not null)::int`,
        })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            gte(schema.callLogs.createdAt, sinceAgentWindow),
            realCall,
            isNotNull(schema.callLogs.agentId),
          ),
        )
        .groupBy(schema.callLogs.agentId),
    ]);

    // Resolve agent names for the directions.
    const agentIds = agentRows.map((r) => r.agentId).filter((x): x is string => Boolean(x));
    const nameRows = agentIds.length
      ? await drizzle
          .select({ id: schema.agents.id, name: schema.agents.name })
          .from(schema.agents)
          .where(and(eq(schema.agents.userId, userId), inArray(schema.agents.id, agentIds)))
      : [];
    const nameById = new Map(nameRows.map((r) => [r.id, r.name]));

    const calls7d = callsRow[0]?.n ?? 0;
    const bookings7d = bookingsRow[0]?.n ?? 0;
    const callsPrev7d = callsPrevRow[0]?.n ?? 0;
    const bookingsPrev7d = bookingsPrevRow[0]?.n ?? 0;

    const agents = agentRows
      .filter((r) => r.agentId)
      .map((r) => buildAgentDirection(r, nameById.get(r.agentId as string) ?? "Agent"))
      .sort((a, b) => verdictRank(b.verdict) - verdictRank(a.verdict) || a.bookRate - b.bookRate);

    return {
      ok: true,
      funnel: {
        calls7d,
        bookings7d,
        callsPrev7d,
        bookingsPrev7d,
        bookRate7d: calls7d > 0 ? bookings7d / calls7d : 0,
        callsTrendPct: pct(calls7d, callsPrev7d),
        bookingsTrendPct: pct(bookings7d, bookingsPrev7d),
      },
      openTasks: tasksRow[0]?.n ?? 0,
      uncapturedHotLeads: hotRow[0]?.n ?? 0,
      overdueCallbacks: overdueRow[0]?.n ?? 0,
      stalledDeals: stalledRow[0]?.n ?? 0,
      recoveryNeeded: recoveryRow[0]?.n ?? 0,
      agents,
    };
  } catch (e) {
    log.warn("director client intelligence failed", { error: getErrorMessage(e), userId });
    return { ok: false };
  }
}

export interface AgentAggRow {
  agentId: string | null;
  calls: number;
  booked: number;
  avgScore: number;
  negatives: number;
  csatSum: number;
  csatCount: number;
  ttftSum: number;
  ttftCount: number;
  errors: number;
}

export function verdictRank(v: DirectorAgentDirection["verdict"]): number {
  switch (v) {
    case "Critical":
      return 4;
    case "Watch":
      return 3;
    case "Underused":
      return 2;
    case "Quiet":
      return 1;
    default:
      return 0;
  }
}

/** Turn one aggregate row into a verdict + ordered tuning recommendations. */
export function buildAgentDirection(row: AgentAggRow, agentName: string): DirectorAgentDirection {
  const calls = row.calls ?? 0;
  const bookings = row.booked ?? 0;
  const bookRate = calls > 0 ? bookings / calls : 0;
  const avgLeadScore = Math.round(row.avgScore ?? 0);
  const negativeRate = calls > 0 ? (row.negatives ?? 0) / calls : 0;
  const avgCsat = row.csatCount > 0 ? Math.round((row.csatSum / row.csatCount) * 10) / 10 : null;
  const avgTtftMs = row.ttftCount > 0 ? Math.round(row.ttftSum / row.ttftCount) : null;
  const errorRate = calls > 0 ? (row.errors ?? 0) / calls : 0;

  const recommendations: string[] = [];
  const enoughData = calls >= MIN_CALLS_FOR_VERDICT;

  // Technical / voice-health issues come first — they suppress everything else.
  if (avgTtftMs !== null && avgTtftMs > 1200) {
    recommendations.push(
      `Latency is high (avg ${avgTtftMs}ms to first token, target <900ms). Switch to a faster voice/model or check the pipeline — callers feel the lag.`,
    );
  }
  if (errorRate > 0.1 && calls >= 5) {
    recommendations.push(
      `${Math.round(errorRate * 100)}% of calls hit an STT/TTS/pipeline error. Review voice provider config and transcriber settings before scaling this agent.`,
    );
  }

  // Conversion tuning.
  if (enoughData && bookRate < 0.1) {
    recommendations.push(
      `Only ${Math.round(bookRate * 100)}% of calls book (${bookings}/${calls}). Tighten the booking ask: have it propose two concrete time slots and confirm before hanging up.`,
    );
  } else if (enoughData && bookRate < 0.2) {
    recommendations.push(
      `Booking rate is ${Math.round(bookRate * 100)}% — middling. A/B a more assertive close and an SMS booking-link fallback when the caller hesitates.`,
    );
  }

  // Lead quality / targeting.
  if (enoughData && avgLeadScore < 40) {
    recommendations.push(
      `Average lead score is low (${avgLeadScore}). Add sharper qualifying questions up front so it spends time on real buyers, and route weak leads to a nurture flow.`,
    );
  }

  // Sentiment / CSAT.
  if (enoughData && negativeRate > 0.25) {
    recommendations.push(
      `${Math.round(negativeRate * 100)}% of calls end negative. Soften the script's tone, add an empathy/acknowledge step, and shorten hold/transfer waits.`,
    );
  }
  if (avgCsat !== null && avgCsat <= 3 && row.csatCount >= 3) {
    recommendations.push(
      `CSAT is ${avgCsat}/5. Pull 3 recent low-rated transcripts, fix the recurring friction, and re-test before the next campaign.`,
    );
  }

  // Utilization.
  if (calls === 0) {
    recommendations.push(
      `No calls in the last ${AGENT_WINDOW_DAYS} days. Either point a number/campaign at it or pause it so it isn't dead weight.`,
    );
  } else if (calls < 3) {
    recommendations.push(
      `Very low volume (${calls} calls). It's not getting enough traffic to prove out — feed it a campaign or consolidate into a stronger agent.`,
    );
  }

  // High performer — scale it.
  if (enoughData && bookRate >= 0.35 && negativeRate < 0.15) {
    recommendations.push(
      `Strong performer (${Math.round(bookRate * 100)}% booking, low friction). Clone its script/voice to weaker agents and give it more volume.`,
    );
  }

  // Verdict.
  let verdict: DirectorAgentDirection["verdict"];
  if (calls === 0) verdict = "Quiet";
  else if (
    (avgTtftMs !== null && avgTtftMs > 1200) ||
    (errorRate > 0.1 && calls >= 5) ||
    (enoughData && (bookRate < 0.1 || negativeRate > 0.25))
  )
    verdict = "Critical";
  else if (calls < 3) verdict = "Underused";
  else if (
    enoughData &&
    (bookRate < 0.2 || avgLeadScore < 40 || (avgCsat !== null && avgCsat <= 3))
  )
    verdict = "Watch";
  else verdict = "Healthy";

  if (verdict === "Healthy" && recommendations.length === 0) {
    recommendations.push(
      `Performing well (${calls} calls, ${Math.round(bookRate * 100)}% booking). Hold the line and consider scaling volume.`,
    );
  }

  return {
    agentId: row.agentId as string,
    agentName,
    calls,
    bookings,
    bookRate,
    avgLeadScore,
    negativeRate,
    avgCsat,
    avgTtftMs,
    errorRate,
    verdict,
    recommendations,
  };
}

function signed(n: number | null): string {
  if (n === null) return "n/a";
  return n >= 0 ? `+${n}%` : `${n}%`;
}

/**
 * Render the intelligence into a compact, prompt-ready Situation Report.
 * Returns "" when there's genuinely nothing to flag (clean account).
 */
export function renderSituationReport(intel: DirectorClientIntelligence): string {
  const lines: string[] = [];
  const f = intel.funnel;

  lines.push("LIVE SITUATION REPORT (auto-computed from this account's real data):");
  lines.push(
    `- Funnel (7d): ${f.calls7d} calls (${signed(f.callsTrendPct)} WoW), ${f.bookings7d} bookings (${signed(f.bookingsTrendPct)} WoW), ${Math.round(f.bookRate7d * 100)}% booking rate.`,
  );

  // Money-left-on-the-table, highest priority first.
  const gaps: string[] = [];
  if (intel.uncapturedHotLeads > 0)
    gaps.push(
      `${intel.uncapturedHotLeads} HOT caller(s) (score ≥ ${HOT_LEAD_THRESHOLD}) did NOT book this week — these are the fastest dollars to recover via follow-up call/SMS.`,
    );
  if (intel.overdueCallbacks > 0)
    gaps.push(
      `${intel.overdueCallbacks} scheduled callback(s) are now overdue — promise broken, win them back today.`,
    );
  if (intel.stalledDeals > 0)
    gaps.push(
      `${intel.stalledDeals} qualified/demo deal(s) have gone cold (${STALLED_DEAL_DAYS}+ days no contact).`,
    );
  if (intel.recoveryNeeded > 0)
    gaps.push(
      `${intel.recoveryNeeded} unhappy caller(s) (negative sentiment / low CSAT) need recovery outreach.`,
    );
  if (intel.openTasks > 0) gaps.push(`${intel.openTasks} open fleet task(s) awaiting action.`);

  if (gaps.length) {
    lines.push("- Slipping through the cracks:");
    gaps.forEach((g) => lines.push(`  • ${g}`));
  }

  // Per-agent direction — only surface agents that need attention (worst first).
  const needsAttention = intel.agents.filter((a) => a.verdict !== "Healthy").slice(0, 4);
  if (needsAttention.length) {
    lines.push("- Fleet direction (per-agent tuning to recommend):");
    for (const a of needsAttention) {
      const top = a.recommendations[0] ?? "Review recent transcripts.";
      lines.push(`  • ${a.agentName} [${a.verdict}] — ${top}`);
    }
  }

  if (gaps.length === 0 && needsAttention.length === 0) {
    lines.push(
      "- No critical gaps right now. Focus on scaling volume on the best agents and proactive growth ideas.",
    );
  }

  lines.push(
    "Use this to lead with the single highest-impact opportunity, tie advice to these numbers, and convert items into ready-to-approve actions/integration_jobs.",
  );

  return lines.join("\n");
}
