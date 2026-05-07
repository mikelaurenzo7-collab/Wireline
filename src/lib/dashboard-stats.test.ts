// dashboard-stats tests. Drives every metric the home page renders, so
// every derivation here gets at least one focused case + one edge case.

import { describe, it, expect } from 'vitest';
import {
  buildSentimentBreakdown,
  buildHotLeads,
  buildSevenDayChart,
  computeDashboardStats,
  type CallLogRow,
  type EmailThreadRow,
} from './dashboard-stats';

const NOW = new Date('2026-02-15T12:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function call(opts: Partial<CallLogRow> & { id: string }): CallLogRow {
  return {
    id: opts.id,
    cost: opts.cost ?? null,
    duration_seconds: opts.duration_seconds ?? null,
    direction: opts.direction ?? null,
    created_at: opts.created_at ?? new Date(NOW - DAY_MS).toISOString(),
    lead_score: opts.lead_score ?? null,
    intent_label: opts.intent_label ?? null,
    summary: opts.summary ?? null,
    customer_number: opts.customer_number ?? null,
    sentiment: opts.sentiment ?? null,
  };
}

describe('buildSentimentBreakdown', () => {
  it('counts each bucket', () => {
    const r = buildSentimentBreakdown([
      call({ id: '1', sentiment: 'positive' }),
      call({ id: '2', sentiment: 'POSITIVE' }), // case-insensitive
      call({ id: '3', sentiment: 'neutral' }),
      call({ id: '4', sentiment: 'negative' }),
    ]);
    expect(r).toEqual({ positive: 2, neutral: 1, negative: 1 });
  });

  it('treats unknown / missing sentiment as neutral', () => {
    const r = buildSentimentBreakdown([
      call({ id: '1' }),
      call({ id: '2', sentiment: 'mixed' }),
      call({ id: '3', sentiment: '' }),
    ]);
    expect(r).toEqual({ positive: 0, neutral: 3, negative: 0 });
  });

  it('handles empty input', () => {
    expect(buildSentimentBreakdown([])).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });
});

describe('buildHotLeads', () => {
  it('includes calls with lead_score >= 75 plus email threads', () => {
    const logs: CallLogRow[] = [
      call({ id: 'c1', lead_score: 80, customer_number: '+15551234567', summary: 'pricing' }),
      call({ id: 'c2', lead_score: 50, customer_number: '+15559999999' }), // below threshold
      call({ id: 'c3', lead_score: 90, customer_number: '+15558888888', summary: 'demo' }),
    ];
    const emails: EmailThreadRow[] = [
      { id: 'e1', customer_email: 'lead@example.com', lead_score: 75, summary: 'inbound', created_at: new Date(NOW - DAY_MS / 2).toISOString() },
    ];
    const r = buildHotLeads(logs, emails);
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.find(x => x.id === 'c2')).toBeUndefined(); // below threshold
    expect(r.find(x => x.id === 'c1')!.type).toBe('call');
    expect(r.find(x => x.id === 'e1')!.type).toBe('email');
  });

  it('caps the result at 5 items', () => {
    const calls: CallLogRow[] = Array.from({ length: 8 }).map((_, i) =>
      call({ id: `c${i}`, lead_score: 80, created_at: new Date(NOW - i * 60_000).toISOString() }));
    const r = buildHotLeads(calls, []);
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it('sorts by date descending (most recent first)', () => {
    const old = new Date(NOW - 5 * DAY_MS).toISOString();
    const recent = new Date(NOW - 1 * 60_000).toISOString();
    const r = buildHotLeads([
      call({ id: 'old',    lead_score: 80, created_at: old }),
      call({ id: 'recent', lead_score: 80, created_at: recent }),
    ], []);
    expect(r[0].id).toBe('recent');
  });
});

describe('buildSevenDayChart', () => {
  it('produces 7 buckets, oldest first', () => {
    const r = buildSevenDayChart([], [], NOW);
    expect(r.length).toBe(7);
    expect(r.every(d => typeof d.name === 'string')).toBe(true);
    expect(r.every(d => d.signals === 0 && d.leads === 0)).toBe(true);
  });

  it('places call logs in the correct day bucket', () => {
    const today = new Date(NOW).toISOString();
    const yesterday = new Date(NOW - DAY_MS).toISOString();
    const r = buildSevenDayChart(
      [
        call({ id: 'a', created_at: today }),
        call({ id: 'b', created_at: yesterday }),
        call({ id: 'c', created_at: yesterday }),
      ],
      [],
      NOW,
    );
    // last bucket is today, second-to-last is yesterday
    expect(r[6].signals).toBe(1);
    expect(r[5].signals).toBe(2);
  });

  it('places appointments in the leads series', () => {
    const today = new Date(NOW).toISOString();
    const r = buildSevenDayChart([], [{ created_at: today }, { created_at: today }], NOW);
    expect(r[6].leads).toBe(2);
    expect(r[6].signals).toBe(0);
  });

  it('skips entries with unparsable dates', () => {
    const r = buildSevenDayChart(
      [call({ id: 'bad', created_at: 'garbage' })],
      [{ created_at: 'also garbage' }],
      NOW,
    );
    expect(r.every(d => d.signals === 0 && d.leads === 0)).toBe(true);
  });
});

describe('computeDashboardStats', () => {
  it('aggregates totals + sentiment + lead score', () => {
    const r = computeDashboardStats({
      totalAppointments: 3,
      totalLeads: 12,
      logs: [
        call({ id: '1', cost: 0.5,  duration_seconds: 120, direction: 'inbound',  lead_score: 80, sentiment: 'positive' }),
        call({ id: '2', cost: 1.25, duration_seconds: 60,  direction: 'outbound', lead_score: 60, sentiment: 'neutral' }),
        call({ id: '3', cost: '0.75', duration_seconds: 30, direction: 'outbound', lead_score: 40, sentiment: 'negative' }),
        call({ id: '4', cost: null, duration_seconds: 0,    direction: null,       lead_score: null, sentiment: null }),
      ],
      prevLogs: [],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.totalCalls).toBe(4);
    expect(r.totalMinutes).toBe(4);
    expect(r.totalCost).toBe('2.50');
    expect(r.inboundCount).toBe(1);
    expect(r.outboundCount).toBe(2);
    expect(r.avgLeadScore).toBe(60);
    expect(r.sentimentBreakdown).toEqual({ positive: 1, neutral: 2, negative: 1 });
    expect(r.conversionRate).toBe('75.0');
  });

  it('returns null deltas when prior period is empty', () => {
    const r = computeDashboardStats({
      totalAppointments: 0,
      totalLeads: 0,
      logs: [call({ id: '1', cost: 1, lead_score: 50 })],
      prevLogs: [],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.week_delta.calls_pct).toBe(null);
    expect(r.week_delta.cost_pct).toBe(null);
    expect(r.week_delta.score_pct).toBe(null);
  });

  it('computes percent deltas when prior period has data', () => {
    const r = computeDashboardStats({
      totalAppointments: 0,
      totalLeads: 0,
      logs: [
        call({ id: '1', cost: 2, lead_score: 80 }),
        call({ id: '2', cost: 2, lead_score: 80 }),
      ],
      prevLogs: [
        call({ id: 'p1', cost: 1, lead_score: 40 }),
        call({ id: 'p2', cost: 1, lead_score: 40 }),
      ],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.week_delta.calls_pct).toBe(0);
    expect(r.week_delta.cost_pct).toBe(100);
    expect(r.week_delta.score_pct).toBe(100);
  });

  it('returns 0 conversion rate when there are no calls', () => {
    const r = computeDashboardStats({
      totalAppointments: 5,
      totalLeads: 0,
      logs: [],
      prevLogs: [],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.conversionRate).toBe(0);
    expect(r.totalCalls).toBe(0);
  });

  it('always returns a 7-element chart series', () => {
    const r = computeDashboardStats({
      totalAppointments: 0,
      totalLeads: 0,
      logs: [],
      prevLogs: [],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.chartData.length).toBe(7);
  });

  it('handles cost as a string ("0.75") without producing NaN', () => {
    const r = computeDashboardStats({
      totalAppointments: 0,
      totalLeads: 0,
      logs: [
        call({ id: '1', cost: '1.25' }),
        call({ id: '2', cost: '0.75' }),
        call({ id: '3', cost: 'garbage' }),
      ],
      prevLogs: [],
      hotEmails: [],
      recentAppts: [],
      now: NOW,
    });
    expect(r.totalCost).toBe('2.00');
  });
});
