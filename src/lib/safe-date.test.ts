// safe-date tests — every branch. The whole point of this module is to
// be the dam against the Safari "string did not match the expected
// pattern" RangeError that propagates up and blows up renders. Coverage
// must include null/undefined/empty/whitespace/unparsable strings.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatRelative,
  msSinceNow,
  safeDate,
} from "./safe-date";

const VALID_ISO = "2026-01-15T10:30:00.000Z";
const VALID_DATE = new Date(VALID_ISO);

afterEach(() => vi.useRealTimers());

describe("safeDate", () => {
  it("parses ISO 8601", () => {
    const d = safeDate(VALID_ISO);
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).toBe(VALID_DATE.getTime());
  });

  it("accepts a Date instance unchanged", () => {
    expect(safeDate(VALID_DATE)).toBe(VALID_DATE);
  });

  it("rejects an Invalid Date instance", () => {
    expect(safeDate(new Date("nonsense"))).toBe(null);
  });

  it("accepts a numeric Unix-ms input", () => {
    expect(safeDate(VALID_DATE.getTime())!.toISOString()).toBe(VALID_ISO);
  });

  it.each([null, undefined, "", "   ", "garbage", "2026-13-99"])(
    "returns null for falsy / unparsable input %s", (v) => {
      expect(safeDate(v as any)).toBe(null);
    });

  it("recovers from Postgres 'YYYY-MM-DD HH:MM:SS+00' (space instead of T)", () => {
    const pg = "2026-01-15 10:30:00+00";
    const d = safeDate(pg);
    expect(d).not.toBe(null);
    expect(d!.toISOString().startsWith("2026-01-15T10:30:00")).toBe(true);
  });

  it("returns null for non-string non-Date non-number values", () => {
    expect(safeDate({} as any)).toBe(null);
    expect(safeDate([] as any)).toBe(null);
    expect(safeDate(true as any)).toBe(null);
  });
});

describe("formatDate", () => {
  it("formats a valid ISO string", () => {
    const out = formatDate(VALID_ISO, { year: "numeric", month: "short", day: "numeric" }, "—", "en-US");
    expect(out).toMatch(/Jan/);
    expect(out).toMatch(/2026/);
  });

  it("returns the fallback for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns the custom fallback for invalid input", () => {
    expect(formatDate("garbage", undefined, "n/a")).toBe("n/a");
  });

  it("does not throw when toLocaleDateString rejects (simulated)", () => {
    // Stub toLocaleDateString to throw — guarantees the safeFormat
    // try/catch is exercised, regardless of engine.
    const proto = Date.prototype as any;
    const orig = proto.toLocaleDateString;
    proto.toLocaleDateString = function () { throw new RangeError("The string did not match the expected pattern."); };
    try {
      expect(formatDate(VALID_ISO, undefined, "ok")).toBe("ok");
    } finally {
      proto.toLocaleDateString = orig;
    }
  });
});

describe("formatDateTime", () => {
  it("formats a valid ISO string", () => {
    const out = formatDateTime(VALID_ISO, undefined, "—", "en-US");
    expect(out).toMatch(/2026/);
  });

  it("falls back on null", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("never throws even when the engine throws on Invalid Date", () => {
    const proto = Date.prototype as any;
    const orig = proto.toLocaleString;
    proto.toLocaleString = function () { throw new RangeError("The string did not match the expected pattern."); };
    try {
      expect(formatDateTime(VALID_ISO, undefined, "fb")).toBe("fb");
    } finally {
      proto.toLocaleString = orig;
    }
  });
});

describe("formatTime", () => {
  it("formats a valid ISO string", () => {
    const out = formatTime(VALID_ISO, { hour: "2-digit", minute: "2-digit" }, "—", "en-US");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns fallback for invalid input", () => {
    expect(formatTime("not a date")).toBe("—");
  });
});

describe("msSinceNow", () => {
  it("returns null for unparsable input", () => {
    expect(msSinceNow("garbage")).toBe(null);
    expect(msSinceNow(null)).toBe(null);
  });

  it("returns positive ms for a past date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-16T00:00:00Z"));
    const r = msSinceNow("2026-01-15T00:00:00Z");
    expect(r).toBe(86_400_000);
  });
});

describe("formatRelative", () => {
  it("returns 'just now' for a very recent date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:30Z"));
    expect(formatRelative("2026-01-15T10:30:00Z")).toBe("just now");
  });

  it("uses minutes for sub-hour deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    expect(formatRelative("2026-01-15T10:25:00Z")).toBe("5m ago");
  });

  it("uses hours for sub-day deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    expect(formatRelative("2026-01-15T08:30:00Z")).toBe("2h ago");
  });

  it("uses days for sub-week deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    expect(formatRelative("2026-01-12T10:30:00Z")).toBe("3d ago");
  });

  it("falls back to a date for week+ deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T10:30:00Z"));
    const r = formatRelative("2026-01-01T10:30:00Z");
    // Whatever the locale, it should not look like "Xd ago"
    expect(r).not.toMatch(/^\d+d ago$/);
    expect(r).not.toMatch(/^\d+h ago$/);
  });

  it("returns the fallback for unparsable input", () => {
    expect(formatRelative(undefined, "?")).toBe("?");
  });

  it("falls back to a date for future timestamps (negative delta)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:30:00Z"));
    const r = formatRelative("2030-01-15T10:30:00Z");
    expect(r).not.toBe("just now");
  });
});
