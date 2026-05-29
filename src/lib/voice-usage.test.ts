import { describe, expect, it } from "vitest";
import { monthlyPeriodKey, nextMonthlyResetIso } from "./voice-usage";

describe("voice-usage helpers", () => {
  describe("monthlyPeriodKey", () => {
    it("returns YYYY-MM format for a given date", () => {
      expect(monthlyPeriodKey(new Date("2026-05-15T10:00:00Z"))).toBe("2026-05");
      expect(monthlyPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
      expect(monthlyPeriodKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    });

    it("uses current date when no argument provided", () => {
      const result = monthlyPeriodKey();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("nextMonthlyResetIso", () => {
    it("returns first day of next month", () => {
      const result = nextMonthlyResetIso(new Date("2026-05-15T10:00:00Z"));
      expect(result).toBe("2026-06-01T00:00:00.000Z");
    });

    it("rolls over year boundary", () => {
      const result = nextMonthlyResetIso(new Date("2026-12-15T10:00:00Z"));
      expect(result).toBe("2027-01-01T00:00:00.000Z");
    });

    it("handles last day of month", () => {
      const result = nextMonthlyResetIso(new Date("2026-01-31T23:59:59Z"));
      expect(result).toBe("2026-02-01T00:00:00.000Z");
    });

    it("handles Feb → Mar", () => {
      const result = nextMonthlyResetIso(new Date("2026-02-28T12:00:00Z"));
      expect(result).toBe("2026-03-01T00:00:00.000Z");
    });
  });
});
