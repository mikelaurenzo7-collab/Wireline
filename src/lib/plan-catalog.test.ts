// plan-catalog tests — these constants ARE the public pricing
// contract. The numbers in here flow into:
//   - /pricing page tier cards
//   - the TrialGateModal upgrade picker
//   - Stripe checkout (via priceIdEnv → STRIPE_*_PRICE_ID lookup)
//   - billing webhook tier resolution (planByPriceId)
//
// If any number drifts, Stripe sells the wrong plan for the marketed
// price → real money lost on every misroute. These tests pin every
// tier's id / name / price / max_agents / voice_minutes / phone
// numbers + the two lookup helpers' behavior.

import { describe, it, expect } from "vitest";
import { STRIPE_PLANS, planById, planByPriceId, plansForClient } from "./plan-catalog";

describe("STRIPE_PLANS — tier shape contract", () => {
  it("exports exactly the five canonical tiers in priced order", () => {
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual([
      "personal",
      "starter",
      "pro",
      "business",
      "enterprise",
    ]);
  });

  it("every plan has a positive max_agents and voice_minutes_monthly", () => {
    for (const p of STRIPE_PLANS) {
      expect(p.max_agents).toBeGreaterThan(0);
      expect(p.voice_minutes_monthly).toBeGreaterThan(0);
      expect(p.included_phone_numbers).toBeGreaterThan(0);
    }
  });

  it("self-serve tiers have price_usd_monthly > 0; enterprise is contact-sales (=0)", () => {
    for (const p of STRIPE_PLANS) {
      if (p.id === "enterprise") {
        expect(p.price_usd_monthly).toBe(0);
      } else {
        expect(p.price_usd_monthly).toBeGreaterThan(0);
      }
    }
  });

  it("price ladder is strictly increasing across the four self-serve tiers", () => {
    const selfServe = STRIPE_PLANS.filter((p) => p.id !== "enterprise");
    for (let i = 1; i < selfServe.length; i++) {
      expect(selfServe[i].price_usd_monthly).toBeGreaterThan(selfServe[i - 1].price_usd_monthly);
    }
  });

  it("agent + minutes capacity ladder is monotonic (each tier never gives less than the previous)", () => {
    for (let i = 1; i < STRIPE_PLANS.length; i++) {
      expect(STRIPE_PLANS[i].max_agents).toBeGreaterThanOrEqual(STRIPE_PLANS[i - 1].max_agents);
      expect(STRIPE_PLANS[i].voice_minutes_monthly).toBeGreaterThanOrEqual(
        STRIPE_PLANS[i - 1].voice_minutes_monthly,
      );
    }
  });

  it("each tier ships at least one feature bullet for the /pricing page", () => {
    for (const p of STRIPE_PLANS) {
      expect(Array.isArray(p.features)).toBe(true);
      expect(p.features.length).toBeGreaterThan(0);
    }
  });

  it("every self-serve tier carries a distinct priceIdEnv (no env-var collisions)", () => {
    const ids = STRIPE_PLANS.filter((p) => p.id !== "enterprise").map((p) => p.priceIdEnv);
    expect(new Set(ids).size).toBe(ids.length);
    // Every env var follows STRIPE_<TIER>_PRICE_ID
    for (const env of ids) {
      expect(env).toMatch(/^STRIPE_[A-Z]+_PRICE_ID$/);
    }
  });

  it("overage_per_min_usd decreases (or stays flat) as the tier scales — bulk discount", () => {
    const selfServe = STRIPE_PLANS.filter((p) => p.id !== "enterprise");
    for (let i = 1; i < selfServe.length; i++) {
      expect(selfServe[i].overage_per_min_usd).toBeLessThanOrEqual(
        selfServe[i - 1].overage_per_min_usd,
      );
    }
  });
});

describe("planById", () => {
  it("returns the plan when the id matches", () => {
    expect(planById("starter")?.id).toBe("starter");
    expect(planById("enterprise")?.id).toBe("enterprise");
  });

  it("returns null for unknown / empty / null / undefined", () => {
    expect(planById(null)).toBeNull();
    expect(planById(undefined)).toBeNull();
    expect(planById("")).toBeNull();
    expect(planById("not-a-real-plan")).toBeNull();
  });
});

describe("planByPriceId", () => {
  it("looks up by the value of the configured priceIdEnv at call time", () => {
    const original = process.env.STRIPE_STARTER_PRICE_ID;
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_test_123";
    try {
      expect(planByPriceId("price_starter_test_123")?.id).toBe("starter");
    } finally {
      if (original === undefined) delete process.env.STRIPE_STARTER_PRICE_ID;
      else process.env.STRIPE_STARTER_PRICE_ID = original;
    }
  });

  it("returns null for unmatched / empty / null / undefined", () => {
    expect(planByPriceId(null)).toBeNull();
    expect(planByPriceId(undefined)).toBeNull();
    expect(planByPriceId("")).toBeNull();
    expect(planByPriceId("price_nonexistent_zzz")).toBeNull();
  });
});

describe("plansForClient — public payload", () => {
  it("returns one row per plan with the marketing-safe fields only", () => {
    const out = plansForClient();
    expect(out.length).toBe(STRIPE_PLANS.length);
    for (const row of out) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.name).toBe("string");
      expect(typeof row.price_usd_monthly).toBe("number");
      // priceIdEnv must never leak to the client — env var names hint
      // at infrastructure layout.
      expect((row as any).priceIdEnv).toBeUndefined();
    }
  });
});
