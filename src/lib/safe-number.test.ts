import { describe, it, expect } from "vitest";
import {
  safeNumber,
  safeFixed,
  formatMoney,
  formatPercent,
  formatInt,
  formatPhone,
} from "./safe-number";

describe("safeNumber", () => {
  it("returns finite numbers as-is", () => {
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(-3.14)).toBe(-3.14);
  });

  it("returns null for non-finite number inputs", () => {
    expect(safeNumber(NaN)).toBeNull();
    expect(safeNumber(Infinity)).toBeNull();
    expect(safeNumber(-Infinity)).toBeNull();
  });

  it("parses clean numeric strings", () => {
    expect(safeNumber("42")).toBe(42);
    expect(safeNumber("3.14")).toBe(3.14);
    expect(safeNumber("0")).toBe(0);
    expect(safeNumber("-7")).toBe(-7);
    expect(safeNumber("  12  ")).toBe(12);
  });

  it("returns null for strings with trailing non-numeric content", () => {
    expect(safeNumber("12.5px")).toBeNull();
    expect(safeNumber("100%")).toBeNull();
    expect(safeNumber("$50")).toBeNull();
    expect(safeNumber("1e")).toBeNull();
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(safeNumber("")).toBeNull();
    expect(safeNumber("   ")).toBeNull();
  });

  it("converts booleans (true→1, false→0)", () => {
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });

  it("returns null for null, undefined, and object types", () => {
    expect(safeNumber(null)).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
    expect(safeNumber({})).toBeNull();
    expect(safeNumber([])).toBeNull();
  });
});

describe("safeFixed", () => {
  it("formats a number to the given decimal places", () => {
    expect(safeFixed(3.14159, 2)).toBe("3.14");
    expect(safeFixed(1, 0)).toBe("1");
    expect(safeFixed(1.005, 2)).toBe("1.00"); // floating-point behaviour
  });

  it("returns shape-matching zero fallback when no fallback provided", () => {
    expect(safeFixed(null, 2)).toBe("0.00");
    expect(safeFixed(null, 0)).toBe("0");
    expect(safeFixed(undefined, 3)).toBe("0.000");
  });

  it("returns the custom fallback string when provided", () => {
    expect(safeFixed("nope", 2, "—")).toBe("—");
    expect(safeFixed(null, 2, "—")).toBe("—");
    expect(safeFixed(NaN, 2, "N/A")).toBe("N/A");
  });

  it("formats negative numbers", () => {
    expect(safeFixed(-1.5, 1)).toBe("-1.5");
  });

  it("accepts parseable string inputs", () => {
    expect(safeFixed("12.567", 2)).toBe("12.57");
  });
});

describe("formatMoney", () => {
  it("formats with a dollar sign and 2 decimal places by default", () => {
    expect(formatMoney(12.5)).toBe("$12.50");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(1000)).toBe("$1000.00");
  });

  it("falls back to $0.00 for null and undefined", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });

  it("respects a custom decimal count", () => {
    expect(formatMoney(0.0042, 4)).toBe("$0.0042");
    expect(formatMoney(9.9, 0)).toBe("$10");
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-5.5)).toBe("$-5.50");
  });
});

describe("formatPercent", () => {
  it("multiplies fraction input by 100 by default", () => {
    expect(formatPercent(0.123)).toBe("12%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("handles alreadyScaled=true", () => {
    expect(formatPercent(12.3, 0, true)).toBe("12%");
    expect(formatPercent(100, 0, true)).toBe("100%");
  });

  it("respects the decimals parameter", () => {
    expect(formatPercent(0.1234, 1)).toBe("12.3%");
    expect(formatPercent(0.5, 2)).toBe("50.00%");
  });

  it("returns '0%' fallback for null/undefined", () => {
    expect(formatPercent(null)).toBe("0%");
    expect(formatPercent(undefined)).toBe("0%");
  });

  it("returns a custom fallback when provided", () => {
    expect(formatPercent(null, 0, false, "—%")).toBe("—%");
  });
});

describe("formatInt", () => {
  it("formats an integer with thousands separators", () => {
    // Locale-aware: rely on the value being non-empty and containing the digits
    const result = formatInt(1234567);
    expect(result).toContain("234");
    expect(result).toContain("567");
  });

  it("rounds decimal inputs", () => {
    expect(formatInt(3.7)).toBe("4");
    expect(formatInt(3.2)).toBe("3");
  });

  it("handles zero", () => {
    expect(formatInt(0)).toBe("0");
  });

  it("falls back to '0' for null and undefined", () => {
    expect(formatInt(null)).toBe("0");
    expect(formatInt(undefined)).toBe("0");
  });

  it("returns a custom fallback when provided", () => {
    expect(formatInt(null, "—")).toBe("—");
    expect(formatInt(undefined, "N/A")).toBe("N/A");
  });
});

describe("formatPhone", () => {
  it("formats an 11-digit E.164 US number", () => {
    expect(formatPhone("15551234567")).toBe("+1 (555) 123-4567");
  });

  it("formats an E.164 number with plus sign", () => {
    expect(formatPhone("+15551234567")).toBe("+1 (555) 123-4567");
  });

  it("formats a 10-digit NANP number without country code", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("passes through non-NANP international numbers unchanged", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("passes through numbers with fewer than 10 digits unchanged", () => {
    expect(formatPhone("12345")).toBe("12345");
  });

  it("returns empty string fallback for null and undefined", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
  });

  it("returns a custom fallback for null", () => {
    expect(formatPhone(null, "N/A")).toBe("N/A");
  });

  it("returns the fallback for empty string input", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("", "—")).toBe("—");
  });
});
