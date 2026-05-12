// src/lib/audit-routes.test.ts
//
// @vitest-environment node
//
// Real route-level tests for the /api/audit/* endpoints.
//
// Each test:
//   1. Builds a *real* express app and registers the handlers via the
//      factories exported from ./audit-routes (the same factories
//      server.ts uses in production — so the wiring is identical).
//   2. Mounts a fake `authenticateUser` that pulls the user id from a
//      header — exercises real express routing + query parsing.
//   3. Listens on an ephemeral port and hits the endpoints with the
//      real `fetch` global, asserting on real HTTP semantics
//      (status, content-type, body shape, CSV row contents).
//   4. Hand-rolls a tiny PostgREST-shaped query builder that captures
//      every chained method call, so we can assert exactly which
//      filters the handler pushed down to Supabase.
//
// This is the replacement for the old placeholder audit-e2e.test.ts
// that only asserted `true === true`.

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  applyAuditFilters,
  createAuditEventsHandler,
  createAuditStatsHandler,
  createAuditExportHandler,
} from './audit-routes';

// ──────────────────────────────────────────────────────────
//  Supabase query-builder stub
// ──────────────────────────────────────────────────────────
// Mirrors the chainable shape of @supabase/supabase-js so the handlers
// can call `.from().select().eq().order().range().gte()...` exactly
// like they do against the real client. Every call is recorded on
// `calls` so tests can assert on what the handler asked for.

type Call = { fn: string; args: any[] };

interface StubResult {
  data: any[] | null;
  error: any;
  count?: number;
}

function makeQueryBuilder(result: StubResult) {
  const calls: Call[] = [];
  const builder: any = {
    calls,
    _result: result,
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(this._result).then(onFulfilled, onRejected);
    },
  };
  const chainable = [
    'from', 'select', 'eq', 'in', 'or', 'gte', 'lte',
    'order', 'range', 'limit',
  ];
  for (const fn of chainable) {
    builder[fn] = (...args: any[]) => {
      calls.push({ fn, args });
      return builder;
    };
  }
  return builder;
}

function makeDb(result: StubResult) {
  const builder = makeQueryBuilder(result);
  const db = {
    _builder: builder,
    from: (...args: any[]) => builder.from(...args),
  };
  return { db, builder };
}

// ──────────────────────────────────────────────────────────
//  Test harness — real express app on a random port
// ──────────────────────────────────────────────────────────

interface Harness {
  url: string;
  close: () => Promise<void>;
  builder: ReturnType<typeof makeQueryBuilder>;
  auditLogger: { logDataOperation: ReturnType<typeof vi.fn> };
}

async function startHarness(result: StubResult, opts?: { userId?: string }): Promise<Harness> {
  const { db, builder } = makeDb(result);
  const auditLogger = {
    logDataOperation: vi.fn().mockResolvedValue({ success: true }),
  };
  const log = { error: vi.fn() };

  const app = express();
  // Lightweight auth shim — server.ts uses a Supabase round-trip, but
  // for handler-level tests we just need req.user.id to be present.
  app.use((req: any, _res, next) => {
    req.user = { id: opts?.userId ?? 'user-test-1' };
    next();
  });

  const deps = { db: db as any, auditLogger: auditLogger as any, log };
  app.get('/api/audit/events', createAuditEventsHandler(deps));
  app.get('/api/audit/stats', createAuditStatsHandler(deps));
  app.get('/api/audit/export', createAuditExportHandler(deps));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('listen failed');
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    builder,
    auditLogger,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

// ──────────────────────────────────────────────────────────
//  applyAuditFilters — unit-level coverage
// ──────────────────────────────────────────────────────────

describe('applyAuditFilters', () => {
  function spyBuilder() {
    const calls: Call[] = [];
    const b: any = {};
    for (const fn of ['or', 'in', 'eq', 'gte', 'lte']) {
      b[fn] = (...args: any[]) => {
        calls.push({ fn, args });
        return b;
      };
    }
    return { b, calls };
  }

  it('treats a dotted event_type as an exact match via .in()', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { event_type: 'agent.created' });
    expect(calls).toEqual([{ fn: 'in', args: ['event_type', ['agent.created']] }]);
  });

  it('treats a bare category as a prefix match via .or() + ilike', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { event_type: 'auth' });
    expect(calls).toEqual([{ fn: 'or', args: ['event_type.ilike.auth.%'] }]);
  });

  it('combines concrete + prefix into a single .or() clause', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { event_type: ['agent.created', 'auth', 'security'] });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('or');
    expect(calls[0].args[0]).toBe(
      'event_type.eq.agent.created,event_type.ilike.auth.%,event_type.ilike.security.%',
    );
  });

  it('drops event_type tokens that contain PostgREST metacharacters', () => {
    const { b, calls } = spyBuilder();
    // A malicious "category" trying to inject an extra clause.
    applyAuditFilters(b, { event_type: 'auth,user_id.neq.abc' });
    // The whole token is rejected by the allowlist — nothing pushed.
    expect(calls).toEqual([]);
  });

  it('escapes LIKE metacharacters in search and strips comma/paren', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { search: 'foo%_,bar)' });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('or');
    expect(calls[0].args[0]).toContain('foo\\%\\_bar');
    expect(calls[0].args[0]).not.toContain(',bar');
    expect(calls[0].args[0]).not.toContain(')');
  });

  it('escapes the escape character itself before % and _', () => {
    // Without escaping the backslash first, an input of `\%` would
    // collapse to `\%` again after the second replace and still act
    // as a wildcard. Verify we end up with `\\\\\\%` (escaped slash +
    // escaped percent).
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { search: '\\%' });
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toContain('\\\\\\%');
  });

  it('applies severity .in() and skips junk severities', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { severity: ['info', 'critical', 'bad,token'] });
    expect(calls).toEqual([{ fn: 'in', args: ['severity', ['info', 'critical']] }]);
  });

  it('uses `days` window when start_date is omitted', () => {
    const { b, calls } = spyBuilder();
    applyAuditFilters(b, { days: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('gte');
    expect(calls[0].args[0]).toBe('created_at');
    // ISO timestamp ~7 days ago, sanity check it parses.
    const ts = Date.parse(calls[0].args[1]);
    expect(Number.isFinite(ts)).toBe(true);
    expect(Date.now() - ts).toBeGreaterThan(6 * 24 * 3600 * 1000);
    expect(Date.now() - ts).toBeLessThan(8 * 24 * 3600 * 1000);
  });
});

// ──────────────────────────────────────────────────────────
//  /api/audit/events — route-level
// ──────────────────────────────────────────────────────────

describe('GET /api/audit/events', () => {
  let harness: Harness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('returns events + total and scopes by user_id', async () => {
    harness = await startHarness({
      data: [{ id: 1, event_type: 'agent.created', severity: 'info' }],
      error: null,
      count: 42,
    });
    const r = await fetch(`${harness.url}/api/audit/events?days=7`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      events: [{ id: 1, event_type: 'agent.created', severity: 'info' }],
      total: 42,
      limit: 100,
      offset: 0,
    });

    const calls = harness.builder.calls.map((c) => c.fn);
    expect(calls).toContain('from');
    expect(calls).toContain('select');
    // user-scoped
    const eqCall = harness.builder.calls.find((c) => c.fn === 'eq');
    expect(eqCall?.args).toEqual(['user_id', 'user-test-1']);
    // ordered by created_at desc
    const orderCall = harness.builder.calls.find((c) => c.fn === 'order');
    expect(orderCall?.args).toEqual(['created_at', { ascending: false }]);
    // pagination
    const rangeCall = harness.builder.calls.find((c) => c.fn === 'range');
    expect(rangeCall?.args).toEqual([0, 99]);
  });

  it('expands bare category to ilike prefix match', async () => {
    harness = await startHarness({ data: [], error: null, count: 0 });
    const r = await fetch(`${harness.url}/api/audit/events?event_type=auth&days=7`);
    expect(r.status).toBe(200);

    const orCall = harness.builder.calls.find((c) => c.fn === 'or');
    expect(orCall?.args[0]).toBe('event_type.ilike.auth.%');
  });

  it('keeps a fully-qualified event_type as an exact .in() match', async () => {
    harness = await startHarness({ data: [], error: null, count: 0 });
    await fetch(`${harness.url}/api/audit/events?event_type=agent.created&days=7`);

    const inCall = harness.builder.calls.find(
      (c) => c.fn === 'in' && c.args[0] === 'event_type',
    );
    expect(inCall?.args).toEqual(['event_type', ['agent.created']]);
  });

  it('combines multiple severities into a single .in()', async () => {
    harness = await startHarness({ data: [], error: null, count: 0 });
    await fetch(
      `${harness.url}/api/audit/events?severity=warning&severity=critical&days=7`,
    );
    const inCall = harness.builder.calls.find(
      (c) => c.fn === 'in' && c.args[0] === 'severity',
    );
    expect(inCall?.args).toEqual(['severity', ['warning', 'critical']]);
  });

  it('rejects garbage numeric parameters with 400', async () => {
    harness = await startHarness({ data: [], error: null, count: 0 });
    const r = await fetch(`${harness.url}/api/audit/events?days=abc`);
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toMatch(/numeric/i);
  });

  it('returns 500 + sanitized message when the DB errors', async () => {
    harness = await startHarness({
      data: null,
      error: { message: 'boom — table not found' },
    });
    const r = await fetch(`${harness.url}/api/audit/events?days=7`);
    expect(r.status).toBe(500);
    const body = await r.json();
    // Don't leak the raw DB message to the client.
    expect(body.error).toBe('Failed to fetch audit events');
  });

  it('clamps pagination to safe bounds', async () => {
    harness = await startHarness({ data: [], error: null, count: 0 });
    await fetch(`${harness.url}/api/audit/events?limit=9999&offset=-5&days=7`);
    const rangeCall = harness.builder.calls.find((c) => c.fn === 'range');
    // limit capped at 500, offset floored at 0
    expect(rangeCall?.args).toEqual([0, 499]);
  });
});

// ──────────────────────────────────────────────────────────
//  /api/audit/stats — route-level
// ──────────────────────────────────────────────────────────

describe('GET /api/audit/stats', () => {
  let harness: Harness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  it('aggregates by severity, by type, and sums cost', async () => {
    harness = await startHarness({
      data: [
        { event_type: 'agent.created', severity: 'info', cost_usd: 0 },
        { event_type: 'agent.updated', severity: 'info', cost_usd: 0 },
        { event_type: 'security.unauthorized_access', severity: 'critical' },
        { event_type: 'ai.api_call', severity: 'info', cost_usd: '1.25' },
        { event_type: 'ai.api_call', severity: 'info', cost_usd: 0.75 },
      ],
      error: null,
    });

    const r = await fetch(`${harness.url}/api/audit/stats?days=30`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.total_events).toBe(5);
    expect(body.by_severity).toEqual({ info: 4, critical: 1 });
    expect(body.by_type).toEqual({
      'agent.created': 1,
      'agent.updated': 1,
      'security.unauthorized_access': 1,
      'ai.api_call': 2,
    });
    expect(body.total_cost_usd).toBeCloseTo(2.0, 6);
    expect(body.period_days).toBe(30);
  });

  it('counts ai.api_call AND api.* events as API/AI usage', async () => {
    harness = await startHarness({
      data: [
        { event_type: 'ai.api_call', severity: 'info' },
        { event_type: 'ai.api_call', severity: 'info' },
        { event_type: 'api.webhook_sent', severity: 'info' },
        { event_type: 'api.intake_received', severity: 'info' },
        { event_type: 'agent.created', severity: 'info' },
        { event_type: 'auth.login', severity: 'info' },
      ],
      error: null,
    });

    const r = await fetch(`${harness.url}/api/audit/stats?days=30`);
    const body = await r.json();
    // 2 × ai.api_call + 2 × api.* = 4
    expect(body.total_api_calls).toBe(4);
  });

  it('falls back to `action` when event_type is null', async () => {
    harness = await startHarness({
      data: [
        { event_type: null, action: 'legacy_call', severity: 'info' },
      ],
      error: null,
    });
    const r = await fetch(`${harness.url}/api/audit/stats?days=30`);
    const body = await r.json();
    expect(body.by_type).toEqual({ legacy_call: 1 });
    expect(body.total_api_calls).toBe(0); // legacy_call doesn't match ai./api.
  });

  it('returns 400 on invalid days', async () => {
    harness = await startHarness({ data: [], error: null });
    const r = await fetch(`${harness.url}/api/audit/stats?days=abc`);
    expect(r.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────
//  /api/audit/export — route-level
// ──────────────────────────────────────────────────────────

describe('GET /api/audit/export', () => {
  let harness: Harness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  const sample = [
    {
      created_at: '2026-05-01T00:00:00Z',
      event_type: 'agent.created',
      severity: 'info',
      action: 'created',
      actor_email: 'op@example.com',
      resource_type: 'agent',
      resource_id: 'node-sales-1',
      ip_address: '10.0.0.1',
      cost_usd: 0.0123,
      latency_ms: 250,
    },
    {
      created_at: '2026-05-02T00:00:00Z',
      event_type: 'security.unauthorized_access',
      severity: 'critical',
      action: 'unauthorized_access',
      actor_email: '=SUM(A1:A10)', // formula-injection attempt
      resource_type: 'agent',
      resource_id: 'node-sales-1',
      ip_address: '10.0.0.2',
      cost_usd: null,
      latency_ms: null,
    },
  ];

  it('emits a CSV with the expected headers and a row per event', async () => {
    harness = await startHarness({ data: sample, error: null });
    const r = await fetch(`${harness.url}/api/audit/export?days=7`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="audit-log-/);
    const csv = await r.text();
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'created_at,event_type,severity,action,actor_email,resource_type,resource_id,ip_address,cost_usd,latency_ms',
    );
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('"agent.created"');
    expect(lines[1]).toContain('"node-sales-1"');
  });

  it('prefixes formula-injection attempts in CSV cells', async () => {
    harness = await startHarness({ data: sample, error: null });
    const r = await fetch(`${harness.url}/api/audit/export?days=7`);
    const csv = await r.text();
    // The "=SUM(...)" cell should be defanged with a leading single quote.
    expect(csv).toContain(`"'=SUM(A1:A10)"`);
  });

  it('defangs every dangerous CSV leading character (= @ + -)', async () => {
    // sanitizeCSV should prefix `=`, `@`, `+`, `-` with a single quote
    // so spreadsheets render them as text instead of formulas.
    const danger = [
      { event_type: 'agent.created', severity: 'info', action: '=cmd' },
      { event_type: 'agent.created', severity: 'info', action: '@SUM(1)' },
      { event_type: 'agent.created', severity: 'info', action: '+1+1' },
      { event_type: 'agent.created', severity: 'info', action: '-1-1' },
    ];
    harness = await startHarness({ data: danger, error: null });
    const r = await fetch(`${harness.url}/api/audit/export?days=7`);
    const csv = await r.text();
    expect(csv).toContain(`"'=cmd"`);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'-1-1"`);
  });

  it('honors event_type filters identically to /events', async () => {
    harness = await startHarness({ data: [], error: null });
    await fetch(
      `${harness.url}/api/audit/export?event_type=auth&severity=critical&days=7`,
    );
    const orCalls = harness.builder.calls.filter((c) => c.fn === 'or');
    expect(orCalls.some((c) => c.args[0] === 'event_type.ilike.auth.%')).toBe(true);
    const sevIn = harness.builder.calls.find(
      (c) => c.fn === 'in' && c.args[0] === 'severity',
    );
    expect(sevIn?.args).toEqual(['severity', ['critical']]);
  });

  it('honors start_date / end_date / resource_type / search filters', async () => {
    harness = await startHarness({ data: [], error: null });
    const qs = new URLSearchParams({
      start_date: '2026-01-01T00:00:00Z',
      end_date: '2026-02-01T00:00:00Z',
      resource_type: 'agent',
      search: 'sales',
      days: '30',
    });
    await fetch(`${harness.url}/api/audit/export?${qs}`);

    const gte = harness.builder.calls.find(
      (c) => c.fn === 'gte' && c.args[0] === 'created_at',
    );
    expect(gte?.args[1]).toBe('2026-01-01T00:00:00Z');
    const lte = harness.builder.calls.find(
      (c) => c.fn === 'lte' && c.args[0] === 'created_at',
    );
    expect(lte?.args[1]).toBe('2026-02-01T00:00:00Z');
    const resEq = harness.builder.calls.find(
      (c) => c.fn === 'eq' && c.args[0] === 'resource_type',
    );
    expect(resEq?.args).toEqual(['resource_type', 'agent']);
    // search expands to an `or` clause across action/actor_email/resource_id
    const searchOr = harness.builder.calls.find(
      (c) => c.fn === 'or' && String(c.args[0]).includes('action.ilike'),
    );
    expect(searchOr?.args[0]).toContain('actor_email.ilike.%sales%');
    expect(searchOr?.args[0]).toContain('resource_id.ilike.%sales%');
  });

  it('returns JSON when format=json and audits the export itself', async () => {
    harness = await startHarness({ data: sample, error: null });
    const r = await fetch(`${harness.url}/api/audit/export?format=json&days=7`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    expect(harness.auditLogger.logDataOperation).toHaveBeenCalledWith(
      'export',
      expect.objectContaining({
        userId: 'user-test-1',
        resourceType: 'audit_log',
        recordCount: 2,
      }),
    );
  });

  it('returns 500 when the DB errors and skips the export-of-export audit', async () => {
    harness = await startHarness({
      data: null,
      error: { message: 'boom' },
    });
    const r = await fetch(`${harness.url}/api/audit/export?days=7`);
    expect(r.status).toBe(500);
    expect(harness.auditLogger.logDataOperation).not.toHaveBeenCalled();
  });
});
