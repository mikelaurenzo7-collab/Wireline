import { describe, expect, it } from "vitest";
import { normalizeOutboundNumber } from "../src/lib/dialer-compliance";

describe("normalizeOutboundNumber (E.164 for the dial site)", () => {
  it("adds +1 to a bare 10-digit North American number", () => {
    expect(normalizeOutboundNumber("5551234567")).toBe("+15551234567");
  });
  it("adds + to an 11-digit number that already starts with 1", () => {
    expect(normalizeOutboundNumber("15551234567")).toBe("+15551234567");
  });
  it("strips formatting punctuation before normalizing", () => {
    expect(normalizeOutboundNumber("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeOutboundNumber("555.123.4567")).toBe("+15551234567");
  });
  it("preserves a leading + for international numbers (digits only)", () => {
    expect(normalizeOutboundNumber("+44 20 7946 0000")).toBe("+442079460000");
  });
  it("returns sub-7-digit input trimmed and unchanged (not a dialable number)", () => {
    expect(normalizeOutboundNumber("12345")).toBe("12345");
    expect(normalizeOutboundNumber("  911 ")).toBe("911");
  });
  it("returns empty/blank input trimmed", () => {
    expect(normalizeOutboundNumber("")).toBe("");
    expect(normalizeOutboundNumber("   ")).toBe("");
  });
});
