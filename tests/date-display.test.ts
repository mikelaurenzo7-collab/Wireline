import { describe, expect, it } from "vitest";

import { isoToLocalDateKey, localDateKey } from "../src/lib/date-display";

describe("date-display", () => {
  it("formats dates with the runtime local calendar date for today filters", () => {
    const localDate = new Date(2026, 6, 7, 20, 30, 0);

    expect(localDateKey(localDate)).toBe("2026-07-07");
    expect(isoToLocalDateKey(localDate.toISOString())).toBe("2026-07-07");
  });
});
