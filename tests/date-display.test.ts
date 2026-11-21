import { describe, expect, it } from "vitest";

import { isoToLocalDateKey, localDateKey } from "../src/lib/date-display";

describe("date-display", () => {
  it("formats dates with the runtime local calendar date for today filters", () => {
    const localDate = new Date(2026, 6, 7, 20, 30, 0);

    expect(localDateKey(localDate)).toBe("2026-07-07");
    expect(isoToLocalDateKey(localDate.toISOString())).toBe("2026-07-07");
  });

  it("uses the appointment's timezone for a date that crosses UTC midnight", () => {
    const instant = "2026-11-22T01:30:00Z";
    expect(isoToLocalDateKey(instant, "UTC")).toBe("2026-11-22");
    expect(isoToLocalDateKey(instant, "America/Chicago")).toBe("2026-11-21");
    expect(isoToLocalDateKey(instant, "Unknown/City")).toBe("");
  });
});
