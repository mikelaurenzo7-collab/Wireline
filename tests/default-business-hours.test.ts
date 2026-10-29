import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_HOURS, isWithinBusinessHours } from "../src/lib/agent-runtime";

describe("new Bot business hours", () => {
  it("matches the calendar default of Monday to Friday, 9 to 5", () => {
    expect(DEFAULT_BUSINESS_HOURS.mon).toEqual({ open: "09:00", close: "17:00" });
    expect(DEFAULT_BUSINESS_HOURS.fri).toEqual({ open: "09:00", close: "17:00" });
    expect(DEFAULT_BUSINESS_HOURS.sat).toEqual({ closed: true });
    expect(DEFAULT_BUSINESS_HOURS.sun).toEqual({ closed: true });
  });

  it("keeps an unsaved schedule always open and closes a new Bot on Sunday", () => {
    const sunday = new Date("2026-10-25T18:00:00.000Z");
    expect(isWithinBusinessHours({ timezone: "America/Chicago" }, sunday)).toBe(true);
    expect(
      isWithinBusinessHours(
        { timezone: "America/Chicago", business_hours: DEFAULT_BUSINESS_HOURS },
        sunday,
      ),
    ).toBe(false);
  });
});
