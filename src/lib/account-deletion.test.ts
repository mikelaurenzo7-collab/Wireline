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

// ──────────────────────────────────────────────────────────
// Mock @supabase/supabase-js → createClient → auth.admin.deleteUser
// ──────────────────────────────────────────────────────────
const deleteUserMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { deleteUser: deleteUserMock } },
  }),
}));

function makeDb() {
  const calls: Array<{ table: string; col: string; value: string }> = [];
  const db = {
    from(table: string) {
      return {
        delete() {
          return {
            eq: (col: string, value: string) => {
              calls.push({ table, col, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { db, calls };
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
  beforeEach(() => {
    deleteUserMock.mockClear();
    deleteUserMock.mockResolvedValue({ error: null });
  });

  const log = {
    warn: vi.fn(),
    error: vi.fn(),
  };

  it('deletes from every wireline_* table and removes the auth row', async () => {
    const { db, calls } = makeDb();

    const result = await purgeAccount('user-1', {
      db: db as any,
      log,
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'test-service-role',
    });

    expect(result.ok).toBe(true);
    expect(result.authRemoved).toBe(true);
    expect(result.tablesTouched).toEqual([...ACCOUNT_DELETION_TABLES]);

    // Every table was touched exactly once.
    expect(calls).toHaveLength(ACCOUNT_DELETION_TABLES.length);

    // wireline_team_members / change_log / incidents scope by tenant_id;
    // everything else by user_id.
    for (const c of calls) {
      const expectedCol = ['wireline_team_members', 'wireline_change_log', 'wireline_incidents'].includes(c.table)
        ? 'tenant_id'
        : 'user_id';
      expect(c.col).toBe(expectedCol);
      expect(c.value).toBe('user-1');
    }

    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
  });

  it('returns ok=false when auth.admin.deleteUser fails', async () => {
    const { db } = makeDb();
    deleteUserMock.mockResolvedValueOnce({ error: { message: 'auth boom' } });

    const result = await purgeAccount('user-2', {
      db: db as any,
      log,
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'test-service-role',
    });

    expect(result.ok).toBe(false);
    expect(result.authRemoved).toBe(false);
    expect(result.error).toContain('auth boom');
  });

  it('returns ok=false when admin credentials are missing', async () => {
    const { db } = makeDb();
    const result = await purgeAccount('user-3', {
      db: db as any,
      log,
      // No supabaseUrl / serviceRoleKey, and we have to ensure process.env
      // is empty for this test path.
      supabaseUrl: '',
      serviceRoleKey: '',
    });

    // Tables are still cleaned even without auth-removal creds.
    expect(result.tablesTouched.length).toBe(ACCOUNT_DELETION_TABLES.length);
    expect(result.ok).toBe(false);
    expect(result.authRemoved).toBe(false);
    expect(result.error).toMatch(/admin credentials/i);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('continues past per-table errors and records only tables that succeeded', async () => {
    const calls: Array<{ table: string }> = [];
    const dbWithErrors = {
      from(table: string) {
        return {
          delete() {
            return {
              eq: () => {
                calls.push({ table });
                if (table === 'wireline_call_logs') {
                  return Promise.resolve({ error: { message: 'fk violation' } });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };

    const result = await purgeAccount('user-4', {
      db: dbWithErrors as any,
      log,
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'test-service-role',
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
