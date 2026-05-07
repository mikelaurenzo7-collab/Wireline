import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_FEED_LIMIT,
  truncatePreview,
  callLogToActivity,
  fleetTaskToActivity,
  agentLessonToActivity,
  emailThreadToActivity,
  compileActivityFeed,
} from './fleet-activity';

const T = (offsetMs: number) => new Date(Date.UTC(2026, 4, 1, 12, 0, 0) + offsetMs).toISOString();

describe('truncatePreview', () => {
  it('returns placeholder for null/undefined/empty', () => {
    expect(truncatePreview(null)).toBe('(no detail)');
    expect(truncatePreview(undefined)).toBe('(no detail)');
    expect(truncatePreview('')).toBe('(no detail)');
  });

  it('returns input verbatim when within limit', () => {
    expect(truncatePreview('short')).toBe('short');
  });

  it('truncates with ellipsis when over limit', () => {
    const long = 'x'.repeat(60);
    const out = truncatePreview(long, 50);
    expect(out.endsWith('...')).toBe(true);
    expect(out.length).toBe(53);
  });
});

describe('callLogToActivity', () => {
  it('marks high importance when lead_score > 70', () => {
    const a = callLogToActivity({ id: '1', created_at: T(0), lead_score: 85, intent_label: 'Buy', customer_number: '+1' });
    expect(a.importance).toBe('high');
    expect(a.action).toBe('Intent extracted: Buy');
    expect(a.meta).toBe('+1');
  });

  it('falls back when intent and number are missing', () => {
    const a = callLogToActivity({ id: '2', created_at: T(0) });
    expect(a.action).toBe('Intent extracted: Analysis Pending');
    expect(a.meta).toBe('');
    expect(a.importance).toBe('medium');
  });

  it('null lead_score is treated as medium importance (not crashing)', () => {
    const a = callLogToActivity({ id: '3', created_at: T(0), lead_score: null });
    expect(a.importance).toBe('medium');
  });
});

describe('fleetTaskToActivity', () => {
  it('marks critical when priority high', () => {
    const a = fleetTaskToActivity({ id: 't1', created_at: T(0), description: 'Do thing', priority: 'high', status: 'open' });
    expect(a.importance).toBe('critical');
    expect(a.action).toContain('Do thing');
  });

  it('does NOT crash when description is null', () => {
    const a = fleetTaskToActivity({ id: 't2', created_at: T(0), description: null, priority: 'low', status: 'open' });
    expect(a.action).toBe('New Task: (no detail)');
    expect(a.importance).toBe('medium');
  });

  it('truncates long descriptions to 50 chars + ellipsis', () => {
    const a = fleetTaskToActivity({ id: 't3', created_at: T(0), description: 'x'.repeat(120), priority: 'low', status: 'open' });
    expect(a.action.length).toBeLessThanOrEqual('New Task: '.length + 53);
    expect(a.action.endsWith('...')).toBe(true);
  });
});

describe('agentLessonToActivity', () => {
  it('does NOT crash when lesson is null', () => {
    const a = agentLessonToActivity({ id: 'l1', created_at: T(0), lesson: null });
    expect(a.action).toBe('Lesson Learned: (no detail)');
    expect(a.importance).toBe('low');
  });

  it('always reports low importance', () => {
    const a = agentLessonToActivity({ id: 'l2', created_at: T(0), lesson: 'be polite' });
    expect(a.importance).toBe('low');
  });
});

describe('emailThreadToActivity', () => {
  it('uses Scanning placeholder for null intent_label', () => {
    const a = emailThreadToActivity({ id: 'e1', created_at: T(0), customer_email: 'a@b.com' });
    expect(a.action).toBe('Email Thread Synced: Scanning');
    expect(a.meta).toBe('a@b.com');
  });
});

describe('compileActivityFeed', () => {
  it('merges and sorts newest-first across sources', () => {
    const out = compileActivityFeed({
      logs:    [{ id: 'L1', created_at: T(1000) }],
      tasks:   [{ id: 'T1', created_at: T(3000), description: 'a' }],
      lessons: [{ id: 'X1', created_at: T(2000), lesson: 'b' }],
      emails:  [{ id: 'E1', created_at: T(4000) }],
    });
    expect(out.map(a => a.id)).toEqual(['E1', 'T1', 'X1', 'L1']);
  });

  it('caps result at default limit of 15', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, created_at: T(i * 1000), description: 'x' }));
    const out = compileActivityFeed({ logs: [], tasks: many, lessons: [], emails: [] });
    expect(out).toHaveLength(ACTIVITY_FEED_LIMIT);
  });

  it('honors custom limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, created_at: T(i * 1000), description: 'x' }));
    const out = compileActivityFeed({ logs: [], tasks: many, lessons: [], emails: [], limit: 3 });
    expect(out).toHaveLength(3);
  });

  it('handles invalid timestamps without throwing (sinks them to the bottom)', () => {
    const out = compileActivityFeed({
      logs:    [{ id: 'good', created_at: T(5000) }],
      tasks:   [{ id: 'bad',  created_at: 'not-a-date', description: 'x' }],
      lessons: [],
      emails:  [],
    });
    expect(out[0].id).toBe('good');
    // bad row still appears, just last
    expect(out.map(a => a.id)).toContain('bad');
  });

  it('returns [] when all inputs are empty', () => {
    expect(compileActivityFeed({ logs: [], tasks: [], lessons: [], emails: [] })).toEqual([]);
  });
});
