import { describe, it, expect, vi } from "vitest";
import { cutoffFor, purgeForTenant, runRetentionPurge } from "./retention";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("cutoffFor", () => {
  const now = new Date("2026-05-11T00:00:00Z");

  it("returns null when retention is disabled", () => {
    expect(cutoffFor(null, now)).toBeNull();
    expect(cutoffFor(undefined, now)).toBeNull();
    expect(cutoffFor(0, now)).toBeNull();
    expect(cutoffFor(-3, now)).toBeNull();
  });

  it("computes a cutoff N days before now", () => {
    const c = cutoffFor(7, now)!;
    expect(c).toBe("2026-05-04T00:00:00.000Z");
  });
});

// ──────────────────────────────────────────────────────────────────────
// purgeForTenant — exercise the full delete chain on a fake client.
// ──────────────────────────────────────────────────────────────────────

interface ChainCall {
  table: string;
  user_id?: string;
  cutoff?: string;
  cutoffField?: string;
}

function makeFakeDb(opts: {
  callLogsDeleted?: number;
  emailMessagesDeleted?: number;
  emailThreadsDeleted?: number;
  callLogsError?: string;
}): { db: SupabaseClient; calls: ChainCall[] } {
  const calls: ChainCall[] = [];
  const counts: Record<string, number> = {
    wireline_call_logs:       opts.callLogsDeleted ?? 0,
    wireline_email_messages:  opts.emailMessagesDeleted ?? 0,
    wireline_email_threads:   opts.emailThreadsDeleted ?? 0,
  };
  const errors: Record<string, string | undefined> = {
    wireline_call_logs: opts.callLogsError,
  };

  const fromImpl = (table: string) => {
    let chainTable = table;
    let chainUserId: string | undefined;
    let chainCutoffField: string | undefined;
    let chainCutoff: string | undefined;

    const chain: any = {
      delete: (_o?: unknown) => chain,
      eq: (col: string, val: string) => {
        if (col === "user_id") chainUserId = val;
        return chain;
      },
      lt: (col: string, val: string) => {
        chainCutoffField = col;
        chainCutoff = val;
        calls.push({ table: chainTable, user_id: chainUserId, cutoff: chainCutoff, cutoffField: chainCutoffField });
        return Promise.resolve({
          error: errors[chainTable] ? { message: errors[chainTable] } : null,
          count: counts[chainTable] ?? 0,
        });
      },
    };
    return chain;
  };

  const db = { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
  return { db, calls };
}

describe("purgeForTenant", () => {
  it("deletes from all three tables when both retentions are configured", async () => {
    const { db, calls } = makeFakeDb({
      callLogsDeleted: 7, emailMessagesDeleted: 4, emailThreadsDeleted: 1,
    });
    const stats = await purgeForTenant(db, {
      user_id: "user-1",
      retention_days_call_logs: 30,
      retention_days_emails: 90,
    }, new Date("2026-05-11T00:00:00Z"));

    expect(stats.call_logs_deleted).toBe(7);
    expect(stats.email_messages_deleted).toBe(4);
    expect(stats.email_threads_deleted).toBe(1);
    expect(stats.errors).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual([
      "wireline_call_logs",
      "wireline_email_messages",
      "wireline_email_threads",
    ]);
    expect(calls.every((c) => c.user_id === "user-1")).toBe(true);
  });

  it("skips email tables when only call retention is set", async () => {
    const { db, calls } = makeFakeDb({ callLogsDeleted: 2 });
    const stats = await purgeForTenant(db, {
      user_id: "user-2",
      retention_days_call_logs: 30,
      retention_days_emails: null,
    });
    expect(stats.email_messages_deleted).toBe(0);
    expect(stats.email_threads_deleted).toBe(0);
    expect(calls.map((c) => c.table)).toEqual(["wireline_call_logs"]);
  });

  it("captures errors per-table without aborting", async () => {
    const { db } = makeFakeDb({ callLogsError: "permission denied", emailMessagesDeleted: 3 });
    const stats = await purgeForTenant(db, {
      user_id: "user-3",
      retention_days_call_logs: 30,
      retention_days_emails: 30,
    });
    expect(stats.errors).toEqual(["call_logs: permission denied"]);
    expect(stats.email_messages_deleted).toBe(3);
  });

  it("does nothing when retention is disabled for both", async () => {
    const { db, calls } = makeFakeDb({});
    const stats = await purgeForTenant(db, {
      user_id: "user-4",
      retention_days_call_logs: null,
      retention_days_emails: 0,
    });
    expect(stats.call_logs_deleted).toBe(0);
    expect(stats.email_messages_deleted).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("runRetentionPurge", () => {
  it("aggregates stats across multiple tenants", async () => {
    // Build a fake db where the settings scan returns two tenants on
    // the first page and zero on the second, plus a uniform per-tenant
    // delete result.
    const tenants = [
      { user_id: "u1", retention_days_call_logs: 30, retention_days_emails: null },
      { user_id: "u2", retention_days_call_logs: null, retention_days_emails: 60 },
    ];

    let scanCalls = 0;
    const fromImpl = (table: string) => {
      if (table === "wireline_settings") {
        const chain: any = {
          select: () => chain,
          or: () => chain,
          range: () => {
            scanCalls++;
            // First page returns the two tenants; second page returns nothing.
            return Promise.resolve({
              data: scanCalls === 1 ? tenants : [],
              error: null,
            });
          },
        };
        return chain;
      }
      // Delete chain: always succeed with count=1.
      const chain: any = {
        delete: () => chain,
        eq: () => chain,
        lt: () => Promise.resolve({ error: null, count: 1 }),
      };
      return chain;
    };
    const db = { from: vi.fn(fromImpl) } as unknown as SupabaseClient;

    const summary = await runRetentionPurge(db);
    expect(summary.tenants_scanned).toBe(2);
    expect(summary.tenants_purged).toBe(2);
    // u1 only has call_logs configured (1 row); u2 only has emails (1 msg + 1 thread).
    expect(summary.total_call_logs_deleted).toBe(1);
    expect(summary.total_email_messages_deleted).toBe(1);
    expect(summary.total_email_threads_deleted).toBe(1);
    expect(summary.errors).toEqual([]);
  });
});
