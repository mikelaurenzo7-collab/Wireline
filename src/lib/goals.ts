// ────────────────────────────────────────────────────────────────────────
//  Performance goals — metric catalog + pure progress math.
//
//  A "goal" is a monthly voice-agent target an Account Holder sets, e.g. "book 40
//  appointments this month". The /api/goals route pulls live activity for
//  the current calendar month and this module turns (goal, actual) pairs
//  into progress: percent complete, pace against an even daily run-rate, a
//  status bucket, and a linear end-of-month projection.
//
//  Pure functions only — no DB, no ambient clock. Every time-dependent
//  function takes `now` (defaulting to Date.now()) so tests are
//  deterministic. Month boundaries are computed in UTC, matching the
//  Date-based windowing the insights routes already use.
// ────────────────────────────────────────────────────────────────────────

import { BRAND } from "../constants/brand-colors";

/**
 * Lead score at or above which a call counts as a qualified lead. Mirrors
 * the "Qualified" funnel stage threshold in insights-routes.ts so the Goals
 * tab and the Funnel tab agree on what "qualified" means.
 */
export const QUALIFIED_LEAD_SCORE = 50;

/** Upper bound on a goal target — guards route + UI against absurd input. */
export const MAX_GOAL_TARGET = 10_000_000;

/** Max length of the optional Account Holder-supplied goal label. */
export const MAX_GOAL_LABEL_LENGTH = 80;

const DAY_MS = 86_400_000;

export type GoalMetric =
  | "calls_handled"
  | "appointments_booked"
  | "qualified_leads"
  | "voice_minutes";

export interface GoalMetricDef {
  id: GoalMetric;
  /** Human-readable metric name. */
  label: string;
  /** Plural unit noun, e.g. "calls". */
  unit: string;
  /** One-line description shown in the goal editor. */
  description: string;
  /** Hex accent used by the goal card progress ring. */
  accent: string;
}

/**
 * Canonical metric catalog. Order here is the order the UI renders the
 * "set a goal" tiles. Every metric is computable from call logs +
 * appointments scoped to the current calendar month — see computeActuals.
 */
export const GOAL_METRICS: readonly GoalMetricDef[] = [
  {
    id: "calls_handled",
    label: "Calls handled",
    unit: "calls",
    description: "Total inbound and outbound calls your voice agents complete this month.",
    accent: BRAND.colors.primary,
  },
  {
    id: "appointments_booked",
    label: "Appointments booked",
    unit: "appointments",
    description: "Appointments your agents schedule this month.",
    accent: BRAND.colors.primary,
  },
  {
    id: "qualified_leads",
    label: "Qualified leads",
    unit: "leads",
    description: `Calls that scored ${QUALIFIED_LEAD_SCORE} or higher on lead intent this month.`,
    accent: BRAND.colors.primary,
  },
  {
    id: "voice_minutes",
    label: "Voice minutes",
    unit: "minutes",
    description: "Total connected talk time across your voice agents this month.",
    accent: BRAND.colors.onSurfaceMuted,
  },
];

const METRIC_BY_ID = new Map<string, GoalMetricDef>(GOAL_METRICS.map((m) => [m.id, m]));

/** Type guard — true when `value` is a known goal metric id. */
export function isGoalMetric(value: unknown): value is GoalMetric {
  return typeof value === "string" && METRIC_BY_ID.has(value);
}

/** Look up a metric definition. Throws on an unknown id (callers validate first). */
export function goalMetricDef(metric: GoalMetric): GoalMetricDef {
  const def = METRIC_BY_ID.get(metric);
  if (!def) throw new Error(`Unknown goal metric: ${metric}`);
  return def;
}

/**
 * Coerce + validate an Account Holder-supplied goal target. Accepts a number or a
 * numeric string. Returns a positive integer in [1, MAX_GOAL_TARGET], or
 * null when the input cannot be a valid target.
 */
export function normalizeTarget(input: unknown): number | null {
  const raw = typeof input === "string" ? Number(input.trim()) : input;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < 1 || rounded > MAX_GOAL_TARGET) return null;
  return rounded;
}

/**
 * Normalize an optional Account Holder label: trims whitespace, truncates to
 * MAX_GOAL_LABEL_LENGTH, and collapses empty strings to null.
 */
export function normalizeLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_GOAL_LABEL_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export interface PeriodBounds {
  /** First instant of the current calendar month (UTC). */
  start: Date;
  /** First instant of the next calendar month (UTC) — exclusive end. */
  end: Date;
  /** Stable sortable key for the month, e.g. "2026-05". */
  key: string;
  /** Display label for the month, e.g. "May 2026". */
  label: string;
}

/** Calendar-month bounds (UTC) containing the instant `now`. */
export function currentPeriod(now: number = Date.now()): PeriodBounds {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = start.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, key, label };
}

export type GoalStatus = "achieved" | "ahead" | "on_track" | "behind";

export interface GoalProgress {
  /** Live count/sum for the metric this month. */
  actual: number;
  /** The Account Holder's target. */
  target: number;
  /** actual / target, clamped to [0, 1] — for ring rendering. */
  fraction: number;
  /** Raw completion percent (may exceed 100), rounded to an integer. */
  percent: number;
  /** Units still needed to hit target — 0 once achieved. */
  remaining: number;
  /** Fraction of the month elapsed, in [0, 1]. */
  paceFraction: number;
  /** Linear end-of-month projection at the current run-rate. */
  projected: number;
  /** Whole calendar days remaining in the month, including today. */
  daysLeft: number;
  status: GoalStatus;
}

/**
 * Turn a goal + its live actual into progress. `status` compares the
 * completion fraction against the fraction of the month elapsed:
 *
 *   achieved  — actual has reached the target
 *   ahead     — progress is outrunning the calendar by ≥ 10%
 *   on_track  — progress is within ±10% of an even daily run-rate
 *   behind    — progress is trailing the run-rate by > 10%
 *
 * At the very start of the month there is no run-rate to compare against,
 * so an unmet goal reads as on_track rather than misleadingly "behind".
 */
export function computeGoalProgress(
  goal: { target: number },
  actual: number,
  now: number = Date.now(),
): GoalProgress {
  const { start, end } = currentPeriod(now);
  const target = goal.target;
  const safeActual = Math.max(0, actual);

  const span = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(now - start.getTime(), 0), span);
  const paceFraction = span > 0 ? elapsed / span : 1;

  const fraction = target > 0 ? Math.min(safeActual / target, 1) : 1;
  const percent = target > 0 ? Math.round((safeActual / target) * 100) : 100;
  const remaining = Math.max(0, target - safeActual);

  // Extrapolate the current run-rate across the whole month. With no time
  // elapsed yet there is no rate to extrapolate — fall back to the actual.
  const projected = paceFraction > 0 ? Math.round(safeActual / paceFraction) : safeActual;

  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now) / DAY_MS));

  let status: GoalStatus;
  if (safeActual >= target) {
    status = "achieved";
  } else if (paceFraction <= 0) {
    status = "on_track";
  } else {
    const ratio = safeActual / target / paceFraction;
    if (ratio >= 1.1) status = "ahead";
    else if (ratio >= 0.9) status = "on_track";
    else status = "behind";
  }

  return {
    actual: safeActual,
    target,
    fraction,
    percent,
    remaining,
    paceFraction,
    projected,
    daysLeft,
    status,
  };
}

export interface GoalActuals {
  calls_handled: number;
  appointments_booked: number;
  qualified_leads: number;
  voice_minutes: number;
}

/** A call-log row, narrowed to just the columns the goal math reads. */
export interface GoalCallRow {
  durationSeconds?: number | null;
  leadScore?: number | null;
}

/**
 * Reduce the current month's call-log rows + appointment count into the
 * four goal metrics. Kept pure so the route handler just fetches rows and
 * all the arithmetic is unit-tested here.
 */
export function computeActuals(input: {
  calls: ReadonlyArray<GoalCallRow>;
  appointmentCount: number;
}): GoalActuals {
  let voiceSeconds = 0;
  let qualified = 0;
  for (const c of input.calls) {
    voiceSeconds += Math.max(0, c.durationSeconds ?? 0);
    if ((c.leadScore ?? 0) >= QUALIFIED_LEAD_SCORE) qualified += 1;
  }
  return {
    calls_handled: input.calls.length,
    appointments_booked: Math.max(0, Math.trunc(input.appointmentCount) || 0),
    qualified_leads: qualified,
    voice_minutes: Math.round(voiceSeconds / 60),
  };
}

/** Pull the live actual for a single metric out of a computed GoalActuals. */
export function actualFor(metric: GoalMetric, actuals: GoalActuals): number {
  return actuals[metric];
}
