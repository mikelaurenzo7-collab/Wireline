// safe-number tests — same defensive coverage as safe-date. Every site
// that formats a server-supplied number will flow through these helpers,
// so a regression here either crashes a render or invents bogus values.

import { describe, it, expect } from 'vitest';
import { safeNumber, safeFixed, formatMoney, formatPercent, formatInt } from './safe-number';

describe('safeNumber', () => {
  it('passes finite numbers through', () => {
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-1.5)).toBe(-1.5);
    expect(safeNumber(1e6)).toBe(1e6);
  });

  it('rejects NaN and Infinity', () => {
    expect(safeNumber(NaN)).toBe(null);
    expect(safeNumber(Infinity)).toBe(null);
    expect(safeNumber(-Infinity)).toBe(null);
  });

  it('parses pure numeric strings', () => {
    expect(safeNumber('12.5')).toBe(12.5);
    expect(safeNumber('  -3 ')).toBe(-3);
  });

  it('rejects strings that are partly numeric', () => {
    expect(safeNumber('12.5px')).toBe(null);
    expect(safeNumber('abc')).toBe(null);
  });

  it('treats empty / whitespace strings as missing', () => {
    expect(safeNumber('')).toBe(null);
    expect(safeNumber('   ')).toBe(null);
  });

  it('coerces booleans to 0/1', () => {
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });

  it('rejects null / undefined / objects / arrays', () => {
    expect(safeNumber(null)).toBe(null);
    expect(safeNumber(undefined)).toBe(null);
    expect(safeNumber({})).toBe(null);
    expect(safeNumber([])).toBe(null);
    expect(safeNumber([1, 2])).toBe(null);
  });
});

describe('safeFixed', () => {
  it('formats a finite number', () => {
    expect(safeFixed(3.14159, 2)).toBe('3.14');
    expect(safeFixed(0, 4)).toBe('0.0000');
  });

  it('returns the decimal-shaped default when input is missing', () => {
    expect(safeFixed(null, 2)).toBe('0.00');
    expect(safeFixed(undefined, 4)).toBe('0.0000');
    expect(safeFixed('nonsense', 2)).toBe('0.00');
  });

  it('honors a custom fallback', () => {
    expect(safeFixed(null, 2, '—')).toBe('—');
    expect(safeFixed('bad', 4, 'n/a')).toBe('n/a');
  });

  it('handles negative decimal counts gracefully', () => {
    expect(safeFixed(3.14, -1)).toBe('3');
    expect(safeFixed(3.14, 0)).toBe('3');
  });

  it('parses numeric strings before formatting', () => {
    expect(safeFixed('12.5', 2)).toBe('12.50');
  });
});

describe('formatMoney', () => {
  it('prefixes with $ and uses 2 decimals by default', () => {
    expect(formatMoney(12.5)).toBe('$12.50');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('honors custom decimals', () => {
    expect(formatMoney(0.0042, 4)).toBe('$0.0042');
  });

  it('falls back safely on null', () => {
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney(undefined, 4)).toBe('$0.0000');
  });

  it('honors a custom fallback', () => {
    expect(formatMoney(null, 2, '—')).toBe('$—');
  });
});

describe('formatPercent', () => {
  it('treats input as a 0..1 fraction by default', () => {
    expect(formatPercent(0.123, 0)).toBe('12%');
    expect(formatPercent(0.5, 1)).toBe('50.0%');
  });

  it('treats input as already-scaled when the flag is set', () => {
    expect(formatPercent(12.3, 0, true)).toBe('12%');
    expect(formatPercent(50, 1, true)).toBe('50.0%');
  });

  it('falls back on null/undefined/garbage', () => {
    expect(formatPercent(null)).toBe('0%');
    expect(formatPercent(undefined, 1)).toBe('0.0%');
    expect(formatPercent('bad')).toBe('0%');
  });
});

describe('formatInt', () => {
  it('rounds and uses locale thousands', () => {
    // Note: locale separators may vary in CI, accept both common forms.
    const r = formatInt(1234567);
    expect(r).toMatch(/1[,. ]234[,. ]567/);
  });

  it('rounds floats', () => {
    expect(formatInt(3.7)).toBe('4');
    expect(formatInt(3.2)).toBe('3');
  });

  it('falls back to "0" on missing input', () => {
    expect(formatInt(null)).toBe('0');
    expect(formatInt('garbage')).toBe('0');
  });

  it('honors a custom fallback', () => {
    expect(formatInt(null, '—')).toBe('—');
  });
});
