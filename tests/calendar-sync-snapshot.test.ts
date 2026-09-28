import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  userId: string;
  accountId: string;
  externalEventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: string;
};
const h = vi.hoisted(() => ({
  rows: [] as Row[],
  failId: "",
  tenant: "",
  lock: "",
  steps: [] as string[],
}));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  type Sql = Parameters<typeof dialect.sqlToQuery>[0];
  return {
    tenantStore: {
      run: (userId: string, work: () => unknown) => {
        h.tenant = userId;
        return work();
      },
    },
    drizzle: {
      transaction: async (work: (tx: unknown) => Promise<void>) => {
        const saved = structuredClone(h.rows);
        try {
          await work({
            execute: async (sql: Sql) => {
              const query = dialect.sqlToQuery(sql);
              expect(query.sql).toContain("pg_advisory_xact_lock");
              h.lock = String(query.params[0]);
              h.steps.push("lock");
            },
            delete: () => ({
              where: async (sql: Sql) => {
                const query = dialect.sqlToQuery(sql);
                expect(query.sql).toContain('"user_id" =');
                expect(query.sql).toContain('"account_id" =');
                expect(query.sql).toContain('"start_time" <');
                expect(query.sql).toContain('"end_time" >');
                const [user, account, end, start] = query.params;
                h.steps.push("delete");
                h.rows = h.rows.filter(
                  (row) =>
                    !(
                      row.userId === user &&
                      row.accountId === account &&
                      row.startTime < new Date(String(end)) &&
                      row.endTime > new Date(String(start))
                    ),
                );
              },
            }),
            insert: () => ({
              values: (row: Row) => ({
                onConflictDoUpdate: async () => {
                  h.steps.push(`insert:${row.externalEventId}`);
                  if (row.externalEventId === h.failId) throw new Error("Database unavailable");
                  const prior = h.rows.findIndex(
                    (entry) =>
                      entry.accountId === row.accountId &&
                      entry.externalEventId === row.externalEventId,
                  );
                  if (prior >= 0) h.rows[prior] = row;
                  else h.rows.push(row);
                },
              }),
            }),
          });
        } catch (error) {
          h.rows = saved;
          throw error;
        }
      },
    },
  };
});

import {
  googleAllDayInterval,
  googleTimedInstant,
  importedCalendarInterval,
  replaceCalendarSnapshot,
} from "../src/services/calendar-sync-snapshot";
const interval = {
  startTime: new Date("2026-10-02T15:00:00Z"),
  endTime: new Date("2026-10-02T15:30:00Z"),
};
const old = (id: string, extra: Partial<Row> = {}): Row => ({
  userId: "tenant-1",
  accountId: "account-1",
  externalEventId: id,
  title: "Busy",
  status: "confirmed",
  ...interval,
  ...extra,
});
const input = (events: Row[]) => ({
  userId: "tenant-1",
  accountId: "account-1",
  timeMin: "2026-10-01T00:00:00Z",
  timeMax: "2026-10-31T00:00:00Z",
  events,
});
beforeEach(() => {
  h.rows = [];
  h.failId = "";
  h.steps = [];
  h.tenant = "";
  h.lock = "";
});

describe("atomic busy-time cache replacement", () => {
  it("takes the native booking lock and replaces only this tenant/account/range", async () => {
    const otherTenant = old("other-tenant", { userId: "tenant-2", accountId: "account-2" });
    const otherAccount = old("other-account", { accountId: "account-3" });
    const outside = old("outside", {
      startTime: new Date("2026-11-02T15:00:00Z"),
      endTime: new Date("2026-11-02T16:00:00Z"),
    });
    h.rows = [old("deleted-upstream"), otherTenant, otherAccount, outside];
    await replaceCalendarSnapshot(input([old("new")]));
    expect(h.tenant).toBe("tenant-1");
    expect(h.lock).toBe("native-calendar:tenant-1");
    expect(h.steps).toEqual(["lock", "delete", "insert:new"]);
    expect(h.rows).toEqual([
      otherTenant,
      otherAccount,
      outside,
      expect.objectContaining({
        externalEventId: "new",
        userId: "tenant-1",
        accountId: "account-1",
      }),
    ]);
  });

  it("retains every previous event when any replacement write fails", async () => {
    h.rows = [old("old")];
    h.failId = "second";
    await expect(replaceCalendarSnapshot(input([old("first"), old("second")]))).rejects.toThrow(
      "Database unavailable",
    );
    expect(h.rows).toEqual([old("old")]);
  });

  it("clears obsolete busy time after a complete empty provider response", async () => {
    h.rows = [old("removed")];
    await replaceCalendarSnapshot(input([]));
    expect(h.rows).toEqual([]);
  });

  it("refuses an invalid snapshot window before mutation", async () => {
    await expect(
      replaceCalendarSnapshot({ ...input([]), timeMax: "2026-09-01T00:00:00Z" }),
    ).rejects.toThrow("invalid time interval");
    expect(h.steps).toEqual([]);
  });
});

describe("imported calendar instants", () => {
  it("uses the calendar timezone and exclusive end for a DST all-day event", () => {
    expect(googleAllDayInterval("2026-11-01", "2026-11-02", "America/Chicago")).toEqual({
      startTime: new Date("2026-11-01T05:00:00Z"),
      endTime: new Date("2026-11-02T06:00:00Z"),
    });
  });

  it("accepts timed events with either an explicit offset or explicit IANA zone", () => {
    expect(
      googleTimedInstant({ dateTime: "2026-10-02T10:00:12.500", timeZone: "America/Chicago" }),
    ).toBe("2026-10-02T15:00:12.500Z");
    expect(
      importedCalendarInterval("2026-10-02T10:00:00-05:00", "2026-10-02T10:30:00-05:00"),
    ).toEqual(interval);
  });

  it("does not guess missing or DST-ambiguous event times", () => {
    expect(() => googleAllDayInterval("2026-10-02", "2026-10-03", "")).toThrow();
    expect(() => googleTimedInstant({ dateTime: "2026-10-02T10:00:00" })).toThrow();
    expect(() =>
      googleTimedInstant({ dateTime: "2026-11-01T01:30:00", timeZone: "America/Chicago" }),
    ).toThrow();
    expect(() => importedCalendarInterval("2026-10-02T15:00:00", "2026-10-02T16:00:00")).toThrow();
    expect(() => importedCalendarInterval("invalidZ", "invalidZ")).toThrow();
  });
});
