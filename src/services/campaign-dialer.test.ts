import { describe, expect, it } from "vitest";
import { isWithinCallWindow } from "./campaign-dialer";

describe("isWithinCallWindow", () => {
  describe("same-day window (09:00–17:00)", () => {
    it("includes the start and end boundaries", () => {
      expect(isWithinCallWindow("09:00", "17:00", "09:00")).toBe(true);
      expect(isWithinCallWindow("09:00", "17:00", "17:00")).toBe(true);
    });

    it("includes times inside the window", () => {
      expect(isWithinCallWindow("09:00", "17:00", "12:30")).toBe(true);
    });

    it("excludes times before and after the window", () => {
      expect(isWithinCallWindow("09:00", "17:00", "08:59")).toBe(false);
      expect(isWithinCallWindow("09:00", "17:00", "17:01")).toBe(false);
      expect(isWithinCallWindow("09:00", "17:00", "23:00")).toBe(false);
    });
  });

  describe("overnight window (20:00–06:00)", () => {
    it("includes times on either side of midnight", () => {
      expect(isWithinCallWindow("20:00", "06:00", "22:00")).toBe(true);
      expect(isWithinCallWindow("20:00", "06:00", "03:00")).toBe(true);
      expect(isWithinCallWindow("20:00", "06:00", "20:00")).toBe(true);
      expect(isWithinCallWindow("20:00", "06:00", "06:00")).toBe(true);
    });

    it("excludes the daytime gap between end and start", () => {
      expect(isWithinCallWindow("20:00", "06:00", "06:01")).toBe(false);
      expect(isWithinCallWindow("20:00", "06:00", "12:00")).toBe(false);
      expect(isWithinCallWindow("20:00", "06:00", "19:59")).toBe(false);
    });
  });
});
