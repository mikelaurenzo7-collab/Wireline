import { describe, it, expect, vi } from "vitest";
import {
  USER_SCOPED_TABLES,
  PRESERVED_TABLES,
  buildAccountExport,
  hardDeleteAccount,
  deletionDeadline,
  DEFAULT_GRACE_PERIOD_DAYS,
} from "./account-deletion";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("USER_SCOPED_TABLES inventory", () => {
  it("contains the load-bearing tenant tables", () => {
    // Spot-check: if any of these go missing, account deletion would
    // silently leak that table's data — fail loudly.
    for (const expected of [
      "wireline_agents",
      "wireline_call_logs",
      "wireline_email_messages",
      "wireline_appointments",
      "wireline_outbound_leads",
      "wireline_consent_log",
      "wireline_jobs",
    ]) {
      expect(USER_SCOPED_TABLES).toContain(expected);
    }
  });

  it("does NOT include preserved-for-compliance tables", () => {
    for (const t of PRESERVED_TABLES) {
      expect(USER_SCOPED_TABLES as readonly string[]).not.toContain(t);
    }
  });

  it("never duplicates a table name", () => {
    const seen = new Set<string>();
    for (const t of USER_SCOPED_TABLES) {
      expect(seen.has(t), `duplicate entry: ${t}`).toBe(false);
      seen.add(t);
    }
  });
});

describe("deletionDeadline", () => {
  it("uses the default 7-day window when none provided", () => {
    const deadline = deletionDeadline(new Date("2026-05-11T00:00:00Z"));
    expect(deadline).toBe("2026-05-18T00:00:00.000Z");
    expect(DEFAULT_GRACE_PERIOD_DAYS).toBe(7);
  });

  it("respects a custom grace period", () => {
    const deadline = deletionDeadline(new Date("2026-05-11T00:00:00Z"), 14);
    expect(deadline).toBe("2026-05-25T00:00:00.000Z");
  });

  it("falls back to default for invalid grace inputs", () => {
    const deadline = deletionDeadline(new Date("2026-05-11T00:00:00Z"), -1);
    expect(deadline).toBe("2026-05-18T00:00:00.000Z");
  });
});

// ──────────────────────────────────────────────────────────────────────
// buildAccountExport — uses a fake Supabase client.
// ──────────────────────────────────────────────────────────────────────

function makeExportDb(perTable: Record<string, unknown[]>): SupabaseClient {
  const fromImpl = (table: string) => {
    if (table === "wireline_settings") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: perTable[table]?.[0] ?? null, error: null }),
      };
      return chain;
    }
    let pageReturned = false;
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      range: (_from: number, _to: number) => {
        // Return rows once, then an empty page to terminate.
        if (pageReturned) return Promise.resolve({ data: [], error: null });
        pageReturned = true;
        return Promise.resolve({ data: perTable[table] ?? [], error: null });
      },
    };
    return chain;
  };
  return { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
}

describe("buildAccountExport", () => {
  it("returns rows for every table in USER_SCOPED_TABLES + settings", async () => {
    const fixture = {
      wireline_agents: [{ id: "a-1", user_id: "u-1", name: "Alice" }],
      wireline_call_logs: [{ id: 1, user_id: "u-1", duration_seconds: 30 }],
      wireline_settings: [{ user_id: "u-1", subscription_status: "active" }],
    };
    const db = makeExportDb(fixture);
    const archive = await buildAccountExport(db, "u-1");

    expect(archive.user_id).toBe("u-1");
    expect(archive.format_version).toBe(1);
    expect(archive.tables.wireline_agents).toEqual(fixture.wireline_agents);
    expect(archive.tables.wireline_call_logs).toEqual(fixture.wireline_call_logs);
    expect(archive.tables.wireline_settings).toEqual(fixture.wireline_settings);
    // Tables with no fixture rows still appear as []
    expect(archive.tables.wireline_appointments).toEqual([]);
    expect(archive.truncated).toEqual([]);
  });

  it("records errors in `truncated` rather than throwing", async () => {
    const fromImpl = (table: string) => {
      if (table === "wireline_settings") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        range: () => Promise.resolve({ data: null, error: { message: `${table} blew up` } }),
      };
      return chain;
    };
    const db = { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
    const archive = await buildAccountExport(db, "u-1");
    expect(archive.truncated.length).toBeGreaterThan(0);
    expect(archive.truncated[0]).toMatch(/blew up/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// hardDeleteAccount
// ──────────────────────────────────────────────────────────────────────

describe("hardDeleteAccount", () => {
  it("deletes from every user-scoped table and anonymizes the audit log", async () => {
    const tablesTouched: string[] = [];
    const auditUpdates: { table: string; op: "update" | "delete" }[] = [];

    const fromImpl = (table: string) => {
      const chain: any = {
        delete: () => chain,
        update: () => {
          auditUpdates.push({ table, op: "update" });
          return chain;
        },
        eq: () => {
          tablesTouched.push(table);
          return Promise.resolve({ error: null, count: 1 });
        },
      };
      return chain;
    };
    const db = { from: vi.fn(fromImpl) } as unknown as SupabaseClient;

    const result = await hardDeleteAccount(db, "u-1");

    // Every USER_SCOPED_TABLES entry was visited
    for (const t of USER_SCOPED_TABLES) {
      expect(tablesTouched).toContain(t);
    }
    // Audit log was anonymized via update, not deleted
    expect(auditUpdates.find((u) => u.table === "wireline_audit_log")).toBeDefined();
    // wireline_settings was wiped at the end
    expect(tablesTouched).toContain("wireline_settings");

    expect(result.errors).toEqual([]);
    expect(result.rows_deleted.wireline_agents).toBe(1);
    expect(result.rows_deleted.wireline_settings).toBe(1);
  });

  it("collects per-table errors without aborting", async () => {
    const fromImpl = (table: string) => {
      const chain: any = {
        delete: () => chain,
        update: () => chain,
        eq: () => Promise.resolve({
          error: table === "wireline_call_logs" ? { message: "rls blocked" } : null,
          count: 1,
        }),
      };
      return chain;
    };
    const db = { from: vi.fn(fromImpl) } as unknown as SupabaseClient;
    const result = await hardDeleteAccount(db, "u-1");
    expect(result.errors).toEqual(["wireline_call_logs: rls blocked"]);
    // Other tables still tallied
    expect(result.rows_deleted.wireline_agents).toBe(1);
  });
});
