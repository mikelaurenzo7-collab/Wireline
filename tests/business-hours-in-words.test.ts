import { describe, expect, it } from "vitest";

import { businessHoursInWords } from "../src/lib/agent-runtime";

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
    ).toBe("Monday 8 AM to 5 PM. Wednesday to Thursday 8 AM to 5 PM. Sunday closed.");
  });

  it("says midnight and noon the way people do, and keeps an overnight window as saved", () => {
    expect(
      businessHoursInWords({
        fri: { open: "12:00", close: "00:00" },
        sat: { open: "22:00", close: "06:00" },
      }),
    ).toBe("Friday 12 PM to 12 AM. Saturday 10 PM to 6 AM.");
  });

  it("tells a Bot nothing when no hours are saved, and skips what it cannot read", () => {
    for (const none of [null, undefined, {}, [], "9 to 5", 7]) {
      expect(businessHoursInWords(none), JSON.stringify(none)).toBe("");
    }
    // A malformed day is left out; a zero-length window is closed, as it is
    // when deciding whether the business is open.
    expect(
      businessHoursInWords({
        mon: { open: "8am", close: "5pm" },
        tue: weekday,
        wed: { open: "09:00", close: "09:00" },
        thu: null,
      }),
    ).toBe("Tuesday 8 AM to 5 PM. Wednesday closed.");
  });
});
