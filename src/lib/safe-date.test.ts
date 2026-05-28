import { afterEach, describe, expect, it, vi } from "vitest";
import {
  safeDate,
  formatDate,
  formatDateTime,
  formatTime,
  msSinceNow,
  formatRelative,
} from "./safe-date";

describe("safeDate", () => {
  it("parses a valid ISO 8601 string", () => {
    const d = safeDate("2026-01-15T10:00:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("returns null for null", () => {
    expect(safeDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(safeDate(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(safeDate("")).toBeNull();
    expect(safeDate("   ")).toBeNull();
  });

  it("returns null for an unparsable string", () => {
    expect(safeDate("not-a-date")).toBeNull();
    expect(safeDate("hello world")).toBeNull();
  });

  it("handles the Postgres space-variant timestamp (YYYY-MM-DD HH:MM:SS+00)", () => {
    const d = safeDate("2026-01-15 10:30:00+00");
    expect(d).toBeInstanceOf(Date);
    expect(d).not.toBeNull();
  });

  it("returns null for an already-Invalid Date object", () => {
    expect(safeDate(new Date("invalid"))).toBeNull();
  });

  it("returns the same Date object when passed a valid Date", () => {
    const d = new Date("2026-01-15T10:00:00.000Z");
    expect(safeDate(d)).toBe(d);
  });

  it("parses a numeric Unix-ms timestamp", () => {
    const ts = Date.parse("2026-01-15T10:00:00.000Z");
    const d = safeDate(ts);
    expect(d?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });
});

describe("formatDate", () => {
  const ISO = "2026-01-15T10:00:00.000Z";

  it("returns a non-empty string for a valid date", () => {
    const result = formatDate(ISO);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });

  it("contains the year when formatted with en-US locale", () => {
    const result = formatDate(
      ISO,
      { year: "numeric", month: "short", day: "numeric" },
      "—",
      "en-US",
    );
    expect(result).toContain("2026");
  });

  it("returns '—' default fallback for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns '—' default fallback for an unparsable string", () => {
    expect(formatDate("not a date")).toBe("—");
  });

  it("returns a custom fallback string", () => {
    expect(formatDate(null, undefined, "N/A")).toBe("N/A");
  });
});

describe("formatDateTime", () => {
  it("returns a non-empty string for a valid date", () => {
    const result = formatDateTime("2026-01-15T10:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });

  it("returns '—' for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("returns a custom fallback", () => {
    expect(formatDateTime(null, undefined, "N/A")).toBe("N/A");
  });
});

describe("formatTime", () => {
  it("returns a non-empty string for a valid date", () => {
    const result = formatTime("2026-01-15T10:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });

  it("returns '—' for null", () => {
    expect(formatTime(null)).toBe("—");
  });
});

describe("msSinceNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for null/undefined input", () => {
    expect(msSinceNow(null)).toBeNull();
    expect(msSinceNow(undefined)).toBeNull();
  });

  it("returns null for an unparsable string", () => {
    expect(msSinceNow("not-a-date")).toBeNull();
  });

  it("returns elapsed milliseconds since the given date", () => {
    const anchor = new Date("2026-01-15T10:00:00.000Z");
    vi.useFakeTimers({ now: anchor.getTime() + 5_000 });
    expect(msSinceNow(anchor)).toBe(5_000);
  });

  it("returns a negative number for a future date", () => {
    const now = new Date("2026-01-15T10:00:00.000Z");
    vi.useFakeTimers({ now: now.getTime() });
    const future = new Date(now.getTime() + 60_000);
    expect(msSinceNow(future)).toBe(-60_000);
  });

  it("returns 0 when the date equals now", () => {
    const now = new Date("2026-01-15T10:00:00.000Z");
    vi.useFakeTimers({ now: now.getTime() });
    expect(msSinceNow(now)).toBe(0);
  });
});

describe("formatRelative", () => {
  const BASE = new Date("2026-01-15T12:00:00.000Z");

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the default fallback '—' for null", () => {
    expect(formatRelative(null)).toBe("—");
  });

  it("returns a custom fallback for unparsable input", () => {
    expect(formatRelative("bad", "N/A")).toBe("N/A");
  });

  it("returns 'just now' for less than 1 minute ago", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 30_000 });
    expect(formatRelative(BASE)).toBe("just now");
  });

  it("returns 'just now' at exactly 0 ms elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() });
    expect(formatRelative(BASE)).toBe("just now");
  });

  it("returns '3m ago' at 3 minutes elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 3 * 60_000 });
    expect(formatRelative(BASE)).toBe("3m ago");
  });

  it("returns '59m ago' at 59 minutes elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 59 * 60_000 });
    expect(formatRelative(BASE)).toBe("59m ago");
  });

  it("returns '5h ago' at 5 hours elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 5 * 3_600_000 });
    expect(formatRelative(BASE)).toBe("5h ago");
  });

  it("returns '23h ago' at 23 hours elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 23 * 3_600_000 });
    expect(formatRelative(BASE)).toBe("23h ago");
  });

  it("returns '3d ago' at 3 days elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 3 * 86_400_000 });
    expect(formatRelative(BASE)).toBe("3d ago");
  });

  it("returns '6d ago' at 6 days elapsed", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 6 * 86_400_000 });
    expect(formatRelative(BASE)).toBe("6d ago");
  });

  it("returns a localized date string for more than 7 days ago", () => {
    vi.useFakeTimers({ now: BASE.getTime() + 14 * 86_400_000 });
    const result = formatRelative(BASE);
    // Should be a locale date like "Jan 15" — not a relative string
    expect(result).not.toMatch(/ago$/);
    expect(result).not.toBe("—");
    expect(typeof result).toBe("string");
  });

  it("returns a date string (not the fallback) for future dates", () => {
    // Negative elapsed — branch returns toLocaleDateString()
    vi.useFakeTimers({ now: BASE.getTime() - 3_600_000 });
    const result = formatRelative(BASE);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
  });
});
