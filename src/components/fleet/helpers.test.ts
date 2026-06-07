/**
 * fleet/helpers.test.ts
 * ----------------------------------------------------------------------
 * Locks the contract of the fleet helpers extracted from FleetSettings
 * in the 2026 audit slicing pass. Two consumers depend on this surface
 * (InsightsView, DeployAgentModal) — if anyone deletes a role or
 * renames a default voice, these tests fail loudly instead of leaking
 * a runtime "undefined.label" crash in production.
 */
import { describe, expect, it } from "vitest";
import { PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER, AGENT_ROLES, getRoleMeta } from "./helpers";

describe("PREMIUM_VOICES catalog", () => {
  it("has at least one voice per gender (female / male / neutral)", () => {
    const genders = new Set(PREMIUM_VOICES.map((v) => v.gender));
    expect(genders).toContain("female");
    expect(genders).toContain("male");
    expect(genders).toContain("neutral");
  });

  it("every voice has the required fields shape", () => {
    for (const v of PREMIUM_VOICES) {
      expect(typeof v.id).toBe("string");
      expect(v.id.length).toBeGreaterThan(0);
      expect(typeof v.provider).toBe("string");
      expect(["11labs", "openai"]).toContain(v.provider);
      expect(typeof v.name).toBe("string");
      expect(["female", "male", "neutral"]).toContain(v.gender);
    }
  });

  it("voice ids are unique (Vapi rejects duplicate selection)", () => {
    const ids = PREMIUM_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("DEFAULT_VOICE_BY_GENDER", () => {
  it("references voices that actually exist in PREMIUM_VOICES", () => {
    const female = PREMIUM_VOICES.find((v) => v.id === DEFAULT_VOICE_BY_GENDER.female);
    const male = PREMIUM_VOICES.find((v) => v.id === DEFAULT_VOICE_BY_GENDER.male);
    expect(female, "default female voice missing from catalog").toBeDefined();
    expect(male, "default male voice missing from catalog").toBeDefined();
  });

  it("default female voice IS female; default male voice IS male", () => {
    const female = PREMIUM_VOICES.find((v) => v.id === DEFAULT_VOICE_BY_GENDER.female)!;
    const male = PREMIUM_VOICES.find((v) => v.id === DEFAULT_VOICE_BY_GENDER.male)!;
    expect(female.gender).toBe("female");
    expect(male.gender).toBe("male");
  });
});

describe("AGENT_ROLES catalog", () => {
  it("ships at least the 8 canonical roles", () => {
    expect(AGENT_ROLES.length).toBeGreaterThanOrEqual(8);
    const values = new Set(AGENT_ROLES.map((r) => r.value));
    expect(values).toContain("sales");
    expect(values).toContain("customer_service");
    expect(values).toContain("scheduler");
    expect(values).toContain("collections");
    expect(values).toContain("technical_support");
    expect(values).toContain("lead_qualifier");
    expect(values).toContain("receptionist");
    expect(values).toContain("marketing");
  });

  // Roles carry a complete class set for bg / text / border / dot. The design
  // system mixes raw Tailwind literals (e.g. `bg-amber-500/10`) with semantic
  // design tokens introduced in the 2026-06 brand pass (e.g. `wl-status-success`,
  // `bg-brand`, arbitrary `border-[color-mix(...)]`), so we assert each slot is a
  // non-empty utility string rather than pinning a single literal shape.
  it("every role has a complete class set (bg / text / border / dot)", () => {
    const isClass = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    for (const r of AGENT_ROLES) {
      expect(isClass(r.tw.bg)).toBe(true);
      expect(isClass(r.tw.text)).toBe(true);
      expect(isClass(r.tw.border)).toBe(true);
      expect(isClass(r.tw.dot)).toBe(true);
    }
  });

  it("role values are unique (form selects de-dupe on value)", () => {
    const values = AGENT_ROLES.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("getRoleMeta", () => {
  it("returns the matched role when one exists", () => {
    expect(getRoleMeta("sales").value).toBe("sales");
    expect(getRoleMeta("receptionist").value).toBe("receptionist");
  });

  it("falls back to customer_service for unknown / missing roles", () => {
    expect(getRoleMeta(undefined).value).toBe("customer_service");
    expect(getRoleMeta("nonsense").value).toBe("customer_service");
  });

  it("keeps customer_service on the purple brand family (not signal green)", () => {
    const cs = getRoleMeta("customer_service");
    expect(cs.tw.text).toBe("text-brand");
    expect(cs.tw.bg).toBe("bg-brand/8");
    expect(cs.tw.text).not.toContain("wl-text-success");
  });
});
