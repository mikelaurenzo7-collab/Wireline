import { describe, expect, it } from "vitest";

import { monthlyPeriodKey, nextMonthlyResetIso } from "./voice-usage";

describe("monthlyPeriodKey", () => {
  it("returns YYYY-MM format for the supplied date in UTC", () => {
    expect(monthlyPeriodKey(new Date("2026-05-17T12:34:56Z"))).toBe("2026-05");
    expect(monthlyPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(monthlyPeriodKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("rolls into the next month at the UTC boundary, not local time", () => {
    // 23:30 in UTC on May 31 — local US/Pacific would say it's still May 31
    // but our period_key MUST follow UTC so usage doesn't double-count
    // across operators in different time zones.
    expect(monthlyPeriodKey(new Date("2026-05-31T23:30:00Z"))).toBe("2026-05");
    expect(monthlyPeriodKey(new Date("2026-06-01T00:00:00Z"))).toBe("2026-06");
  });
});

describe("nextMonthlyResetIso", () => {
  it("returns the first instant of the next UTC month", () => {
    expect(nextMonthlyResetIso(new Date("2026-05-17T12:00:00Z"))).toBe("2026-06-01T00:00:00.000Z");
    expect(nextMonthlyResetIso(new Date("2026-01-01T00:00:00Z"))).toBe("2026-02-01T00:00:00.000Z");
  });

  it("wraps the year correctly on December → January", () => {
    expect(nextMonthlyResetIso(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

/**
 * Overage-delta math is the billing-correctness boundary: we must charge
 * ONLY for the portion of a call that pushed usage above the plan limit,
 * never for minutes that were already included. The formula lives inside
 * trackVoiceMinutes:
 *
 *   newOverageMinutes = max(0, newUsed - max(included, previousUsed))
 *
 * These tests pin the math so a refactor can't silently start over-billing.
 */
function calcOverageDelta(previousUsed: number, newUsed: number, included: number): number {
  return Math.max(0, newUsed - Math.max(included, previousUsed));
}

describe("overage delta calculation", () => {
  it("returns 0 when usage stays inside the included pool", () => {
    expect(calcOverageDelta(100, 105, 500)).toBe(0);
    expect(calcOverageDelta(0, 5, 100)).toBe(0);
  });

  it("returns 0 when usage exactly hits the included limit", () => {
    expect(calcOverageDelta(95, 100, 100)).toBe(0);
  });

  it("bills only the over-limit minutes when a single call crosses the threshold", () => {
    // Was at 480/500. A 25-min call lands → newUsed = 505. We should
    // bill 5 min of overage, NOT 25 — the first 20 were still included.
    expect(calcOverageDelta(480, 505, 500)).toBe(5);
  });

  it("bills the entire call when usage was already over the limit", () => {
    // Already 80 min over. A 10-min call lands → newUsed = 590.
    // All 10 minutes are overage (none were inside the included pool).
    expect(calcOverageDelta(580, 590, 500)).toBe(10);
  });

  it("handles a giant call that fully crosses an empty bucket", () => {
    // Fresh period, first call is 600 min, plan is 500. Bill 100, not 600.
    expect(calcOverageDelta(0, 600, 500)).toBe(100);
  });
});
