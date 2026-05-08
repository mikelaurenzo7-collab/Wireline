// ────────────────────────────────────────────────────────────────────────
//  Contact profile math.
//
//  /api/contacts/:number drives the entire ContactProfile page (a route
//  inside the load-bearing list per AGENTS.md). Previously inline ~80
//  lines of timeline merging + stat aggregation + customer-name match
//  duplicated three times in the route handler.
//
//  Extracted here so the customer-name match is defined once, the
//  timeline contract is testable, and the stat shapes can't drift
//  between the route and any future caller (CSV export, contact-card
//  Claude prompts, etc.).
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface CallLogRow {
  id: string;
  agent_id?: string | null;
  direction?: string | null;
  customer_number?: string | null;
  duration_seconds?: number | null;
  cost?: number | string | null;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  lead_score?: number | null;
  intent_label?: string | null;
  created_at: string;
}

export interface OutboundLeadRow {
  id: string;
  agent_id?: string | null;
  customer_name?: string | null;
  status?: string | null;
  context?: string | null;
  last_called_at?: string | null;
  created_at: string;
  phone_number?: string | null;
}

export interface AppointmentRow {
  id: string;
  agent_id?: string | null;
  customer_name?: string | null;
  service_type?: string | null;
  date?: string | null;
  time?: string | null;
  status?: string | null;
  created_at: string;
}

export type TimelineEntryType = "call_in" | "call_out" | "appointment";

export interface TimelineEntry {
  type: TimelineEntryType;
  id: string;
  ts: string;
  agent_id?: string | null;
  // Call-only
  duration_seconds?: number | null;
  cost?: number | string | null;
  summary?: string | null;
  lead_score?: number | null;
  intent_label?: string | null;
  recording_url?: string | null;
  // Appointment-only
  status?: string | null;
}

export interface ContactStats {
  total_calls: number;
  total_minutes: number;
  total_cost: number;
  avg_lead_score: number;
  last_touch: string | null;
  outbound_leads: number;
  appointments: number;
}

export interface ContactProfile {
  number: string;
  normalized: string;
  customer_name: string | null;
  stats: ContactStats;
  timeline: TimelineEntry[];
  leads: OutboundLeadRow[];
  appointments: AppointmentRow[];
}

// Normalize a phone number to its last-10-digit form for matching.
// Returns "" when the input has no digits, which the route handler
// uses to reject the request as invalid.
export function normalizePhoneTail(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

// Case-insensitive trim-equal. Used for matching a candidate
// customer_name (from a lead or appointment row) to the canonical name
// we picked for the contact. Centralised so the same comparison rule
// runs in three places (timeline, stats, response.appointments) without
// drifting.
export function nameMatches(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

// NaN-safe ms timestamp so a single bad created_at doesn't throw or
// stably-sort to the top.
function ts(s: string | null | undefined): number {
  const t = new Date(s || "").getTime();
  return Number.isFinite(t) ? t : 0;
}

function callLogToTimeline(c: CallLogRow): TimelineEntry {
  return {
    type: c.direction === "inbound" ? "call_in" : "call_out",
    id: c.id,
    ts: c.created_at,
    duration_seconds: c.duration_seconds ?? null,
    cost: c.cost ?? null,
    summary: c.summary ?? null,
    lead_score: c.lead_score ?? null,
    intent_label: c.intent_label ?? null,
    recording_url: c.recording_url ?? null,
    agent_id: c.agent_id ?? null,
  };
}

function appointmentToTimeline(a: AppointmentRow): TimelineEntry {
  return {
    type: "appointment",
    id: a.id,
    ts: a.created_at,
    summary: `${a.service_type ?? "Appointment"} — ${a.date ?? "?"} ${a.time ?? ""}`.trim(),
    status: a.status ?? null,
    agent_id: a.agent_id ?? null,
  };
}

export function buildContactTimeline(input: {
  calls: CallLogRow[];
  appts: AppointmentRow[];
  customerName: string | null;
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const c of input.calls) entries.push(callLogToTimeline(c));
  for (const a of input.appts) {
    // Only include appointments tied to the same customer name —
    // appointments aren't keyed by phone number in our schema, so we
    // match by name. Skips appointments with no customer_name set.
    if (nameMatches(a.customer_name, input.customerName)) {
      entries.push(appointmentToTimeline(a));
    }
  }
  entries.sort((x, y) => ts(y.ts) - ts(x.ts));
  return entries;
}

export function computeContactStats(input: {
  calls: CallLogRow[];
  leads: OutboundLeadRow[];
  appts: AppointmentRow[];
  customerName: string | null;
}): ContactStats {
  const { calls, leads, appts, customerName } = input;
  const totalCalls = calls.length;
  const totalMinutes = Math.round(
    calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60,
  );
  const totalCost = Number(
    calls.reduce((s, c) => s + num(c.cost), 0).toFixed(2),
  );
  const avgScore = totalCalls > 0
    ? Math.round(calls.reduce((s, c) => s + (c.lead_score ?? 0), 0) / totalCalls)
    : 0;
  const lastTouch = calls[0]?.created_at ?? leads[0]?.created_at ?? null;
  const matchingAppts = appts.filter(a => nameMatches(a.customer_name, customerName)).length;

  return {
    total_calls:    totalCalls,
    total_minutes:  totalMinutes,
    total_cost:     totalCost,
    avg_lead_score: avgScore,
    last_touch:     lastTouch,
    outbound_leads: leads.length,
    appointments:   matchingAppts,
  };
}

// Full assembly used by the route handler. Pull the candidate
// customer_name from the first matching lead or appointment, then
// compose timeline + stats + filtered appointments.
export function buildContactProfile(input: {
  number: string;
  normalized: string;
  calls: CallLogRow[];
  leads: OutboundLeadRow[];
  appts: AppointmentRow[];
}): ContactProfile {
  const { number, normalized, calls, leads, appts } = input;
  const customerName = leads[0]?.customer_name ?? appts[0]?.customer_name ?? null;
  const timeline = buildContactTimeline({ calls, appts, customerName });
  const stats = computeContactStats({ calls, leads, appts, customerName });
  const matchingAppts = appts.filter(a => nameMatches(a.customer_name, customerName));

  return {
    number,
    normalized,
    customer_name: customerName,
    stats,
    timeline,
    leads,
    appointments: matchingAppts,
  };
}
