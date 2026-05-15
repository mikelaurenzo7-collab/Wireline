import { describe, it, expect } from "vitest";
import { PRESERVED_LEAD_STATUSES } from "./vapi-helpers";

describe("PRESERVED_LEAD_STATUSES", () => {
  // Regression: the constant used to be a parenthesised SQL string
  // `'("Voicemail-Left","Callback-Scheduled","Blocked-DNC")'` cast to any
  // before being passed to Drizzle's `inArray(...)`. Drizzle treated it as a
  // single value, so `not(inArray(...))` always matched and the in-call
  // `update_lead_status` tool could overwrite protected statuses.
  it("is a real array — not a SQL string", () => {
    expect(Array.isArray(PRESERVED_LEAD_STATUSES)).toBe(true);
  });

  it("contains the sticky statuses an agent must never overwrite mid-call", () => {
    expect(PRESERVED_LEAD_STATUSES).toEqual(
      expect.arrayContaining(["Voicemail-Left", "Callback-Scheduled", "Blocked-DNC"]),
    );
  });

  it("contains only string values (Drizzle inArray contract)", () => {
    for (const v of PRESERVED_LEAD_STATUSES) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
      expect(v).not.toMatch(/[()'"]/);
    }
  });
});
