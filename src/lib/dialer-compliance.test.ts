import { describe, it, expect } from "vitest";
import { isNumberOnDncList, normalizeOutboundNumber, type DncEntry } from "./dialer-compliance";

describe("Dialer Compliance Helpers", () => {
  const mockDncEntries: DncEntry[] = [
    { phone: "5551234567", phone_raw: "(555) 123-4567" },
    { phone: "18005550199", phone_raw: "+1 (800) 555-0199" },
    { phone: "442079460958", phone_raw: "+44 20 7946 0958" },
  ];

  describe("isNumberOnDncList", () => {
    it("returns false for empty input or empty DNC list", () => {
      expect(isNumberOnDncList("", mockDncEntries)).toBe(false);
      expect(isNumberOnDncList("5551234567", [])).toBe(false);
    });

    it("matches exact digits", () => {
      expect(isNumberOnDncList("5551234567", mockDncEntries)).toBe(true);
      expect(isNumberOnDncList("442079460958", mockDncEntries)).toBe(true);
    });

    it("ignores formatting, spaces, and punctuation in search and entry", () => {
      expect(isNumberOnDncList(" (555) 123-4567 ", mockDncEntries)).toBe(true);
      expect(isNumberOnDncList("44-20-7946-0958", mockDncEntries)).toBe(true);
    });

    it("handles 10 vs 11 digit North American fallback (adding/removing 1)", () => {
      // Search is 10-digit, entry is 11-digit (with 1)
      expect(isNumberOnDncList("8005550199", mockDncEntries)).toBe(true);
      // Search is 11-digit (with 1), entry is 10-digit
      expect(isNumberOnDncList("15551234567", mockDncEntries)).toBe(true);
      expect(isNumberOnDncList("+1-555-123-4567", mockDncEntries)).toBe(true);
    });

    it("returns false for unmatched numbers", () => {
      expect(isNumberOnDncList("5550009999", mockDncEntries)).toBe(false);
      expect(isNumberOnDncList("1234567", mockDncEntries)).toBe(false);
    });
  });

  describe("normalizeOutboundNumber", () => {
    it("returns trimmed raw string if invalid or too short", () => {
      expect(normalizeOutboundNumber("")).toBe("");
      expect(normalizeOutboundNumber("123")).toBe("123");
    });

    it("prepends +1 for 10-digit North American numbers", () => {
      expect(normalizeOutboundNumber("5551234567")).toBe("+15551234567");
      expect(normalizeOutboundNumber("(555) 123-4567")).toBe("+15551234567");
    });

    it("prepends + for 11-digit numbers starting with 1", () => {
      expect(normalizeOutboundNumber("18005550199")).toBe("+18005550199");
      expect(normalizeOutboundNumber("1-800-555-0199")).toBe("+18005550199");
    });

    it("keeps leading + for already formatted numbers", () => {
      expect(normalizeOutboundNumber("+442079460958")).toBe("+442079460958");
      expect(normalizeOutboundNumber("+1 (555) 123-4567")).toBe("+15551234567");
    });
  });
});
