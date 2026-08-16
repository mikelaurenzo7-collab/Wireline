import { describe, expect, it } from "vitest";
import { formatDate, formatRelative, msSinceNow, safeDate } from "../src/lib/safe-date";

describe("safeDate / formatDate", () => {
  it("returns the fallback for null / empty / unparsable input (never throws)", () => {
    expect(formatDate(null)).toBe("N/A");
    expect(formatDate("")).toBe("N/A");
    expect(formatDate("   ")).toBe("N/A");
    expect(formatDate("not a date")).toBe("N/A");
  });
  it("formats a valid ISO string to a non-fallback string", () => {
    const out = formatDate("2026-01-15T10:30:00Z");
    expect(out).not.toBe("N/A");
    expect(out.length).toBeGreaterThan(0);
  });
  it("safeDate returns a Date for valid input and null for invalid", () => {
    expect(safeDate("2026-01-15T10:30:00Z")).toBeInstanceOf(Date);
    expect(safeDate("nonsense")).toBeNull();
    expect(safeDate(null)).toBeNull();
  });
});

describe("msSinceNow / formatRelative", () => {
  it("msSinceNow is null for unparsable input and positive for a past date", () => {
    expect(msSinceNow("bad")).toBeNull();
    const past = new Date(Date.now() - 5_000).toISOString();
    expect(msSinceNow(past)!).toBeGreaterThan(0);
  });
  it("formatRelative reads 'just now' for a very recent time and the fallback for bad input", () => {
    expect(formatRelative(new Date().toISOString())).toBe("just now");
    expect(formatRelative("bad")).toBe("N/A");
  });
});
