/**
 * plan-catalog.test.ts
 * ----------------------------------------------------------------------
 * Tests pricing math + plan-id resolution. Pricing is the single source
 * of truth for billing — a regression here causes operators to be
 * charged wrong, which is the worst kind of bug to chase.
 *
 * Also enforces that the catalog matches the marketing surface
 * (README table) — that diff is enforced by scripts/check-readme-pricing.mjs
 * which CI runs via `npm run docs:check`.
 */
import { describe, expect, it } from "vitest";
import {
  STRIPE_PLANS,
  planById,
  planByPriceId,
  plansForClient,
  type StripePlanId,
} from "./plan-catalog";

describe("STRIPE_PLANS catalog shape", () => {
  it("ships the five canonical tiers in the documented order", () => {
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual([
      "personal",
      "personal-plus",
      "business-starter",
      "starter",
      "scale",
    ]);
  });

  it.each(["personal", "personal-plus", "business-starter", "starter", "scale"] as StripePlanId[])(
    "%s has all required pricing fields",
    (id) => {
      const plan = STRIPE_PLANS.find((p) => p.id === id)!;
      expect(plan.price_usd_monthly).toBeGreaterThan(0);
      expect(plan.max_agents).toBeGreaterThan(0);
      expect(plan.voice_minutes_monthly).toBeGreaterThan(0);
      expect(plan.overage_per_min_usd).toBeGreaterThan(0);
      expect(plan.included_phone_numbers).toBeGreaterThan(0);
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.priceIdEnv).toMatch(/^STRIPE_/);
    },
  );
});

describe("pricing ladder — overage drops as tier rises (upgrade math)", () => {
  it("each consumer tier has a strictly lower overage rate than the previous", () => {
    const personal = STRIPE_PLANS.find((p) => p.id === "personal")!;
    const personalPlus = STRIPE_PLANS.find((p) => p.id === "personal-plus")!;
    const businessStarter = STRIPE_PLANS.find((p) => p.id === "business-starter")!;
    const starter = STRIPE_PLANS.find((p) => p.id === "starter")!;
    const scale = STRIPE_PLANS.find((p) => p.id === "scale")!;

    expect(personalPlus.overage_per_min_usd).toBeLessThan(personal.overage_per_min_usd);
    expect(businessStarter.overage_per_min_usd).toBeLessThan(personalPlus.overage_per_min_usd);
    expect(starter.overage_per_min_usd).toBeLessThan(businessStarter.overage_per_min_usd);
    expect(scale.overage_per_min_usd).toBeLessThan(starter.overage_per_min_usd);
  });

  it("each tier ships at least 2x the previous tier's minute allowance", () => {
    const personal = STRIPE_PLANS.find((p) => p.id === "personal")!;
    const personalPlus = STRIPE_PLANS.find((p) => p.id === "personal-plus")!;
    const businessStarter = STRIPE_PLANS.find((p) => p.id === "business-starter")!;
    const starter = STRIPE_PLANS.find((p) => p.id === "starter")!;
    const scale = STRIPE_PLANS.find((p) => p.id === "scale")!;

    expect(personalPlus.voice_minutes_monthly).toBeGreaterThanOrEqual(
      personal.voice_minutes_monthly * 2,
    );
    expect(businessStarter.voice_minutes_monthly).toBeGreaterThanOrEqual(
      personalPlus.voice_minutes_monthly * 2,
    );
    expect(starter.voice_minutes_monthly).toBeGreaterThanOrEqual(
      businessStarter.voice_minutes_monthly * 2,
    );
    expect(scale.voice_minutes_monthly).toBeGreaterThanOrEqual(starter.voice_minutes_monthly * 2);
  });
});

describe("planById / planByPriceId resolution", () => {
  it("planById returns null for null/undefined/unknown ids", () => {
    expect(planById(null)).toBeNull();
    expect(planById(undefined)).toBeNull();
    expect(planById("ghost-tier")).toBeNull();
  });

  it("planById resolves each catalog id", () => {
    for (const p of STRIPE_PLANS) {
      expect(planById(p.id)?.id).toBe(p.id);
    }
  });

  it("planByPriceId returns null for null/undefined/missing env", () => {
    expect(planByPriceId(null)).toBeNull();
    expect(planByPriceId(undefined)).toBeNull();
    expect(planByPriceId("price_unknown")).toBeNull();
  });

  it("planByPriceId resolves a configured price id back to its plan", () => {
    // Stub the env var the starter plan reads from, look it up, then restore.
    const env = STRIPE_PLANS.find((p) => p.id === "starter")!.priceIdEnv;
    const old = process.env[env];
    process.env[env] = "price_test_pro_123";
    try {
      expect(planByPriceId("price_test_pro_123")?.id).toBe("starter");
    } finally {
      if (old === undefined) delete process.env[env];
      else process.env[env] = old;
    }
  });
});

describe("plansForClient — public-facing payload safety", () => {
  it("exposes only the public-safe fields (no priceIdEnv leakage)", () => {
    const out = plansForClient();
    for (const p of out) {
      expect(p).not.toHaveProperty("priceIdEnv");
      expect(p).not.toHaveProperty("extraAgentPriceIdEnv");
      expect(p).not.toHaveProperty("overagePriceIdEnv");
    }
  });
});
