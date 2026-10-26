import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../src/lib/usage-billing-catalog";
import {
  HOME_PLAN_IDS,
  PERSONAL_PLAN,
  PUBLIC_CHANNEL_PLANS,
  PUBLIC_ENTRY_PLANS,
  publicPriceHint,
  publicPriceSummary,
} from "../src/lib/public-plan-lineup";

describe("public plan lineup", () => {
  it("quotes catalog prices, never SMS packages", () => {
    expect(PUBLIC_CHANNEL_PLANS.length).toBe(9);
    expect(PUBLIC_CHANNEL_PLANS.some((plan) => plan.channels.includes("sms"))).toBe(false);
    expect(PUBLIC_CHANNEL_PLANS.some((plan) => plan.id === "personal")).toBe(false);
    expect(HOME_PLAN_IDS).toEqual(["personal", "email", "voice", "voice-email"]);
    expect(publicPriceSummary()).toBe(
      PUBLIC_USAGE_TIERS.map(
        (id) => `${USAGE_TIERS[id].name} $${USAGE_TIERS[id].monthlyUsd}/mo`,
      ).join(" · "),
    );
    expect(publicPriceHint()).toBe(
      PUBLIC_USAGE_TIERS.map((id) => `${USAGE_TIERS[id].name} $${USAGE_TIERS[id].monthlyUsd}`).join(
        " · ",
      ),
    );
    expect(publicPriceSummary()).not.toContain(`${String.fromCharCode(36)}19`);
  });

  it("keeps entry plans the cheapest package in each channel family", () => {
    for (const entry of Object.values(PUBLIC_ENTRY_PLANS)) {
      const family = PUBLIC_CHANNEL_PLANS.filter(
        (plan) => plan.channels.join("+") === entry.channels.join("+"),
      );
      expect(Math.min(...family.map((plan) => plan.price_usd_monthly))).toBe(
        entry.price_usd_monthly,
      );
    }
  });

  it("keeps the guarded Personal heading on /pricing in step with the catalog", () => {
    const pricing = readFileSync("src/pages/Pricing.tsx", "utf8");
    expect(pricing).toContain(`Personal · $${PERSONAL_PLAN.price_usd_monthly}/month`);
  });

  it("feeds Compare from the active catalog and keeps 404 navigation price-neutral", () => {
    expect(readFileSync("src/pages/Compare.tsx", "utf8")).toContain("price: publicPriceSummary()");
    expect(readFileSync("src/components/layout/NotFound.tsx", "utf8")).toContain(
      'hint="Plans And Usage"',
    );
  });
});
