import { describe, expect, it } from "vitest";
import {
  DEFAULT_NATIVE_CALENDAR,
  intervalsOverlap,
  legacyBusyInterval,
  nativeAppointmentInterval,
  validateNativeCalendarSettings,
} from "../src/lib/native-calendar-policy";

const settings = () =>
  validateNativeCalendarSettings({
    ...DEFAULT_NATIVE_CALENDAR,
    enabled: true,
    time_zone: "America/Chicago",
    duration_minutes: 45,
    buffer_minutes: 15,
    minimum_notice_minutes: 60,
  });
const now = new Date("2026-09-28T12:00:00Z");

describe("native calendar booking policy", () => {
  it("requires an explicit enable, known timezone and usable weekly hours", () => {
    expect(() =>
      nativeAppointmentInterval(
        DEFAULT_NATIVE_CALENDAR,
        { date: "2026-09-28", time: "10:00" },
        now,
      ),
    ).toThrow("paused");
    expect(() => validateNativeCalendarSettings({ ...settings(), time_zone: "CST" })).toThrow(
      "ambiguous",
    );
    expect(() => validateNativeCalendarSettings({ ...settings(), weekly_hours: [] })).toThrow(
      "Add availability",
    );
    expect(() =>
      validateNativeCalendarSettings({
        ...settings(),
        weekly_hours: [{ day: 1, start: "09:00", end: "09:30" }],
      }),
    ).toThrow("fit an appointment");
    expect(() =>
      validateNativeCalendarSettings({
        ...settings(),
        weekly_hours: [{ day: 1, start: "22:00", end: "03:00" }],
      }),
    ).toThrow("same day");
  });

  it("books the configured duration in canonical UTC and preserves the business clock", () => {
    const interval = nativeAppointmentInterval(
      settings(),
      { date: "2026-09-28", time: "10:00", timeZone: "America/Chicago" },
      now,
    );
    expect(interval.startAt.toISOString()).toBe("2026-09-28T15:00:00.000Z");
    expect(interval.endAt.toISOString()).toBe("2026-09-28T15:45:00.000Z");
    expect(interval.bufferMinutes).toBe(15);
    expect(interval.time).toBe("10:00");
  });

  it("rejects wrong zones, unavailable weekdays, too-short windows and insufficient notice", () => {
    expect(() =>
      nativeAppointmentInterval(
        settings(),
        { date: "2026-09-28", time: "10:00", timeZone: "America/New_York" },
        now,
      ),
    ).toThrow("America/Chicago");
    expect(() =>
      nativeAppointmentInterval(settings(), { date: "2026-10-04", time: "10:00" }, now),
    ).toThrow("outside booking hours");
    expect(() =>
      nativeAppointmentInterval(settings(), { date: "2026-09-28", time: "16:30" }, now),
    ).toThrow("outside booking hours");
    expect(() =>
      nativeAppointmentInterval(
        settings(),
        { date: "2026-09-28", time: "09:00" },
        new Date("2026-09-28T13:01:00Z"),
      ),
    ).toThrow("too soon");
  });

  it("rejects nonexistent, ambiguous and transition-spanning local appointments", () => {
    const sunday = {
      ...settings(),
      time_zone: "America/New_York",
      weekly_hours: [{ day: 0, start: "00:00", end: "06:00" }],
      minimum_notice_minutes: 0,
    };
    expect(() =>
      nativeAppointmentInterval(
        sunday,
        { date: "2026-03-08", time: "02:15" },
        new Date("2026-03-01T00:00Z"),
      ),
    ).toThrow("does not exist");
    expect(() =>
      nativeAppointmentInterval(sunday, { date: "2026-11-01", time: "01:15" }, now),
    ).toThrow("occurs twice");
    expect(() =>
      nativeAppointmentInterval(
        { ...sunday, duration_minutes: 180 },
        { date: "2026-03-08", time: "00:30" },
        new Date("2026-03-01T00:00Z"),
      ),
    ).toThrow("daylight-saving change");
  });

  it("keeps exactly one buffer between appointments and permits exact boundary adjacency", () => {
    const first = nativeAppointmentInterval(settings(), { date: "2026-09-28", time: "10:00" }, now);
    const overlapping = nativeAppointmentInterval(
      settings(),
      { date: "2026-09-28", time: "10:45" },
      now,
    );
    const next = nativeAppointmentInterval(settings(), { date: "2026-09-28", time: "11:00" }, now);
    expect(intervalsOverlap(first, overlapping)).toBe(true);
    expect(intervalsOverlap(overlapping, first)).toBe(true);
    expect(intervalsOverlap(first, next)).toBe(false);
  });

  it("retains unknown legacy timing as a day hold without inventing an instant", () => {
    const row = { date: "2026-09-28", time: "10 AM", notes: null };
    const busy = legacyBusyInterval(row, "2026-09-28", "America/Chicago")!;
    expect(busy.startAt.toISOString()).toBe("2026-09-28T05:00:00.000Z");
    expect(busy.endAt.toISOString()).toBe("2026-09-29T05:00:00.000Z");
    expect(row.time).toBe("10 AM");
    expect(legacyBusyInterval(row, "2026-09-29", "America/Chicago")).toBeNull();
    expect(() => legacyBusyInterval({ ...row, date: "2026-02-30" }, "2026-09-29", "UTC")).toThrow(
      "invalid date",
    );
  });

  it("bounds names, numerical settings and repeated days", () => {
    for (const [field, value] of [
      ["duration_minutes", 1],
      ["buffer_minutes", 121],
      ["minimum_notice_minutes", -1],
      ["appointment_name", "x".repeat(101)],
    ]) {
      expect(() => validateNativeCalendarSettings({ ...settings(), [field]: value })).toThrow();
    }
    expect(() =>
      validateNativeCalendarSettings({
        ...settings(),
        weekly_hours: [
          { day: 1, start: "09:00", end: "17:00" },
          { day: 1, start: "18:00", end: "20:00" },
        ],
      }),
    ).toThrow("one availability window");
  });
});
