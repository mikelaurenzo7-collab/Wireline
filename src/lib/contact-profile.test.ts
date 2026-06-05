import { describe, expect, it } from "vitest";
import { normalizePhoneTail } from "./contact-profile";

describe("normalizePhoneTail", () => {
  it("strips non-digits and keeps the last 10", () => {
    expect(normalizePhoneTail("+1 (555) 123-4567")).toBe("5551234567");
    expect(normalizePhoneTail("5551234567")).toBe("5551234567");
  });

  it("returns empty string when no digits", () => {
    expect(normalizePhoneTail("no-phone")).toBe("");
  });
});
