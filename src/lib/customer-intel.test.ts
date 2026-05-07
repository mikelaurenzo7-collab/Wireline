// customer-intel tests. Bugs here mean every voice/email call gets a
// malformed system prompt — covers each null/empty/separator branch.

import { describe, it, expect } from 'vitest';
import { extractCapturedProfileIntel, buildCustomerIntelBlock } from './customer-intel';

describe('extractCapturedProfileIntel', () => {
  it('returns "" for null / undefined / empty / whitespace', () => {
    expect(extractCapturedProfileIntel(null)).toBe('');
    expect(extractCapturedProfileIntel(undefined)).toBe('');
    expect(extractCapturedProfileIntel('')).toBe('');
    expect(extractCapturedProfileIntel('   \n  ')).toBe('');
  });

  it('returns the portion after the first " — " separator', () => {
    expect(extractCapturedProfileIntel('[CUSTOMER PROFILE] +15551234567 — Wants pricing for 5 seats.'))
      .toBe('Wants pricing for 5 seats.');
  });

  it('falls back to the trimmed full string if no separator is present', () => {
    expect(extractCapturedProfileIntel('Wants pricing for 5 seats.'))
      .toBe('Wants pricing for 5 seats.');
  });

  it('only splits on the first separator (preserves additional " — " in the intel)', () => {
    const out = extractCapturedProfileIntel(
      '[CUSTOMER PROFILE] +1 — title — also runs ops',
    );
    expect(out).toBe('title — also runs ops');
  });

  it('rejects non-string inputs', () => {
    expect(extractCapturedProfileIntel(42 as any)).toBe('');
    expect(extractCapturedProfileIntel({} as any)).toBe('');
    expect(extractCapturedProfileIntel([] as any)).toBe('');
  });
});

describe('buildCustomerIntelBlock', () => {
  it('returns "" when no intel is available', () => {
    expect(buildCustomerIntelBlock(null)).toBe('');
    expect(buildCustomerIntelBlock(undefined)).toBe('');
    expect(buildCustomerIntelBlock('')).toBe('');
    expect(buildCustomerIntelBlock('   \n  ')).toBe('');
  });

  it('renders the inbound block by default', () => {
    const out = buildCustomerIntelBlock('[CUSTOMER PROFILE] +1 — wants demo');
    expect(out).toContain('CUSTOMER INTEL');
    expect(out).toContain('wants demo');
    expect(out).toContain('Weave this context in naturally');
  });

  it('switches the call-to-action when isOutbound=true', () => {
    const out = buildCustomerIntelBlock('[CUSTOMER PROFILE] +1 — wants demo', true);
    expect(out).toContain('continuity and build immediate trust');
    expect(out).not.toContain('Weave this context in naturally');
  });

  it('accepts pre-extracted intel without a separator', () => {
    const out = buildCustomerIntelBlock('Wants pricing for 5 seats.');
    expect(out).toContain('Wants pricing for 5 seats.');
  });
});
