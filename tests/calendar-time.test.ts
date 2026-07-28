import { describe, expect, it } from "vitest";

import {
  addMinutesToIso,
  CalendarTimeError,
  formatIsoInTimeZone,
  localDateTimeToUtcIso,
  localDateWindowToUtc,
  normalizeIanaTimeZone,
} from "../src/lib/calendar-time";

describe("calendar time conversion", () => {
  it("converts local appointment time to the correct UTC instant", () => {
    expect(
      localDateTimeToUtcIso({
        date: "2026-07-28",
        time: "14:00",
        timeZone: "America/Chicago",
      }),
    ).toBe("2026-07-28T19:00:00.000Z");
    expect(
      localDateTimeToUtcIso({
        date: "2026-01-15",
        time: "09:00",
        timeZone: "America/Chicago",
      }),
    ).toBe("2026-01-15T15:00:00.000Z");
  });

  it("builds 23-hour and 25-hour local-day windows across DST", () => {
    const spring = localDateWindowToUtc({
      date: "2026-03-08",
      timeZone: "America/New_York",
    });
    expect(Date.parse(spring.endTime) - Date.parse(spring.startTime)).toBe(23 * 60 * 60 * 1000);

    const fall = localDateWindowToUtc({
      date: "2026-11-01",
      timeZone: "America/New_York",
    });
    expect(Date.parse(fall.endTime) - Date.parse(fall.startTime)).toBe(25 * 60 * 60 * 1000);
  });

  it("starts a calendar day at the first real instant when midnight is skipped", () => {
    const havana = localDateWindowToUtc({
      date: "2026-03-08",
      timeZone: "America/Havana",
    });
    expect(havana.startTime).toBe("2026-03-08T05:00:00.000Z");
    expect(formatIsoInTimeZone(havana.startTime, "America/Havana")).toContain("1:00 AM");
    expect(Date.parse(havana.endTime) - Date.parse(havana.startTime)).toBe(
      23 * 60 * 60 * 1000,
    );
  });

  it("rejects nonexistent and ambiguous DST wall-clock times", () => {
    expect(() =>
      localDateTimeToUtcIso({
        date: "2026-03-08",
        time: "02:30",
        timeZone: "America/New_York",
      }),
    ).toThrowError(expect.objectContaining({ code: "NONEXISTENT_LOCAL_TIME" }));

    expect(() =>
      localDateTimeToUtcIso({
        date: "2026-11-01",
        time: "01:30",
        timeZone: "America/New_York",
      }),
    ).toThrowError(expect.objectContaining({ code: "AMBIGUOUS_LOCAL_TIME" }));
  });

  it("rejects malformed dates, times, and timezone abbreviations", () => {
    const cases = [
      () => localDateTimeToUtcIso({ date: "July 28", time: "2 PM", timeZone: "CST" }),
      () => localDateTimeToUtcIso({ date: "2026-02-30", time: "14:00", timeZone: "UTC" }),
      () => normalizeIanaTimeZone("Not/AZone"),
    ];
    for (const run of cases) {
      expect(run).toThrow(CalendarTimeError);
    }
  });

  it("formats confirmed instants in the requested zone and adds duration in UTC", () => {
    const start = "2026-07-28T19:00:00.000Z";
    expect(addMinutesToIso(start, 60)).toBe("2026-07-28T20:00:00.000Z");
    expect(formatIsoInTimeZone(start, "America/Chicago")).toContain("2:00 PM");
    expect(formatIsoInTimeZone(start, "America/Chicago")).toMatch(/CDT/);
  });
});
