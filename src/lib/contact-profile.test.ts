import { describe, it, expect } from "vitest";
import {
  normalizePhoneTail,
  nameMatches,
  buildContactTimeline,
  computeContactStats,
  buildContactProfile,
  type CallLogRow,
  type OutboundLeadRow,
  type AppointmentRow,
} from "./contact-profile";

const T = (offsetSec: number) =>
  new Date(Date.UTC(2026, 4, 7, 12) + offsetSec * 1000).toISOString();

const call = (p: Partial<CallLogRow>): CallLogRow => ({
  id: p.id ?? "c1",
  agent_id: p.agent_id ?? null,
  direction: p.direction ?? "outbound",
  customer_number: p.customer_number ?? null,
  duration_seconds: p.duration_seconds ?? null,
  cost: p.cost ?? null,
  summary: p.summary ?? null,
  transcript: p.transcript ?? null,
  recording_url: p.recording_url ?? null,
  lead_score: p.lead_score ?? null,
  intent_label: p.intent_label ?? null,
  created_at: p.created_at ?? T(0),
});

const lead = (p: Partial<OutboundLeadRow>): OutboundLeadRow => ({
  id: p.id ?? "l1",
  agent_id: p.agent_id ?? null,
  customer_name: p.customer_name ?? null,
  status: p.status ?? null,
  context: p.context ?? null,
  last_called_at: p.last_called_at ?? null,
  created_at: p.created_at ?? T(0),
  phone_number: p.phone_number ?? null,
});

const appt = (p: Partial<AppointmentRow>): AppointmentRow => ({
  id: p.id ?? "a1",
  agent_id: p.agent_id ?? null,
  customer_name: p.customer_name ?? null,
  service_type: p.service_type ?? null,
  date: p.date ?? null,
  time: p.time ?? null,
  status: p.status ?? null,
  created_at: p.created_at ?? T(0),
});

describe("normalizePhoneTail", () => {
  it("strips non-digits and returns last 10", () => {
    expect(normalizePhoneTail("+1 (415) 555-1234")).toBe("4155551234");
    expect(normalizePhoneTail("415-555-1234")).toBe("4155551234");
  });

  it("returns up to 10 digits when input is shorter", () => {
    expect(normalizePhoneTail("12345")).toBe("12345");
  });

  it("returns empty string for digit-less input", () => {
    expect(normalizePhoneTail("xyz!!!")).toBe("");
    expect(normalizePhoneTail("")).toBe("");
  });
});

describe("nameMatches", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(nameMatches("  Alice  ", "alice")).toBe(true);
    expect(nameMatches("ALICE", "alice")).toBe(true);
  });

  it("returns false for null/undefined/empty on either side", () => {
    expect(nameMatches(null, "alice")).toBe(false);
    expect(nameMatches("alice", null)).toBe(false);
    expect(nameMatches("", "alice")).toBe(false);
    expect(nameMatches(undefined, "alice")).toBe(false);
  });

  it("returns false for genuinely different names", () => {
    expect(nameMatches("alice", "bob")).toBe(false);
  });
});

describe("buildContactTimeline", () => {
  it("emits inbound calls as call_in and outbound as call_out", () => {
    const out = buildContactTimeline({
      calls: [
        call({ id: "in", direction: "inbound", created_at: T(2) }),
        call({ id: "out", direction: "outbound", created_at: T(1) }),
      ],
      appts: [],
      customerName: null,
    });
    expect(out.find(e => e.id === "in")!.type).toBe("call_in");
    expect(out.find(e => e.id === "out")!.type).toBe("call_out");
  });

  it("sorts newest-first across types", () => {
    const out = buildContactTimeline({
      calls: [
        call({ id: "old", created_at: T(1) }),
        call({ id: "new", created_at: T(3) }),
      ],
      appts: [appt({ id: "appt-mid", customer_name: "alice", created_at: T(2) })],
      customerName: "Alice",
    });
    expect(out.map(e => e.id)).toEqual(["new", "appt-mid", "old"]);
  });

  it("includes appointments only when customer_name matches", () => {
    const out = buildContactTimeline({
      calls: [],
      appts: [
        appt({ id: "match",   customer_name: "Alice" }),
        appt({ id: "nomatch", customer_name: "Bob" }),
      ],
      customerName: "alice",  // case-insensitive
    });
    expect(out.map(e => e.id)).toEqual(["match"]);
  });

  it("excludes all appointments when customerName is null", () => {
    const out = buildContactTimeline({
      calls: [],
      appts: [appt({ customer_name: "Alice" })],
      customerName: null,
    });
    expect(out).toHaveLength(0);
  });

  it("survives invalid created_at values without throwing", () => {
    const out = buildContactTimeline({
      calls: [
        call({ id: "good", created_at: T(5) }),
        call({ id: "bad",  created_at: "not-a-date" }),
      ],
      appts: [],
      customerName: null,
    });
    expect(out[0].id).toBe("good");
    expect(out.map(e => e.id)).toContain("bad");
  });
});

describe("computeContactStats", () => {
  it("aggregates calls and rounds total_cost to 2 decimals", () => {
    const stats = computeContactStats({
      calls: [
        call({ duration_seconds: 90, cost: 0.005, lead_score: 80 }),
        call({ duration_seconds: 30, cost: 0.123, lead_score: 60 }),
      ],
      leads: [], appts: [], customerName: null,
    });
    expect(stats.total_calls).toBe(2);
    expect(stats.total_minutes).toBe(2);  // (90 + 30) / 60 = 2
    expect(stats.total_cost).toBe(0.13);
    expect(stats.avg_lead_score).toBe(70);
  });

  it("returns zeros (no NaN) for empty calls", () => {
    const stats = computeContactStats({ calls: [], leads: [], appts: [], customerName: null });
    expect(stats.total_calls).toBe(0);
    expect(stats.avg_lead_score).toBe(0);
    expect(stats.last_touch).toBe(null);
  });

  it("falls back to lead.created_at for last_touch when there are no calls", () => {
    const stats = computeContactStats({
      calls: [],
      leads: [lead({ created_at: T(7) })],
      appts: [],
      customerName: null,
    });
    expect(stats.last_touch).toBe(T(7));
  });

  it("counts only matching-name appointments in the appointments stat", () => {
    const stats = computeContactStats({
      calls: [],
      leads: [],
      appts: [
        appt({ customer_name: "Alice" }),
        appt({ customer_name: "Bob" }),
      ],
      customerName: "alice",
    });
    expect(stats.appointments).toBe(1);
  });

  it("coerces string-form cost (Postgres NUMERIC quirk)", () => {
    const stats = computeContactStats({
      calls: [call({ cost: "0.5" as any })],
      leads: [], appts: [], customerName: null,
    });
    expect(stats.total_cost).toBe(0.5);
  });
});

describe("buildContactProfile", () => {
  it("picks customer_name from the first lead or appointment", () => {
    const r = buildContactProfile({
      number: "+1 (415) 555-1234",
      normalized: "4155551234",
      calls: [],
      leads: [lead({ customer_name: "Alice" })],
      appts: [],
    });
    expect(r.customer_name).toBe("Alice");
    expect(r.normalized).toBe("4155551234");
    expect(r.number).toBe("+1 (415) 555-1234");
  });

  it("falls back to appointment.customer_name when no leads", () => {
    const r = buildContactProfile({
      number: "x", normalized: "y",
      calls: [],
      leads: [],
      appts: [appt({ customer_name: "Bob" })],
    });
    expect(r.customer_name).toBe("Bob");
  });

  it("returns the appointments array filtered by name match", () => {
    const r = buildContactProfile({
      number: "x", normalized: "y",
      calls: [],
      leads: [lead({ customer_name: "Alice" })],
      appts: [
        appt({ id: "match",   customer_name: "Alice" }),
        appt({ id: "nomatch", customer_name: "Bob" }),
      ],
    });
    expect(r.appointments.map(a => a.id)).toEqual(["match"]);
  });

  it("preserves the leads array as-is (no filtering)", () => {
    const leads = [
      lead({ id: "L1", customer_name: "Alice" }),
      lead({ id: "L2", customer_name: null }),
    ];
    const r = buildContactProfile({
      number: "x", normalized: "y",
      calls: [], leads, appts: [],
    });
    expect(r.leads).toEqual(leads);
  });

  it("emits the documented stats shape", () => {
    const r = buildContactProfile({
      number: "x", normalized: "y",
      calls: [call({ duration_seconds: 60, cost: 0.5, lead_score: 90 })],
      leads: [], appts: [],
    });
    expect(r.stats).toEqual({
      total_calls: 1,
      total_minutes: 1,
      total_cost: 0.5,
      avg_lead_score: 90,
      last_touch: T(0),
      outbound_leads: 0,
      appointments: 0,
    });
  });
});
