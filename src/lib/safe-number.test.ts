/**
 * safe-number.test.ts
 * ----------------------------------------------------------------------
 * The docstring on safe-number.ts promises this peer file ("tested in
 * src/lib/safe-number.test.ts"). It guards the crash-prevention number
 * formatters that ~25 components route API-supplied values through. A
 * regression here either throws inside a render (white screen) or quietly
 * prints "NaN" / "$NaN" on money surfaces, so the contract is locked down
 * here.
 */
import { describe, expect, it } from "vitest";
import {
  safeNumber,
  safeFixed,
  formatMoney,
  formatCost,
  formatPercent,
  formatInt,
  formatPhone,
} from "./safe-number";

describe("safeNumber", () => {
  it("passes finite numbers through unchanged", () => {
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(12.5)).toBe(12.5);
    expect(safeNumber(-7)).toBe(-7);
  });

  it("rejects non-finite numbers", () => {
    expect(safeNumber(NaN)).toBeNull();
    expect(safeNumber(Infinity)).toBeNull();
    expect(safeNumber(-Infinity)).toBeNull();
  });

  it("parses pure-numeric strings", () => {
    expect(safeNumber("12.5")).toBe(12.5);
    expect(safeNumber("  42 ")).toBe(42);
    expect(safeNumber("-3.14")).toBe(-3.14);
  });

  it("rejects empty / whitespace-only strings as missing (not zero)", () => {
    expect(safeNumber("")).toBeNull();
    expect(safeNumber("   ")).toBeNull();
  });

  it("rejects non-numeric and unit-suffixed strings", () => {
    expect(safeNumber("12.5px")).toBeNull();
    expect(safeNumber("nope")).toBeNull();
    expect(safeNumber("$12")).toBeNull();
  });

  it("coerces booleans to 1 / 0", () => {
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });

  it("returns null for null / undefined / objects / arrays", () => {
    expect(safeNumber(null)).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
    expect(safeNumber({})).toBeNull();
    expect(safeNumber([1])).toBeNull();
  });
});

describe("safeFixed", () => {
  it("formats finite numbers to the requested decimals", () => {
    expect(safeFixed(3.14159, 2)).toBe("3.14");
    expect(safeFixed(3, 0)).toBe("3");
    expect(safeFixed("1.5", 3)).toBe("1.500");
  });

  it("derives a shape-matching default fallback for missing input", () => {
    expect(safeFixed(null, 2)).toBe("0.00");
    expect(safeFixed(undefined, 0)).toBe("0");
  });

  it("honors an explicit fallback for unparsable input", () => {
    expect(safeFixed("nope", 2, "—")).toBe("—");
  });

  it("clamps negative / fractional decimal counts to a safe integer", () => {
    expect(safeFixed(1.23, -1)).toBe("1");
    expect(safeFixed(1.23, 2.9)).toBe("1.23");
  });
});

describe("formatMoney", () => {
  it("prefixes a dollar sign with two default decimals", () => {
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("falls back to $0.00 for missing input", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(NaN)).toBe("$0.00");
  });

  it("supports sub-cent precision when asked", () => {
    expect(formatMoney(0.0042, 4)).toBe("$0.0042");
  });
});

describe("formatCost", () => {
  it("shows Free for zero, negative, or missing cost", () => {
    expect(formatCost(0)).toBe("Free");
    expect(formatCost(null)).toBe("Free");
    expect(formatCost(undefined)).toBe("Free");
    expect(formatCost(-1)).toBe("Free");
    expect(formatCost(NaN)).toBe("Free");
  });

  it("collapses sub-cent spend into <$0.01 instead of $0.0000", () => {
    expect(formatCost(0.0004)).toBe("<$0.01");
    expect(formatCost(0.009)).toBe("<$0.01");
  });

  it("formats real costs with two decimals", () => {
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(12.5)).toBe("$12.50");
  });
});

describe("formatPercent", () => {
  it("treats input as a 0..1 fraction by default", () => {
    expect(formatPercent(0.123)).toBe("12%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("treats input as already-scaled when flagged", () => {
    expect(formatPercent(12.3, 0, true)).toBe("12%");
  });

  it("falls back to 0% on missing input", () => {
    expect(formatPercent(null)).toBe("0%");
  });

  it("respects requested decimal precision", () => {
    expect(formatPercent(0.1234, 1)).toBe("12.3%");
  });
});

describe("formatInt", () => {
  it("rounds and adds thousands separators", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatInt(1.6)).toBe("2");
  });

  it("falls back to 0 for missing input", () => {
    expect(formatInt(null)).toBe("0");
    expect(formatInt("nope")).toBe("0");
  });
});

describe("formatPhone", () => {
  it("formats 11-digit NANP numbers with the country code", () => {
    expect(formatPhone("15551234567")).toBe("+1 (555) 123-4567");
  });

  it("formats bare 10-digit numbers", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatPhone("(555) 123-4567")).toBe("(555) 123-4567");
  });

  it("passes through non-NANP input unchanged", () => {
    expect(formatPhone("+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });

  it("returns the fallback for empty / null input", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("", "n/a")).toBe("n/a");
  });
});
