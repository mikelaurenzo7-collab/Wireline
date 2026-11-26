import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  saved: [] as unknown[],
  forgotten: 0,
}));

vi.mock("../src/lib/integrations", () => ({ IntegrationService: class {} }));
vi.mock("../src/lib/server-context", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  tenantStore: { run: (_userId: string, fn: () => unknown) => fn() },
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (h.row ? [h.row] : []) }) }),
    }),
    update: () => ({
      set: (values: { externalCalendar: unknown }) => ({
        where: async () => {
          h.saved.push(values.externalCalendar);
          if (h.row) h.row.externalCalendar = values.externalCalendar;
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        h.forgotten += 1;
      },
    }),
  },
}));

import {
  ownerCalendarEventFor,
  parseOwnerCalendarMirror,
  syncAppointmentToOwnerCalendar,
} from "../src/lib/owner-calendar-mirror";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const REF = { provider: "google" as const, accountId: "acct-1", eventId: "evt-1" };

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    userId: "user-1",
    status: "Scheduled",
    demo: false,
    bookingSource: "native",
    serviceType: "Estimate",
    customerName: "Maya Lin",
    phoneNumber: "+13125550148",
    notes: "Caller mentioned a private medical detail.",
    startAt: new Date("2026-12-03T16:30:00.000Z"),
    endAt: new Date("2026-12-03T17:00:00.000Z"),
    externalCalendar: null,
    ...overrides,
  };
}

function writer(overrides: Record<string, unknown> = {}) {
  return {
    createOwnerCalendarEvent: vi.fn(async () => REF),
    updateOwnerCalendarEvent: vi.fn(async () => "updated" as const),
    deleteOwnerCalendarEvent: vi.fn(async () => true),
    ...overrides,
  };
}

beforeEach(() => {
  h.row = null;
  h.saved = [];
  h.forgotten = 0;
});

describe("the owner's calendar copy of a Bot booking", () => {
  it("writes a confirmed booking once and remembers which event it is", async () => {
    h.row = appointment();
    const w = writer();
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("created");
    expect(w.createOwnerCalendarEvent).toHaveBeenCalledWith({
      title: "Estimate: Maya Lin",
      description: expect.stringContaining("Customer phone: +13125550148"),
      startTime: "2026-12-03T16:30:00.000Z",
      endTime: "2026-12-03T17:00:00.000Z",
    });
    expect(h.saved).toEqual([
      {
        ...REF,
        startAt: "2026-12-03T16:30:00.000Z",
        endAt: "2026-12-03T17:00:00.000Z",
        title: "Estimate: Maya Lin",
      },
    ]);
    // A second run with nothing changed touches nothing.
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("unchanged");
    expect(w.createOwnerCalendarEvent).toHaveBeenCalledTimes(1);
    expect(w.updateOwnerCalendarEvent).not.toHaveBeenCalled();
  });

  it("never copies the caller's notes onto the owner's calendar", () => {
    const event = ownerCalendarEventFor(appointment() as never);
    expect(JSON.stringify(event)).not.toContain("medical");
  });

  it("moves the same event on a reschedule instead of adding a second one", async () => {
    const first = {
      ...REF,
      startAt: "2026-12-03T16:30:00.000Z",
      endAt: "2026-12-03T17:00:00.000Z",
      title: "Estimate: Maya Lin",
    };
    h.row = appointment({
      status: "Rescheduled",
      startAt: new Date("2026-12-04T15:00:00.000Z"),
      endAt: new Date("2026-12-04T15:30:00.000Z"),
      externalCalendar: first,
    });
    const w = writer();
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("updated");
    expect(w.updateOwnerCalendarEvent).toHaveBeenCalledWith(
      first,
      expect.objectContaining({ startTime: "2026-12-04T15:00:00.000Z" }),
    );
    expect(w.createOwnerCalendarEvent).not.toHaveBeenCalled();
    expect(h.saved[0]).toMatchObject({ eventId: "evt-1", startAt: "2026-12-04T15:00:00.000Z" });
  });

  it("writes the event again when the owner deleted it themselves", async () => {
    h.row = appointment({
      startAt: new Date("2026-12-05T15:00:00.000Z"),
      endAt: new Date("2026-12-05T15:30:00.000Z"),
      externalCalendar: { ...REF, startAt: "x", endAt: "y", title: "z" },
    });
    const w = writer({
      updateOwnerCalendarEvent: vi.fn(async () => "missing" as const),
      createOwnerCalendarEvent: vi.fn(async () => ({ ...REF, eventId: "evt-2" })),
    });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("created");
    expect(h.saved[0]).toMatchObject({ eventId: "evt-2" });
  });

  it("removes the event on a cancellation and frees the imported busy time", async () => {
    h.row = appointment({
      status: "Cancelled",
      externalCalendar: { ...REF, startAt: "a", endAt: "b", title: "c" },
    });
    const w = writer();
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("deleted");
    expect(w.deleteOwnerCalendarEvent).toHaveBeenCalledWith(expect.objectContaining(REF));
    expect(h.saved).toEqual([null]);
    expect(h.forgotten).toBe(1);
  });

  it("keeps the record of the copy when the provider cannot delete it yet", async () => {
    h.row = appointment({
      status: "Cancelled",
      externalCalendar: { ...REF, startAt: "a", endAt: "b", title: "c" },
    });
    const w = writer({ deleteOwnerCalendarEvent: vi.fn(async () => false) });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("failed");
    expect(h.saved).toEqual([]);
  });

  it("leaves requests, demo rows and already-written connected bookings alone", async () => {
    const w = writer();
    h.row = appointment({ status: "Requested" });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("skipped");
    h.row = appointment({ demo: true });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("skipped");
    h.row = appointment({ bookingSource: "connected" });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("skipped");
    h.row = null;
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("skipped");
    expect(w.createOwnerCalendarEvent).not.toHaveBeenCalled();
  });

  it("is a no-op when no calendar is connected or the account cannot act live", async () => {
    h.row = appointment();
    const w = writer({ createOwnerCalendarEvent: vi.fn(async () => null) });
    expect(await syncAppointmentToOwnerCalendar("user-1", "appt-1", w)).toBe("skipped");
    expect(h.saved).toEqual([]);
  });

  it("rejects a malformed stored copy instead of acting on it", () => {
    expect(parseOwnerCalendarMirror(null)).toBeNull();
    expect(
      parseOwnerCalendarMirror({ provider: "yahoo", accountId: "a", eventId: "e" }),
    ).toBeNull();
    expect(parseOwnerCalendarMirror({ ...REF, startAt: "a", endAt: "b" })).toBeNull();
  });

  it("is wired into every booking change and out of the availability double count", () => {
    const native = read("src/lib/native-calendar.ts");
    expect(native).toContain("if (result.created) mirrorToOwnerCalendar(userId, result.id);");
    expect(native).toContain("mirrorToOwnerCalendar(userId, id);");
    expect(native).toContain("copied.external_calendar->>'eventId'");
    const integrations = read("src/lib/integrations.ts");
    // Owner-calendar writes respect the test and demo account fence.
    expect(integrations).toMatch(
      /private async ownerCalendarWork[\s\S]{0,900}liveExternalActionPolicyForUser\(this\.userId\)/,
    );
    expect(read("drizzle/migrations/0199_appointment_external_calendar.sql")).toContain(
      'ADD COLUMN IF NOT EXISTS "external_calendar" jsonb',
    );
  });
});
