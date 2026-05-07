// Agent scorecard tests. Misreporting a conversion / resolution rate
// quietly mis-steers operators for weeks, so we cover every focus +
// the math edge cases (empty period, single-call period, prior=0
// baseline, NaN guards, sparkline bucketing).

import { describe, it, expect } from 'vitest';
import {
  computeScorecard,
  pctDelta,
  buildTrend,
  type CallLogRow,
  type AppointmentRow,
  type FollowUpTaskRow,
} from './agent-scorecard';

const NOW = new Date('2026-02-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function call(id: string, opts: Partial<CallLogRow> = {}): CallLogRow {
  return {
    id,
    created_at: opts.created_at ?? new Date(NOW - DAY_MS).toISOString(),
    lead_score: opts.lead_score ?? null,
    duration_seconds: opts.duration_seconds ?? null,
    sentiment: opts.sentiment ?? null,
    intent_label: opts.intent_label ?? null,
  };
}

const empty = (focus: string) => computeScorecard({
  focus,
  windowDays: 30,
  now: NOW,
  currentLogs: [],
  priorLogs: [],
  appointments: [],
  openFollowUps: [],
});

describe('pctDelta', () => {
  it('returns 0 when prior and current are both 0', () => {
    expect(pctDelta(0, 0)).toBe(0);
  });
  it('returns 100 when prior is 0 and current is positive', () => {
    expect(pctDelta(5, 0)).toBe(100);
  });
  it('returns 0 when prior is 0 and current is 0/negative', () => {
    expect(pctDelta(-1, 0)).toBe(0);
  });
  it('returns the integer percent change', () => {
    expect(pctDelta(150, 100)).toBe(50);
    expect(pctDelta(50, 100)).toBe(-50);
  });
  it('handles fractional inputs', () => {
    expect(pctDelta(0.5, 0.4)).toBe(25);
  });
  it('handles NaN safely', () => {
    expect(pctDelta(NaN, 100)).toBe(0);
    expect(pctDelta(100, NaN)).toBe(100); // treated as no baseline
  });
});

describe('buildTrend', () => {
  it('produces a 30-bucket array for windowDays=30', () => {
    const r = buildTrend([], NOW, 30);
    expect(r.length).toBe(30);
    expect(r.every(v => v === 0)).toBe(true);
  });

  it('caps buckets at 60 even for huge windows', () => {
    const r = buildTrend([], NOW, 365);
    expect(r.length).toBe(60);
  });

  it('places each call in the correct bucket (most recent on the right)', () => {
    const ws = 7;
    const logs = [
      call('a', { created_at: new Date(NOW - 1 * 60 * 1000).toISOString() }),       // ~now → last bucket (6)
      call('b', { created_at: new Date(NOW - 6 * DAY_MS).toISOString() }),           // 6 days ago → bucket 1
                                                                                     // (idx = floor(1d / 1d))
      call('c', { created_at: new Date(NOW - 7 * DAY_MS + 60_000).toISOString() }),  // ~start → bucket 0
    ];
    const r = buildTrend(logs, NOW, ws);
    expect(r[6]).toBe(1);
    expect(r[1]).toBe(1);
    expect(r[0]).toBe(1);
    expect(r.reduce((s, v) => s + v, 0)).toBe(3);
  });

  it('skips entries with unparsable created_at', () => {
    const logs = [call('a', { created_at: 'garbage' })];
    expect(buildTrend(logs, NOW, 7).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

describe('computeScorecard — empty period', () => {
  it.each(['general', 'conversions', 'qualifications', 'resolutions', 'satisfaction'])(
    'returns zero metrics with %s focus and never throws',
    (focus) => {
      const r = empty(focus);
      expect(r.primary.value).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.primary.value)).toBe(true);
      expect(Number.isFinite(r.primary.delta_pct)).toBe(true);
      expect(r.sample_size).toBe(0);
      expect(Array.isArray(r.secondary)).toBe(true);
    });
});

describe('computeScorecard — focus: conversions', () => {
  const calls: CallLogRow[] = [
    call('c1', { duration_seconds: 60 }),
    call('c2', { duration_seconds: 120 }),
    call('c3', { duration_seconds: 180 }),
    call('c4'),
  ];
  const appts: AppointmentRow[] = [
    { id: 'a1', created_at: new Date(NOW - DAY_MS).toISOString() },
  ];

  it('reports conversion_rate = appointments / calls', () => {
    const r = computeScorecard({
      focus: 'conversions',
      windowDays: 7,
      now: NOW,
      currentLogs: calls,
      priorLogs: [],
      appointments: appts,
      openFollowUps: [],
    });
    expect(r.primary.label).toBe('Conversion rate');
    expect(r.primary.format).toBe('percent');
    expect(r.primary.value).toBeCloseTo(0.25, 4); // 1 / 4
    expect(r.secondary.find(s => s.label === 'Conversions')!.value).toBe(1);
    expect(r.secondary.find(s => s.label === 'Avg call length')!.value).toBe(90); // (60+120+180+0)/4
  });
});

describe('computeScorecard — focus: qualifications', () => {
  const calls: CallLogRow[] = [
    call('q1', { lead_score: 80 }),
    call('q2', { lead_score: 60 }),
    call('q3', { lead_score: null }), // unscored — excluded from avg
  ];
  const prev: CallLogRow[] = [
    call('p1', { lead_score: 50 }),
    call('p2', { lead_score: 50 }),
  ];

  it('reports avg over scored calls only', () => {
    const r = computeScorecard({
      focus: 'qualifications',
      windowDays: 7,
      now: NOW,
      currentLogs: calls,
      priorLogs: prev,
      appointments: [],
      openFollowUps: [],
    });
    expect(r.primary.label).toBe('Avg lead score');
    expect(r.primary.value).toBe(70); // round((80+60)/2)
    expect(r.primary.delta_pct).toBe(40); // (70-50)/50 = +40%
    expect(r.secondary.find(s => s.label === 'Scored calls')!.value).toBe(2);
  });
});

describe('computeScorecard — focus: resolutions', () => {
  const calls: CallLogRow[] = [
    call('r1'),
    call('r2'),
    call('r3'),
    call('r4'),
  ];
  // r2 had a follow-up task — only 3 of 4 considered resolved.
  const followUps: FollowUpTaskRow[] = [
    { id: 't1', source_id: 'r2', created_at: new Date(NOW - DAY_MS).toISOString() },
  ];

  it('counts calls without an open follow-up as resolved', () => {
    const r = computeScorecard({
      focus: 'resolutions',
      windowDays: 7,
      now: NOW,
      currentLogs: calls,
      priorLogs: [],
      appointments: [],
      openFollowUps: followUps,
    });
    expect(r.primary.label).toBe('First-contact resolution');
    expect(r.primary.value).toBeCloseTo(0.75, 4); // 3/4
    expect(r.secondary.find(s => s.label === 'Open follow-ups')!.value).toBe(1);
  });

  it('ignores follow-ups with null source_id', () => {
    const r = computeScorecard({
      focus: 'resolutions',
      windowDays: 7,
      now: NOW,
      currentLogs: calls,
      priorLogs: [],
      appointments: [],
      openFollowUps: [{ id: 't1', source_id: null, created_at: '' }],
    });
    expect(r.primary.value).toBe(1); // all 4 considered resolved
  });
});

describe('computeScorecard — focus: satisfaction', () => {
  it('reports positive-sentiment share', () => {
    const r = computeScorecard({
      focus: 'satisfaction',
      windowDays: 7,
      now: NOW,
      currentLogs: [
        call('s1', { sentiment: 'positive' }),
        call('s2', { sentiment: 'POSITIVE' }), // case-insensitive
        call('s3', { sentiment: 'neutral' }),
        call('s4', { sentiment: 'negative' }),
      ],
      priorLogs: [
        call('s5', { sentiment: 'negative' }),
        call('s6', { sentiment: 'negative' }),
      ],
      appointments: [],
      openFollowUps: [],
    });
    expect(r.primary.value).toBeCloseTo(0.5, 4); // 2/4
    expect(r.primary.delta_pct).toBe(100); // prior was 0, current > 0
    expect(r.secondary.find(s => s.label === 'Positive calls')!.value).toBe(2);
  });
});

describe('computeScorecard — focus: general (default)', () => {
  it('reports calls_handled with prior-period delta', () => {
    const r = computeScorecard({
      focus: 'general',
      windowDays: 7,
      now: NOW,
      currentLogs: [call('a'), call('b'), call('c')],
      priorLogs: [call('d'), call('e')],
      appointments: [],
      openFollowUps: [],
    });
    expect(r.primary.label).toBe('Calls handled');
    expect(r.primary.value).toBe(3);
    expect(r.primary.delta_pct).toBe(50);
  });

  it('falls back to general for unknown focus values', () => {
    const r = computeScorecard({
      focus: 'mystery' as any,
      windowDays: 7,
      now: NOW,
      currentLogs: [call('a')],
      priorLogs: [],
      appointments: [],
      openFollowUps: [],
    });
    expect(r.primary.label).toBe('Calls handled');
  });
});

describe('computeScorecard — sparkline', () => {
  it('always returns the trend array on the primary metric', () => {
    const r = computeScorecard({
      focus: 'general',
      windowDays: 14,
      now: NOW,
      currentLogs: [call('a')],
      priorLogs: [],
      appointments: [],
      openFollowUps: [],
    });
    expect(Array.isArray(r.primary.trend)).toBe(true);
    expect(r.primary.trend.length).toBe(14);
  });
});
