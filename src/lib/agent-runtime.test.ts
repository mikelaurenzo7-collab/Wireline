// agent-runtime tests — every call's system prompt flows through
// buildAgentRuntimeContext. A regression here mis-gates business hours
// or silently drops compliance disclosures, which is unacceptable in
// regulated verticals (HIPAA, PCI). Coverage is intentionally dense.

import { describe, it, expect } from 'vitest';
import {
  isWithinBusinessHours,
  complianceDisclosure,
  disallowedTopicsBlock,
  escalationKeywordsBlock,
  applyBusinessVariables,
  kpiFocusLine,
  buildAgentRuntimeContext,
} from './agent-runtime';

// All "current time" values use UTC and are evaluated against
// America/New_York unless otherwise noted. UTC-5 in winter, UTC-4 in
// summer; 2026-01-15 is winter (EST). 14:00 UTC → 09:00 EST.
const WINTER_NY_9AM = new Date('2026-01-15T14:00:00Z'); // Thu 09:00 EST
const WINTER_NY_2AM = new Date('2026-01-15T07:00:00Z'); // Thu 02:00 EST
const WINTER_NY_5PM = new Date('2026-01-15T22:00:00Z'); // Thu 17:00 EST
const SAT_NY_NOON   = new Date('2026-01-17T17:00:00Z'); // Sat 12:00 EST

describe('isWithinBusinessHours', () => {
  it('defaults to "open" when no hours are configured', () => {
    expect(isWithinBusinessHours(null, WINTER_NY_2AM)).toBe(true);
    expect(isWithinBusinessHours({}, WINTER_NY_2AM)).toBe(true);
    expect(isWithinBusinessHours({ business_hours: {} }, WINTER_NY_2AM)).toBe(true);
  });

  it('returns true inside a configured weekday window', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
    }, WINTER_NY_9AM)).toBe(true);
  });

  it('returns false before the open time', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
    }, WINTER_NY_2AM)).toBe(false);
  });

  it('returns false at exactly close time (close is exclusive)', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
    }, WINTER_NY_5PM)).toBe(false);
  });

  it('returns true 1 minute before close', () => {
    const oneMinBefore5 = new Date('2026-01-15T21:59:00Z'); // Thu 16:59 EST
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
    }, oneMinBefore5)).toBe(true);
  });

  it('returns false on a day marked closed', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { sat: { closed: true } },
    }, SAT_NY_NOON)).toBe(false);
  });

  it('returns true on a day with no rule (no gating)', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { mon: { open: '09:00', close: '17:00' } }, // no Sat rule
    }, SAT_NY_NOON)).toBe(true);
  });

  it('handles overnight windows (close < open) correctly', () => {
    // 22:00 → 06:00 (e.g. an after-hours line)
    const _fri10pm = new Date('2026-01-16T03:00:00Z'); // Thu 22:00 EST? Wait
    // 2026-01-16 03:00 UTC = 2026-01-15 22:00 EST → Thu evening
    const thu10pm = new Date('2026-01-16T03:00:00Z');
    const fri3am  = new Date('2026-01-16T08:00:00Z'); // Fri 03:00 EST
    const noonGap = new Date('2026-01-16T17:00:00Z'); // Fri 12:00 EST → outside
    const profile = {
      timezone: 'America/New_York',
      business_hours: {
        thu: { open: '22:00', close: '06:00' },
        fri: { open: '22:00', close: '06:00' },
      },
    };
    expect(isWithinBusinessHours(profile, thu10pm)).toBe(true);  // just opened
    expect(isWithinBusinessHours(profile, fri3am)).toBe(true);   // wrap-around
    expect(isWithinBusinessHours(profile, noonGap)).toBe(false); // mid-day
  });

  it('falls back to UTC when the timezone string is invalid', () => {
    // An invalid TZ used to crash the call path; now it should evaluate
    // against UTC and not throw. 14:00 UTC inside 09:00–17:00 → true.
    expect(isWithinBusinessHours({
      timezone: 'Not/A_Real_Zone',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
    }, WINTER_NY_9AM)).toBe(true);
  });

  it('treats malformed time strings as "no gate" (fail-open)', () => {
    expect(isWithinBusinessHours({
      timezone: 'America/New_York',
      business_hours: { thu: { open: '9am', close: 'noon' } },
    }, WINTER_NY_2AM)).toBe(true);
  });
});

describe('complianceDisclosure', () => {
  it('returns empty for "none" or unknown', () => {
    expect(complianceDisclosure('none')).toBe('');
    expect(complianceDisclosure(null)).toBe('');
    expect(complianceDisclosure(undefined)).toBe('');
    expect(complianceDisclosure('mystery')).toBe('');
  });

  it('emits a HIPAA block with PHI handling rules', () => {
    const t = complianceDisclosure('hipaa');
    expect(t).toContain('HIPAA');
    expect(t).toContain('PHI');
    expect(t).toMatch(/verify identity/i);
  });

  it('emits a PCI block that forbids restating card numbers', () => {
    const t = complianceDisclosure('pci');
    expect(t).toContain('PCI');
    expect(t).toMatch(/CVV/);
    expect(t).toMatch(/secure IVR|tokenized payment link/);
  });

  it('emits a GDPR block mentioning recording + erasure rights', () => {
    const t = complianceDisclosure('gdpr');
    expect(t).toContain('GDPR');
    expect(t).toMatch(/recorded|erasure|opt-out/i);
  });

  it('emits financial + legal blocks with unauthorized-practice guardrails', () => {
    expect(complianceDisclosure('financial')).toContain('Financial');
    expect(complianceDisclosure('legal')).toContain('Legal');
    expect(complianceDisclosure('legal')).toMatch(/attorney-client/i);
  });
});

describe('disallowedTopicsBlock', () => {
  it('returns empty for empty / null input', () => {
    expect(disallowedTopicsBlock(null)).toBe('');
    expect(disallowedTopicsBlock(undefined)).toBe('');
    expect(disallowedTopicsBlock([])).toBe('');
    expect(disallowedTopicsBlock(['', '  '])).toBe('');
  });

  it('renders one bullet per topic and includes the directive header', () => {
    const out = disallowedTopicsBlock(['Pricing for SKU 99', 'Refund policy']);
    expect(out).toContain('DO-NOT-DISCUSS');
    expect(out).toContain('- Pricing for SKU 99');
    expect(out).toContain('- Refund policy');
  });

  it('caps at 24 topics to bound the prompt budget', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Topic ${i}`);
    const out = disallowedTopicsBlock(many);
    const lines = out.split('\n').filter(l => l.startsWith('- '));
    expect(lines.length).toBe(24);
  });

  it('strips whitespace and ignores non-strings', () => {
    const out = disallowedTopicsBlock(['  hello  ', '', 42 as any, null as any, 'world']);
    expect(out).toContain('- hello');
    expect(out).toContain('- world');
    expect(out).not.toMatch(/- 42/);
  });
});

describe('escalationKeywordsBlock', () => {
  it('returns empty for empty / null input', () => {
    expect(escalationKeywordsBlock(null)).toBe('');
    expect(escalationKeywordsBlock([])).toBe('');
  });

  it('renders the immediate-escalation directive with bullets', () => {
    const out = escalationKeywordsBlock(['lawsuit', 'cancel my account']);
    expect(out).toContain('IMMEDIATE-ESCALATION');
    expect(out).toContain('escalate_to_human');
    expect(out).toContain('- lawsuit');
    expect(out).toContain('- cancel my account');
  });
});

describe('applyBusinessVariables', () => {
  it('replaces known {placeholders}', () => {
    expect(applyBusinessVariables('Welcome to {business_name}.', { business_name: 'Acme Co' }))
      .toBe('Welcome to Acme Co.');
  });

  it('leaves unknown placeholders intact', () => {
    expect(applyBusinessVariables('Hi {name}, total {amount}', { name: 'Sue' }))
      .toBe('Hi Sue, total {amount}');
  });

  it('coerces numbers to strings', () => {
    expect(applyBusinessVariables('Limit {n}', { n: 42 })).toBe('Limit 42');
  });

  it('truncates very long values to 500 chars + ellipsis', () => {
    const long = 'x'.repeat(600);
    const out = applyBusinessVariables('{v}', { v: long });
    expect(out.length).toBe(501);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns input unchanged when vars is null/undefined', () => {
    expect(applyBusinessVariables('hello {x}', null)).toBe('hello {x}');
    expect(applyBusinessVariables('hello {x}', undefined)).toBe('hello {x}');
  });

  it('does not match malformed placeholders', () => {
    expect(applyBusinessVariables('keep {1invalid} and {valid}', { valid: 'OK', '1invalid': 'NO' }))
      .toBe('keep {1invalid} and OK');
  });

  it('handles repeated placeholders in one string', () => {
    expect(applyBusinessVariables('{x} and {x}', { x: 'A' })).toBe('A and A');
  });
});

describe('kpiFocusLine', () => {
  it('returns empty for "general" / unknown / nullish', () => {
    expect(kpiFocusLine('general')).toBe('');
    expect(kpiFocusLine(null)).toBe('');
    expect(kpiFocusLine('')).toBe('');
    expect(kpiFocusLine('unknown')).toBe('');
  });

  it('emits distinct lines per known focus', () => {
    const c = kpiFocusLine('conversions');
    const q = kpiFocusLine('qualifications');
    const r = kpiFocusLine('resolutions');
    const s = kpiFocusLine('satisfaction');
    expect(c).toMatch(/PRIMARY OUTCOME/);
    expect(c).not.toBe(q);
    expect(q).not.toBe(r);
    expect(r).not.toBe(s);
  });
});

describe('buildAgentRuntimeContext', () => {
  it('returns the base prompt unchanged when profile is null', () => {
    const r = buildAgentRuntimeContext('SYSTEM', null, WINTER_NY_9AM);
    expect(r.prompt).toBe('SYSTEM');
    expect(r.inHours).toBe(true);
    expect(r.outOfHoursMessage).toBe(null);
  });

  it('appends compliance, disallowed-topics, escalation, and KPI sections in order', () => {
    const r = buildAgentRuntimeContext('BASE', {
      compliance_mode: 'hipaa',
      disallowed_topics: ['weight loss tips'],
      escalation_keywords: ['lawsuit'],
      kpi_focus: 'satisfaction',
    }, WINTER_NY_9AM);
    expect(r.prompt).toContain('BASE');
    expect(r.prompt).toContain('HIPAA');
    expect(r.prompt).toContain('DO-NOT-DISCUSS');
    expect(r.prompt).toContain('IMMEDIATE-ESCALATION');
    expect(r.prompt).toContain('PRIMARY OUTCOME');
    expect(r.prompt.indexOf('HIPAA'))
      .toBeLessThan(r.prompt.indexOf('DO-NOT-DISCUSS'));
    expect(r.prompt.indexOf('DO-NOT-DISCUSS'))
      .toBeLessThan(r.prompt.indexOf('IMMEDIATE-ESCALATION'));
  });

  it('substitutes business variables across base AND appended sections', () => {
    const r = buildAgentRuntimeContext(
      'Welcome to {business_name}',
      {
        business_variables: { business_name: 'Acme', team: 'Acme Pharmacy' },
        disallowed_topics: ['anything outside {team}'],
      },
      WINTER_NY_9AM,
    );
    expect(r.prompt).toContain('Welcome to Acme');
    expect(r.prompt).toContain('- anything outside Acme Pharmacy');
  });

  it('marks inHours=false outside the configured window and fills outOfHoursMessage', () => {
    const r = buildAgentRuntimeContext('BASE', {
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
      out_of_hours_message: 'Thanks for calling {business_name} — we are closed.',
      business_variables: { business_name: 'Acme' },
    }, WINTER_NY_2AM);
    expect(r.inHours).toBe(false);
    expect(r.outOfHoursMessage).toBe('Thanks for calling Acme — we are closed.');
  });

  it('outOfHoursMessage is null when inside hours, even if configured', () => {
    const r = buildAgentRuntimeContext('BASE', {
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
      out_of_hours_message: 'After hours message',
    }, WINTER_NY_9AM);
    expect(r.inHours).toBe(true);
    expect(r.outOfHoursMessage).toBe(null);
  });

  it('handles a fully-populated profile without throwing or duplicating', () => {
    const r = buildAgentRuntimeContext('BASE', {
      timezone: 'America/New_York',
      business_hours: { thu: { open: '09:00', close: '17:00' } },
      compliance_mode: 'pci',
      disallowed_topics: ['competitor pricing'],
      escalation_keywords: ['speak to a manager'],
      business_variables: { business_name: 'Acme' },
      out_of_hours_message: 'closed',
      kpi_focus: 'conversions',
    }, WINTER_NY_9AM);
    expect(r.inHours).toBe(true);
    expect(r.outOfHoursMessage).toBe(null);
    // Each section appears exactly once.
    expect((r.prompt.match(/PCI DSS/g) || []).length).toBe(1);
    expect((r.prompt.match(/DO-NOT-DISCUSS/g) || []).length).toBe(1);
  });
});
