import { describe, expect, it } from "vitest";

import {
  businessHoursContext,
  businessHoursInWords,
  isWithinBusinessHours,
} from "../src/lib/agent-runtime";

const weekday = { open: "08:00", close: "17:00" };

describe("the saved weekly hours in plain words", () => {
  it("groups days that keep the same hours and names a closed day", () => {
    expect(
      businessHoursInWords({
        mon: weekday,
        tue: weekday,
        wed: weekday,
        thu: weekday,
        fri: weekday,
        sat: { open: "09:00", close: "13:30" },
        sun: { closed: true },
      }),
    ).toBe("Monday to Friday 8 AM to 5 PM. Saturday 9 AM to 1:30 PM. Sunday closed.");
  });

  it("does not join days that are not next to each other", () => {
    expect(
      businessHoursInWords({ mon: weekday, wed: weekday, thu: weekday, sun: { closed: true } }),
    ).toBe(
      "Monday 8 AM to 5 PM. Tuesday open all day. Wednesday to Thursday 8 AM to 5 PM. Friday to Saturday open all day. Sunday closed.",
    );
  });

  it("says midnight and noon the way people do, and keeps an overnight window as saved", () => {
    expect(
      businessHoursInWords({
        fri: { open: "12:00", close: "00:00" },
        sat: { open: "22:00", close: "06:00" },
      }),
    ).toBe(
      "Monday to Thursday open all day. Friday 12 PM to 12 AM. Saturday 10 PM to 6 AM. Sunday open all day.",
    );
  });

  it("tells a Bot nothing when no hours are saved", () => {
    for (const none of [
      null,
      undefined,
      {},
      [],
      "9 to 5",
      7,
      { holiday: "closed" },
      { mon: null },
    ]) {
      expect(businessHoursInWords(none), JSON.stringify(none)).toBe("");
    }
  });

  // Set Up saves a day that is open all day as a day with no rule. Left out,
  // a business open all week but Friday read as "Friday 9 AM to 5 PM." alone.
  it("names every day once any is saved, the way open-or-closed is decided", () => {
    const hours = {
      fri: { open: "09:00", close: "17:00" },
      sat: { closed: true },
      sun: { closed: true },
    };
    expect(businessHoursInWords(hours)).toBe(
      "Monday to Thursday open all day. Friday 9 AM to 5 PM. Saturday to Sunday closed.",
    );
    // Each day is spoken as `isWithinBusinessHours` treats it.
    const tuesdayNoon = new Date("2026-11-24T18:00:00Z");
    const saturdayNoon = new Date("2026-11-28T18:00:00Z");
    const profile = { business_hours: hours as never, timezone: "America/Chicago" };
    expect(isWithinBusinessHours(profile, tuesdayNoon)).toBe(true);
    expect(isWithinBusinessHours(profile, saturdayNoon)).toBe(false);
    // A day whose times cannot be read does not gate, so it is open all day;
    // a zero-length window is closed.
    expect(
      businessHoursInWords({
        mon: { open: "8am", close: "5pm" },
        tue: weekday,
        wed: { open: "09:00", close: "09:00" },
        thu: null,
      }),
    ).toBe(
      "Monday open all day. Tuesday 8 AM to 5 PM. Wednesday closed. Thursday to Sunday open all day.",
    );
  });

  it("gives the day and time in the zone the hours are kept in", () => {
    const friday = new Date("2026-11-27T21:42:00Z");
    const hours = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday };
    expect(
      businessHoursContext({ businessHours: hours, timezone: "America/Chicago" }, friday),
    ).toBe(
      [
        "BUSINESS HOURS (America/Chicago): Monday to Friday 8 AM to 5 PM. Saturday to Sunday open all day.",
        "It is Friday 3:42 PM there, and the business is open right now. Say these hours when someone asks when the business is open. They are opening hours, not appointment availability.",
      ].join("\n"),
    );
    // A Bot with no zone of its own keeps hours in Eastern time, and is told
    // the time there, not in UTC.
    const noZone = businessHoursContext({ businessHours: hours, timezone: "" }, friday);
    expect(noZone).toContain("BUSINESS HOURS (America/New_York):");
    expect(noZone).toContain("It is Friday 4:42 PM there, and the business is open right now.");
    // After five there.
    expect(
      businessHoursContext(
        { businessHours: hours, timezone: null },
        new Date("2026-11-27T22:30:00Z"),
      ),
    ).toContain("It is Friday 5:30 PM there, and the business is closed right now.");
    // A zone that cannot be read leaves the clock out and keeps the hours.
    const badZone = businessHoursContext(
      { businessHours: hours, timezone: "Mars/Olympus" },
      friday,
    );
    expect(badZone).toContain("BUSINESS HOURS (Mars/Olympus): Monday to Friday 8 AM to 5 PM.");
    expect(badZone).toMatch(/\nThe business is (open|closed) right now\./);
    expect(businessHoursContext({ businessHours: null, timezone: "America/Chicago" })).toBe("");
  });
});
