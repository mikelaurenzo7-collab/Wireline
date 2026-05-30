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
      "starter",
      "pro",
      "business",
      "enterprise",
    ]);
  });

  it.each(["personal", "starter", "pro", "business"] as StripePlanId[])(
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

  it("enterprise is gated as 'contact sales' (price 0 sentinel)", () => {
    const ent = STRIPE_PLANS.find((p) => p.id === "enterprise")!;
    expect(ent.price_usd_monthly).toBe(0);
    expect(ent.max_agents).toBeGreaterThanOrEqual(100);
  });
});

describe("pricing ladder — overage drops as tier rises (upgrade math)", () => {
  it("each consumer tier has a strictly lower overage rate than the previous", () => {
    const personal = STRIPE_PLANS.find((p) => p.id === "personal")!;
    const starter = STRIPE_PLANS.find((p) => p.id === "starter")!;
    const pro = STRIPE_PLANS.find((p) => p.id === "pro")!;
    const business = STRIPE_PLANS.find((p) => p.id === "business")!;

    expect(starter.overage_per_min_usd).toBeLessThan(personal.overage_per_min_usd);
    expect(pro.overage_per_min_usd).toBeLessThan(starter.overage_per_min_usd);
    expect(business.overage_per_min_usd).toBeLessThan(pro.overage_per_min_usd);
  });

  it("each tier ships at least 2x the previous tier's minute allowance", () => {
    const personal = STRIPE_PLANS.find((p) => p.id === "personal")!;
    const starter = STRIPE_PLANS.find((p) => p.id === "starter")!;
    const pro = STRIPE_PLANS.find((p) => p.id === "pro")!;
    const business = STRIPE_PLANS.find((p) => p.id === "business")!;

    expect(starter.voice_minutes_monthly).toBeGreaterThanOrEqual(
      personal.voice_minutes_monthly * 2,
    );
    expect(pro.voice_minutes_monthly).toBeGreaterThanOrEqual(starter.voice_minutes_monthly * 2);
    expect(business.voice_minutes_monthly).toBeGreaterThanOrEqual(pro.voice_minutes_monthly * 2);
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
    // Stub the env var the Pro plan reads from, look it up, then restore.
    const env = STRIPE_PLANS.find((p) => p.id === "pro")!.priceIdEnv;
    const old = process.env[env];
    process.env[env] = "price_test_pro_123";
    try {
      expect(planByPriceId("price_test_pro_123")?.id).toBe("pro");
    } finally {
      if (old === undefined) delete process.env[env];
      else process.env[env] = old;
    }
  });
});

describe("plansForClient — public-facing payload safety", () => {
  it("never marks enterprise as configured even with an env var set", () => {
    // Enterprise is contact_sales — exposing it as checkout-able would
    // let anyone subscribe at $0/mo if the env was left from an older tier.
    const env = STRIPE_PLANS.find((p) => p.id === "enterprise")!.priceIdEnv;
    const old = process.env[env];
    process.env[env] = "price_test_should_not_matter";
    try {
      const out = plansForClient();
      const enterprise = out.find((p) => p.id === "enterprise")!;
      expect(enterprise.contact_sales).toBe(true);
      expect(enterprise.configured).toBe(false);
    } finally {
      if (old === undefined) delete process.env[env];
      else process.env[env] = old;
    }
  });

  it("exposes only the public-safe fields (no priceIdEnv leakage)", () => {
    const out = plansForClient();
    for (const p of out) {
      expect(p).not.toHaveProperty("priceIdEnv");
      expect(p).not.toHaveProperty("extraAgentPriceIdEnv");
      expect(p).not.toHaveProperty("overagePriceIdEnv");
    }
  });
});
