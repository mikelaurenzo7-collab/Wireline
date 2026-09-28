import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: new Map<string, Array<Record<string, any>>>(),
  locks: new Map<string, Promise<void>>(),
  nextId: 1,
  unguardedReads: 0,
  failAudit: false,
}));
vi.mock("../src/lib/dashboard-cache", () => ({ invalidateDashboard: vi.fn() }));
vi.mock("../src/lib/server-context", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const schema = await import("../src/db/schema");
  const clone = <T>(value: T) => structuredClone(value);
  function database() {
    let release: (() => void) | undefined;
    let locked = false;
    const undo: Array<() => void> = [];
    const db = {
      async execute(query: any) {
        const { sql, params } = dialect.sqlToQuery(query);
        expect(sql).toContain("pg_advisory_xact_lock");
        const key = String(params[0]);
        const previous = h.locks.get(key) ?? Promise.resolve();
        let unlock!: () => void;
        const current = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        h.locks.set(
          key,
          previous.then(() => current),
        );
        await previous;
        locked = true;
        release = unlock;
      },
      select(selection?: Record<string, any>) {
        let table: any;
        let condition: any;
        const run = () => {
          if (!locked) h.unguardedReads++;
          const name = getTableName(table);
          const query = dialect.sqlToQuery(condition);
          const params = query.params;
          let rows = (h.rows.get(name) ?? []).filter(
            (row) => row.userId === params[name === "wireline_agents" ? 1 : 0],
          );
          if (name === "wireline_appointments") {
            if (query.sql.includes('"booking_request_key" ='))
              rows = rows.filter((row) => row.bookingRequestKey === params[1]);
            else if (query.sql.includes('"id" ='))
              rows = rows.filter((row) => row.id === params[1]);
            else {
              const date = params.find(
                (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
              ) as string;
              const instants = params.filter(
                (value) => typeof value === "string" && /^\d{4}-.*T/.test(value),
              ) as string[];
              rows = rows.filter(
                (row) =>
                  !row.demo &&
                  ["Scheduled", "Confirmed", "Requested", "Rescheduled"].includes(row.status) &&
                  (row.startAt
                    ? row.startAt < new Date(instants[0]) &&
                      new Date(row.endAt.getTime() + row.bufferMinutes * 60000) >
                        new Date(instants[1])
                    : row.date === date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "")),
              );
            }
          }
          if (name === "wireline_agents")
            rows = rows.filter((row) => row.id === params[0] && row.userId === params[1]);
          if (name === "wireline_call_logs")
            rows = rows.filter(
              (row) => row.vapiCallId === params[1] || String(row.id) === params[2],
            );
          if (name === "wireline_calendar_events")
            rows = rows.filter((row) => !["cancelled", "canceled"].includes(row.status));
          if (selection)
            return rows.map((row) =>
              Object.fromEntries(
                Object.entries(selection).map(([key, column]) => {
                  const source = Object.entries(table).find(([, value]) => value === column)?.[0];
                  return [key, source ? clone(row[source]) : undefined];
                }),
              ),
            );
          return clone(rows);
        };
        const chain = {
          from(value: any) {
            table = value;
            return chain;
          },
          where(value: any) {
            condition = value;
            return chain;
          },
          limit(value: number) {
            return Promise.resolve(run().slice(0, value));
          },
          then(resolve: any, reject: any) {
            return Promise.resolve().then(run).then(resolve, reject);
          },
        };
        return chain;
      },
      insert(table: any) {
        return {
          values(value: any) {
            let result: any;
            const run = () => {
              if (result) return result;
              const name = getTableName(table);
              if (name === "wireline_audit_log" && h.failAudit)
                throw new Error("audit unavailable");
              const row = {
                id: `00000000-0000-4000-8000-${String(h.nextId++).padStart(12, "0")}`,
                createdAt: new Date(),
                demo: false,
                ...clone(value),
              };
              const rows = h.rows.get(name) ?? [];
              rows.push(row);
              h.rows.set(name, rows);
              undo.push(() => {
                const index = rows.indexOf(row);
                if (index >= 0) rows.splice(index, 1);
              });
              result = [clone(row)];
              return result;
            };
            return {
              returning: () => Promise.resolve().then(run),
              then: (resolve: any, reject: any) =>
                Promise.resolve().then(run).then(resolve, reject),
            };
          },
        };
      },
      update(table: any) {
        return {
          set(value: any) {
            return {
              where(condition: any) {
                return {
                  returning: async () => {
                    const { params } = dialect.sqlToQuery(condition);
                    const name = getTableName(table);
                    const rows = h.rows.get(name) ?? [];
                    const row = rows.find(
                      (entry) =>
                        entry.userId === params[0] &&
                        (name === "wireline_settings" || entry.id === params[1]),
                    );
                    if (!row) return [];
                    const prior = clone(row);
                    undo.push(() => Object.assign(row, prior));
                    Object.assign(row, clone(value));
                    return [clone(row)];
                  },
                };
              },
            };
          },
        };
      },
    };
    return {
      db,
      finish(error = false) {
        if (error) undo.reverse().forEach((work) => work());
        release?.();
      },
    };
  }
  const drizzle = {
    transaction: async (work: any) => {
      const tx = database();
      try {
        const result = await work(tx.db);
        tx.finish();
        return result;
      } catch (error) {
        tx.finish(true);
        throw error;
      }
    },
    select: (...args: any[]) => database().db.select(...args),
  };
  // Keep table imports evaluated before the service; this mock still uses real
  // Drizzle SQL predicates and requires its production advisory lock to serialize.
  expect(schema.appointments).toBeTruthy();
  return { drizzle, tenantStore: { run: (_userId: string, work: () => unknown) => work() } };
});

import {
  bookNativeAppointment,
  cancelCalendarAppointment,
  getNativeCalendarAvailability,
  saveNativeCalendarSettings,
  updateCalendarAppointment,
} from "../src/lib/native-calendar";
import { DEFAULT_NATIVE_CALENDAR } from "../src/lib/native-calendar-policy";

const user = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const config = () => ({
  ...DEFAULT_NATIVE_CALENDAR,
  enabled: true,
  time_zone: "America/Chicago",
  minimum_notice_minutes: 0,
});
const input = (requestKey: string, time = "10:00") => ({
  date: "2026-09-28",
  time,
  customerName: "Pilot",
  requestKey,
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  h.rows.clear();
  h.locks.clear();
  h.nextId = 1;
  h.unguardedReads = 0;
  h.failAudit = false;
  h.rows.set("wireline_settings", [
    { id: "settings-1", userId: user, nativeCalendar: config() },
    { id: "settings-2", userId: other, nativeCalendar: config() },
  ]);
});
afterEach(() => vi.useRealTimers());

describe("native calendar transactional booking", () => {
  it("serializes competing requests so exactly one gets the same slot", async () => {
    const result = await Promise.allSettled([
      bookNativeAppointment(user, input("one")),
      bookNativeAppointment(user, input("two")),
    ]);
    expect(result.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(result.find((entry) => entry.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(h.rows.get("wireline_appointments")).toHaveLength(1);
    expect(h.unguardedReads).toBe(0);
  });

  it("isolates tenant calendars while allowing the same time and request key", async () => {
    const [first, second] = await Promise.all([
      bookNativeAppointment(user, input("same")),
      bookNativeAppointment(other, input("same")),
    ]);
    expect(first.userId).toBe(user);
    expect(second.userId).toBe(other);
    await expect(
      updateCalendarAppointment(other, first.id, { status: "Cancelled" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("replays a stable booking key, rejects changed input and retains cancelled receipts", async () => {
    const first = await bookNativeAppointment(user, input("one"));
    expect(first.created).toBe(true);
    expect(await bookNativeAppointment(user, input("one"))).toMatchObject({
      id: first.id,
      created: false,
    });
    await expect(bookNativeAppointment(user, input("one", "11:00"))).rejects.toMatchObject({
      status: 409,
    });
    await cancelCalendarAppointment(user, first.id);
    expect((await bookNativeAppointment(user, input("one"))).status).toBe("Cancelled");
    expect((await bookNativeAppointment(user, input("two"))).status).toBe("Scheduled");
  });

  it("holds Requested slots, then confirms once without creating another appointment", async () => {
    h.rows.get("wireline_settings")![0].nativeCalendar.booking_mode = "approval";
    const row = await bookNativeAppointment(user, input("approval"));
    expect(row.status).toBe("Requested");
    await expect(bookNativeAppointment(user, input("another"))).rejects.toMatchObject({
      status: 409,
    });
    expect((await updateCalendarAppointment(user, row.id, { status: "Confirmed" })).status).toBe(
      "Confirmed",
    );
    expect(h.rows.get("wireline_appointments")).toHaveLength(1);
  });

  it.each(["Confirmed", "Scheduled", "Rescheduled"])(
    "rechecks imported busy time before approving as %s and rescheduling",
    async (status) => {
      h.rows.get("wireline_settings")![0].nativeCalendar.booking_mode = "approval";
      const row = await bookNativeAppointment(user, input("approval"));
      h.rows.set("wireline_calendar_events", [
        { userId: user, startTime: row.startAt, endTime: row.endAt, status: "confirmed" },
      ]);
      await expect(updateCalendarAppointment(user, row.id, { status })).rejects.toMatchObject({
        status: 409,
      });
      expect(h.rows.get("wireline_appointments")![0].status).toBe("Requested");
      const moved = await updateCalendarAppointment(user, row.id, { time: "11:00" });
      expect(moved.startAt!.toISOString()).toBe("2026-09-28T16:00:00.000Z");
    },
  );

  it("rejects foreign Bot/call provenance and performs no appointment writes", async () => {
    h.rows.set("wireline_agents", [{ id: "foreign", userId: other }]);
    h.rows.set("wireline_call_logs", [{ id: 1, vapiCallId: "foreign-call", userId: other }]);
    await expect(
      bookNativeAppointment(user, { ...input("one"), agentId: "foreign" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      bookNativeAppointment(user, { ...input("two"), callId: "foreign-call" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(h.rows.get("wireline_appointments")).toBeUndefined();
  });

  it("accepts tenant-owned Bot/call provenance and rejects oversized request identities before DB work", async () => {
    h.rows.set("wireline_agents", [{ id: "owned", userId: user }]);
    h.rows.set("wireline_call_logs", [
      { id: 1, vapiCallId: "openai:rtc_pilot", openaiSipPhase: "running", userId: user },
    ]);
    const row = await bookNativeAppointment(user, {
      ...input("one"),
      agentId: "owned",
      callId: "openai:rtc_pilot",
    });
    expect(row.agentId).toBe("owned");
    expect(row.callId).toBe("openai:rtc_pilot");
    await expect(
      bookNativeAppointment(user, input("x".repeat(201), "11:00")),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.rows.get("wireline_appointments")).toHaveLength(1);
  });

  it("rolls back booking if its durable audit fails", async () => {
    h.failAudit = true;
    await expect(bookNativeAppointment(user, input("one"))).rejects.toThrow("audit unavailable");
    expect(h.rows.get("wireline_appointments")).toHaveLength(0);
    h.failAudit = false;
    expect((await bookNativeAppointment(user, input("one"))).status).toBe("Scheduled");
  });

  it("does not let old Scheduled history exhaust the current-day availability bound", async () => {
    h.rows.set(
      "wireline_appointments",
      Array.from({ length: 5001 }, (_, i) => ({
        id: `old-${i}`,
        userId: user,
        status: "Scheduled",
        demo: false,
        date: "2020-01-01",
        time: "10:00",
        notes: null,
      })),
    );
    const availability = await getNativeCalendarAvailability(user, { date: "2026-09-28" });
    expect(availability.slots.some((slot) => slot.time === "10:00")).toBe(true);
    expect((await bookNativeAppointment(user, input("current"))).status).toBe("Scheduled");
  });

  it("starts available slots at the owner's chosen opening minute", async () => {
    await saveNativeCalendarSettings(user, {
      ...config(),
      weekly_hours: [{ day: 1, start: "09:10", end: "10:10" }],
    });
    const availability = await getNativeCalendarAvailability(user, { date: "2026-09-28" });
    expect(availability.slots.map((slot) => slot.time)).toEqual(["09:10", "09:25", "09:40"]);
  });

  it("pauses new bookings without erasing existing appointments", async () => {
    const row = await bookNativeAppointment(user, input("one"));
    await saveNativeCalendarSettings(user, { ...config(), enabled: false });
    await expect(bookNativeAppointment(user, input("two", "11:00"))).rejects.toMatchObject({
      status: 409,
    });
    expect((await updateCalendarAppointment(user, row.id, { status: "Cancelled" })).status).toBe(
      "Cancelled",
    );
  });

  it("does not silently move a cancelled appointment when calendar timezone or duration changes", async () => {
    const row = await bookNativeAppointment(user, input("one"));
    await cancelCalendarAppointment(user, row.id);
    await saveNativeCalendarSettings(user, {
      ...config(),
      time_zone: "America/New_York",
      duration_minutes: 45,
    });
    await expect(
      updateCalendarAppointment(user, row.id, { status: "Confirmed" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.rows.get("wireline_appointments")![0]).toMatchObject({
      status: "Cancelled",
      startAt: row.startAt,
      endAt: row.endAt,
      timeZone: "America/Chicago",
    });
    const explicitlyMoved = await updateCalendarAppointment(user, row.id, {
      status: "Confirmed",
      date: "2026-09-29",
      time: "11:00",
    });
    expect(explicitlyMoved.startAt!.toISOString()).toBe("2026-09-29T15:00:00.000Z");
  });
});
