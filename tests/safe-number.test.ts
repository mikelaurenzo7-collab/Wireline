import { describe, expect, it } from "vitest";
import {
  formatInt,
  formatMoney,
  formatPercent,
  formatPhone,
  safeFixed,
  safeNumber,
} from "../src/lib/safe-number";

describe("safeNumber", () => {
  it("coerces finite numbers and numeric strings", () => {
    expect(safeNumber(12.5)).toBe(12.5);
    expect(safeNumber("12.5")).toBe(12.5);
    expect(safeNumber(0)).toBe(0);
  });
  it("rejects non-pure-numeric strings, empty, null, NaN, Infinity", () => {
    expect(safeNumber("12.5px")).toBeNull();
    expect(safeNumber("")).toBeNull();
    expect(safeNumber("   ")).toBeNull();
    expect(safeNumber(null)).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
    expect(safeNumber(NaN)).toBeNull();
    expect(safeNumber(Infinity)).toBeNull();
  });
  it("maps booleans to 1/0", () => {
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });
});

describe("safeFixed", () => {
  it("formats to fixed decimals and never throws", () => {
    expect(safeFixed(3.14159, 2)).toBe("3.14");
    expect(safeFixed(null, 2)).toBe("0.00");
    expect(safeFixed("nope", 2, "—")).toBe("—");
  });
});

describe("formatMoney / formatPercent", () => {
  it("formats money with a $ and a numeric fallback", () => {
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(0.0042, 4)).toBe("$0.0042");
  });
  it("formats a fraction as a percent, scaling by default", () => {
    expect(formatPercent(0.123)).toBe("12%");
    expect(formatPercent(12.3, 0, true)).toBe("12%");
    expect(formatPercent(null)).toBe("0%");
  });
});

describe("formatInt / formatPhone", () => {
  it("formats integers (locale-robust digit check) and falls back to 0", () => {
    expect(formatInt(1234567).replace(/\D/g, "")).toBe("1234567");
    expect(formatInt(null)).toBe("0");
  });
  it("formats NANP phone numbers and passes through non-NANP / empty", () => {
    expect(formatPhone("15551234567")).toBe("+1 (555) 123-4567");
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatPhone("+44 20 7946")).toBe("+44 20 7946");
    expect(formatPhone(null)).toBe("");
  });
});
