import { describe, it, expect } from 'vitest';
import {
  computeAgentPerformance,
  emptyAgentPerformance,
  type AgentCallLogRow,
} from './agent-performance';

const NOW = new Date('2026-05-07T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
function offset(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function row(p: Partial<AgentCallLogRow>): AgentCallLogRow {
  return {
    duration_seconds: p.duration_seconds ?? null,
    lead_score: p.lead_score ?? null,
    sentiment: p.sentiment ?? null,
    created_at: p.created_at ?? offset(1),
  };
}

describe('computeAgentPerformance — totals', () => {
  it('returns zeros for empty input', () => {
    const r = computeAgentPerformance({ rows: [], now: NOW });
    expect(r.callCount).toBe(0);
    expect(r.totalMinutes).toBe(0);
    expect(r.avgScore).toBe(0);
    expect(r.sentiment).toEqual({ positive: 0, neutral: 0, negative: 0 });
    expect(r.sparkline).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts calls and ceils total minutes from duration_seconds', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ duration_seconds: 30 }),
        row({ duration_seconds: 90 }),
        row({ duration_seconds: 31 }),  // 30+90+31 = 151s → 3 min (ceil)
      ],
    });
    expect(r.callCount).toBe(3);
    expect(r.totalMinutes).toBe(3);
  });

  it('treats null duration as 0', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [row({ duration_seconds: null }), row({ duration_seconds: 60 })],
    });
    expect(r.totalMinutes).toBe(1);
  });
});

describe('computeAgentPerformance — avgScore', () => {
  it('averages over scored rows only (>0)', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ lead_score: 80 }),
        row({ lead_score: 60 }),
        row({ lead_score: 0 }),    // not counted
        row({ lead_score: null }), // not counted
      ],
    });
    expect(r.avgScore).toBe(70);  // (80 + 60) / 2
  });

  it('returns 0 when no rows are scored', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [row({ lead_score: 0 }), row({ lead_score: null })],
    });
    expect(r.avgScore).toBe(0);
  });

  it('rounds to nearest int', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [row({ lead_score: 71 }), row({ lead_score: 80 })],
    });
    expect(r.avgScore).toBe(76);  // 75.5 → 76
  });
});

describe('computeAgentPerformance — sentiment', () => {
  it('buckets known values case-insensitively', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ sentiment: 'positive' }),
        row({ sentiment: 'POSITIVE' }),
        row({ sentiment: 'Negative' }),
        row({ sentiment: 'neutral' }),
      ],
    });
    expect(r.sentiment).toEqual({ positive: 2, neutral: 1, negative: 1 });
  });

  it('treats null and unknown values as neutral so buckets sum to callCount', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ sentiment: null }),
        row({ sentiment: undefined as any }),
        row({ sentiment: 'curious' }),  // unknown
      ],
    });
    expect(r.sentiment).toEqual({ positive: 0, neutral: 3, negative: 0 });
    expect(r.sentiment.positive + r.sentiment.neutral + r.sentiment.negative).toBe(r.callCount);
  });
});

describe('computeAgentPerformance — sparkline', () => {
  it('returns an array of length windowDays oldest-first', () => {
    const r = computeAgentPerformance({ rows: [], now: NOW, windowDays: 14 });
    expect(r.sparkline).toHaveLength(14);
  });

  it('places calls into the correct UTC day bucket', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ created_at: offset(0) }),  // today  → last index
        row({ created_at: offset(0) }),
        row({ created_at: offset(3) }),  // 3 days ago → index 3
        row({ created_at: offset(6) }),  // 6 days ago → index 0
      ],
    });
    // Window is [d-6, d-5, d-4, d-3, d-2, d-1, d-0]
    expect(r.sparkline[0]).toBe(1);
    expect(r.sparkline[3]).toBe(1);
    expect(r.sparkline[6]).toBe(2);
    expect(r.sparkline[1]).toBe(0);
  });

  it('drops calls older than the window without poisoning the sort', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ created_at: offset(30) }),  // out-of-window
        row({ created_at: offset(2) }),   // in-window
      ],
    });
    expect(r.sparkline[4]).toBe(1);  // 2 days ago
    // total in sparkline reflects only in-window calls
    expect(r.sparkline.reduce((s, n) => s + n, 0)).toBe(1);
    // but callCount counts ALL rows, regardless of window
    expect(r.callCount).toBe(2);
  });

  it('skips invalid created_at without throwing', () => {
    const r = computeAgentPerformance({
      now: NOW,
      rows: [
        row({ created_at: 'not-a-date' }),
        row({ created_at: offset(1) }),
      ],
    });
    expect(r.sparkline.reduce((s, n) => s + n, 0)).toBe(1);
    expect(r.callCount).toBe(2);
  });
});

describe('emptyAgentPerformance', () => {
  it('returns a well-formed empty rollup of the requested window length', () => {
    const r = emptyAgentPerformance(7);
    expect(r.callCount).toBe(0);
    expect(r.sparkline).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('defaults to a 7-day window', () => {
    const r = emptyAgentPerformance();
    expect(r.sparkline).toHaveLength(7);
  });
});
