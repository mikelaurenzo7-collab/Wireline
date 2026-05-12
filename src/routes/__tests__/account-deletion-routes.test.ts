// @vitest-environment node
//
// Route tests for the GDPR Phase 1.5 soft-delete grace-period flow.
//
// Covers:
//   • DELETE /api/user/account  — enqueues a deletion request (no hard delete)
//   • POST   /api/account/cancel-deletion  — cancels within grace; rejects after
//
// These tests boot a real Express app, mount the settings router with mocked
// server-context (db + auditLogger + log), and hit the endpoints via fetch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';

const mocks = vi.hoisted(() => ({
  dbFrom: vi.fn(),
  logAccountDeletionRequested: vi.fn().mockResolvedValue({ success: true }),
  logAccountDeletionCancelled: vi.fn().mockResolvedValue({ success: true }),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('../../lib/server-context', () => ({
  db: { from: mocks.dbFrom },
  log: { info: mocks.logInfo, warn: mocks.logWarn, error: mocks.logError },
  auditLogger: {
    logAccountDeletionRequested: mocks.logAccountDeletionRequested,
    logAccountDeletionCancelled: mocks.logAccountDeletionCancelled,
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    const uid = req.headers['x-test-user-id'];
    if (!uid) return _res.status(401).json({ error: 'unauthorized' });
    req.user = { id: uid };
    next();
  },
}));

vi.mock('../../middleware/api-rate-limits', () => ({
  jobsRateLimit: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../lib/job-queue', () => ({
  enqueue: vi.fn().mockResolvedValue({ ok: true, jobId: 'job-1' }),
}));

// Tiny chainable PostgREST stub.
interface StubResult {
  data: any;
  error: any;
}
function makeChain(result: StubResult, captures: any[]) {
  const chain: any = {
    _ops: [] as Array<{ fn: string; args: any[] }>,
    insert(values: any) {
      chain._ops.push({ fn: 'insert', args: [values] });
      captures.push({ op: 'insert', values });
      return chain;
    },
    update(values: any) {
      chain._ops.push({ fn: 'update', args: [values] });
      captures.push({ op: 'update', values });
      return chain;
    },
    select() {
      return chain;
    },
    eq(col: string, value: any) {
      chain._ops.push({ fn: 'eq', args: [col, value] });
      captures.push({ op: 'eq', col, value });
      return chain;
    },
    single() {
      return Promise.resolve(result);
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
  };
  return chain;
}

async function startApp() {
  // Import AFTER mocks are registered.
  const { default: router } = await import('../settings-routes');
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('listen failed');
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

describe('DELETE /api/user/account — soft-delete enqueue', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.dbFrom.mockReset();
    mocks.logAccountDeletionRequested.mockClear();
  });

  it('rejects without confirmation phrase', async () => {
    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/user/account`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error).toMatch(/DELETE MY ACCOUNT/);
      expect(body.grace_days).toBe(30);
    } finally {
      await harness.close();
    }
  });

  it('inserts a pending row and returns 202 with scheduled_purge_at', async () => {
    const inserted = {
      id: 'q-1',
      scheduled_purge_at: '2026-06-11T00:00:00.000Z',
    };
    const captures: any[] = [];

    // First call: lookup existing → none. Second call: insert → returns row.
    mocks.dbFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }, captures))
      .mockReturnValueOnce(makeChain({ data: inserted, error: null }, captures));

    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/user/account`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
        body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }),
      });
      expect(res.status).toBe(202);
      const body: any = await res.json();
      expect(body.status).toBe('pending');
      expect(body.scheduled_purge_at).toBe(inserted.scheduled_purge_at);
      expect(body.grace_days).toBe(30);
      expect(body.cancel_endpoint).toBe('/api/account/cancel-deletion');
      expect(mocks.dbFrom).toHaveBeenCalledWith('wireline_deletion_queue');
      // First op on insert chain captures the insert payload.
      const insertCall = captures.find((c) => c.op === 'insert');
      expect(insertCall?.values?.user_id).toBe('u1');
      expect(insertCall?.values?.status).toBe('pending');
      expect(mocks.logAccountDeletionRequested).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', scheduledPurgeAt: inserted.scheduled_purge_at }),
      );
    } finally {
      await harness.close();
    }
  });

  it('returns the existing pending row instead of inserting twice', async () => {
    const existing = {
      id: 'q-existing',
      scheduled_purge_at: '2026-06-01T00:00:00.000Z',
      status: 'pending',
    };
    const captures: any[] = [];
    mocks.dbFrom.mockReturnValueOnce(makeChain({ data: existing, error: null }, captures));

    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/user/account`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
        body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }),
      });
      expect(res.status).toBe(202);
      const body: any = await res.json();
      expect(body.scheduled_purge_at).toBe(existing.scheduled_purge_at);
      expect(captures.some((c) => c.op === 'insert')).toBe(false);
    } finally {
      await harness.close();
    }
  });
});

describe('POST /api/account/cancel-deletion', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.dbFrom.mockReset();
    mocks.logAccountDeletionCancelled.mockClear();
  });

  it('returns 404 when no pending deletion exists', async () => {
    const captures: any[] = [];
    mocks.dbFrom.mockReturnValueOnce(makeChain({ data: null, error: null }, captures));

    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/account/cancel-deletion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
      });
      expect(res.status).toBe(404);
    } finally {
      await harness.close();
    }
  });

  it('cancels when within the grace window', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const captures: any[] = [];
    mocks.dbFrom
      .mockReturnValueOnce(
        makeChain(
          {
            data: { id: 'q-1', scheduled_purge_at: future, status: 'pending' },
            error: null,
          },
          captures,
        ),
      )
      .mockReturnValueOnce(makeChain({ data: null, error: null }, captures));

    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/account/cancel-deletion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
      });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe('cancelled');
      const updateCall = captures.find((c) => c.op === 'update');
      expect(updateCall?.values?.status).toBe('cancelled');
      expect(updateCall?.values?.cancelled_at).toBeDefined();
      expect(mocks.logAccountDeletionCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1' }),
      );
    } finally {
      await harness.close();
    }
  });

  it('rejects with 410 when the grace window has elapsed', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const captures: any[] = [];
    mocks.dbFrom.mockReturnValueOnce(
      makeChain(
        {
          data: { id: 'q-1', scheduled_purge_at: past, status: 'pending' },
          error: null,
        },
        captures,
      ),
    );

    const harness = await startApp();
    try {
      const res = await fetch(`${harness.url}/api/account/cancel-deletion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user-id': 'u1' },
      });
      expect(res.status).toBe(410);
      const body: any = await res.json();
      expect(body.error).toMatch(/grace period/i);
      // Must NOT have invoked the update path.
      expect(captures.some((c) => c.op === 'update')).toBe(false);
      expect(mocks.logAccountDeletionCancelled).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });
});
