/**
 * safe-date.test.ts
 * ----------------------------------------------------------------------
 * The docstring on safe-date.ts promises this peer file ("Tested in
 * src/lib/safe-date.test.ts"). These helpers exist because Safari/iOS
 * WebKit *throws* on `new Date(invalid).toLocale*()` while Chrome/Firefox
 * return "Invalid Date" — an unguarded call blows up the whole render on
 * iPhone. We assert the never-throw contract + the stable-fallback shape.
 *
 * Locale/timezone-sensitive exact strings are deliberately avoided; we
 * assert structure (fallback vs. non-fallback, relative buckets) so the
 * suite is deterministic across CI runners.
 */
import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  safeDate,
  msSinceNow,
  formatRelative,
} from "./safe-date";

const FALLBACK = "—";
const VALID_ISO = "2026-01-15T10:30:00.000Z";

describe("safeDate", () => {
  it("returns a Date for valid ISO strings", () => {
    const d = safeDate(VALID_ISO);
    expect(d).toBeInstanceOf(Date);
    expect(d?.getTime()).toBe(Date.parse(VALID_ISO));
  });

  it("accepts Date objects and numeric epoch ms", () => {
    const now = new Date();
    expect(safeDate(now)?.getTime()).toBe(now.getTime());
    expect(safeDate(0)?.getTime()).toBe(0);
  });

  it("recovers Postgres 'YYYY-MM-DD HH:MM:SS+00' space-variant timestamps", () => {
    const d = safeDate("2026-01-15 10:30:00+00");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d?.getTime())).toBe(true);
  });

  it("returns null for null / undefined / empty / unparsable input", () => {
    expect(safeDate(null)).toBeNull();
    expect(safeDate(undefined)).toBeNull();
    expect(safeDate("")).toBeNull();
    expect(safeDate("   ")).toBeNull();
    expect(safeDate("not a date")).toBeNull();
    expect(safeDate(new Date("nonsense"))).toBeNull();
  });
});

describe("format* helpers never throw and fall back cleanly", () => {
  it("returns the fallback for invalid input", () => {
    expect(formatDate("nope")).toBe(FALLBACK);
    expect(formatDateTime(null)).toBe(FALLBACK);
    expect(formatTime(undefined)).toBe(FALLBACK);
  });

  it("honors a custom fallback", () => {
    expect(formatDate("nope", undefined, "n/a")).toBe("n/a");
  });

  it("returns a non-fallback string for valid dates", () => {
    expect(formatDate(VALID_ISO)).not.toBe(FALLBACK);
    expect(formatDateTime(VALID_ISO)).not.toBe(FALLBACK);
    expect(formatTime(VALID_ISO)).not.toBe(FALLBACK);
  });

  it("does not throw on any input type", () => {
    for (const v of [null, undefined, "", "x", {}, [], NaN, Infinity, 0, VALID_ISO]) {
      expect(() => formatDate(v)).not.toThrow();
      expect(() => formatDateTime(v)).not.toThrow();
      expect(() => formatTime(v)).not.toThrow();
    }
  });
});

describe("msSinceNow", () => {
  it("returns a positive elapsed value for a past date", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const ms = msSinceNow(tenMinAgo);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
  });

  it("returns null for unparsable input", () => {
    expect(msSinceNow("nope")).toBeNull();
    expect(msSinceNow(null)).toBeNull();
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for sub-minute deltas", () => {
    expect(formatRelative(new Date(Date.now() - 5_000).toISOString())).toBe("just now");
  });

  it("returns minute / hour / day buckets", () => {
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatRelative(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe("2h ago");
    expect(formatRelative(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe("3d ago");
  });

  it("falls back to an absolute date for deltas beyond a week", () => {
    const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const out = formatRelative(longAgo);
    expect(out).not.toBe(FALLBACK);
    expect(out).not.toMatch(/ago$/);
  });

  it("returns the fallback for unparsable input", () => {
    expect(formatRelative("nope")).toBe(FALLBACK);
  });
});
