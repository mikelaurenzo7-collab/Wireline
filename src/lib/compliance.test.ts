/**
 * compliance — `normalizeDncPhone` is the canonical phone-key used by
 * dncList lookups, the TCPA/compliance gate, and outbound dispatch.
 * Drift here silently bypasses DNC blocking. Only the pure normalizer
 * is exercised; the DB-backed `isDncBlocked` is covered by integration
 * tests that own a transactional fixture.
 */
import { describe, it, expect } from "vitest";
import { normalizeDncPhone } from "./compliance.js";

describe("normalizeDncPhone", () => {
  it("strips all non-digit characters", () => {
    expect(normalizeDncPhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizeDncPhone("+1.555.123.4567")).toBe("15551234567");
    expect(normalizeDncPhone(" 555 123 4567 ")).toBe("5551234567");
  });

  it("returns an empty string for non-numeric input", () => {
    expect(normalizeDncPhone("")).toBe("");
    expect(normalizeDncPhone("abc")).toBe("");
    expect(normalizeDncPhone("---")).toBe("");
  });

  it("preserves country code digits", () => {
    expect(normalizeDncPhone("+44 20 7946 0958")).toBe("442079460958");
  });

  it("is idempotent", () => {
    const once = normalizeDncPhone("(555) 123-4567");
    expect(normalizeDncPhone(once)).toBe(once);
  });
});
