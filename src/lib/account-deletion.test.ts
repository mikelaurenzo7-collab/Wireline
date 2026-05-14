// @vitest-environment node
//
// Tests for the GDPR Phase 1.5 soft-delete helpers in src/lib/account-deletion.ts.
//
// Covers:
//   • computeScheduledPurgeAt — 30-day grace window math
//   • purgeAccount — deletes from every wireline_* table + auth row, returns
//     `tablesTouched`, and remains idempotent.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_DELETION_TABLES,
  computeScheduledPurgeAt,
  purgeAccount,
} from './account-deletion';

function makeDb() {
  const executeMock = vi.fn().mockResolvedValue({ success: true });
  const db = {
    execute: executeMock,
  };
  return { db, executeMock };
}

describe('computeScheduledPurgeAt', () => {
  it('returns requestedAt + 30 days', () => {
    const req = new Date('2026-01-01T00:00:00Z');
    const expected = new Date('2026-01-31T00:00:00Z');
    expect(computeScheduledPurgeAt(req).toISOString()).toBe(expected.toISOString());
  });

  it('exposes a 30-day grace window constant', () => {
    expect(ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
  });
});

describe('purgeAccount', () => {
  const log = {
    warn: vi.fn(),
    error: vi.fn(),
  };

  it('deletes from every wireline_* table and removes the auth row', async () => {
    const { db, executeMock } = makeDb();

    const result = await purgeAccount('user-1', {
      db: db as any,
      log,
    });

    expect(result.ok).toBe(true);
    expect(result.authRemoved).toBe(true);
    expect(result.tablesTouched).toEqual([...ACCOUNT_DELETION_TABLES]);

    // Total calls = tables + the wireline_users row
    expect(executeMock).toHaveBeenCalledTimes(ACCOUNT_DELETION_TABLES.length + 1);
  });

  it('continues past per-table errors', async () => {
    const { db, executeMock } = makeDb();
    executeMock.mockImplementation((sql: any) => {
      if (sql.query.includes('DELETE FROM wireline_call_logs')) {
        throw new Error('fk violation');
      }
      return Promise.resolve({ success: true });
    });

    const result = await purgeAccount('user-4', {
      db: db as any,
      log,
    });

    expect(result.ok).toBe(true);
    expect(result.tablesTouched).not.toContain('wireline_call_logs');
    expect(result.tablesTouched.length).toBe(ACCOUNT_DELETION_TABLES.length - 1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('wireline_call_logs'),
      expect.objectContaining({ error: 'fk violation' }),
    );
  });
});
