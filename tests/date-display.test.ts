import { describe, expect, it } from "vitest";

import { isoToLocalDateKey, localDateKey } from "../src/lib/date-display";

describe("date-display", () => {
  it("uses local calendar date, not UTC, for today filters", () => {
    const eveningLocal = new Date(2026, 6, 7, 20, 30, 0);
    expect(localDateKey(eveningLocal)).toBe("2026-07-07");
    expect(isoToLocalDateKey(eveningLocal.toISOString())).toBe("2026-07-07");
    expect(eveningLocal.toISOString().slice(0, 10)).not.toBe("2026-07-07");
  });
});
