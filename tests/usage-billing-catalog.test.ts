import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import {
  USAGE_ADDONS,
  USAGE_BASE_USD_MONTHLY,
  USAGE_CATALOG_VERSION,
  USAGE_TIERS,
  USAGE_WORK_EVENT_NAME,
  USAGE_NEVER_PAY_FOR,
  crossedAlertThresholds,
  currentPricingFacts,
  estimateUsageBill,
  isStaleBotBoundPricing,
  withoutStaleBotBoundPricing,
  marginalUnitUsd,
  minimumMonthlyCapUsd,
  priceMeter,
} from "../src/lib/usage-billing-catalog";
import {
  USAGE_BILLING_ENV_VARS,
  USAGE_METER_EVENT_ENV,
  USAGE_PRICE_ENV,
  USAGE_TIER_PRICE_ENV,
  usageBillingEnabled,
  usageCheckoutConfigured,
  usageMeterEventName,
  usagePriceIds,
} from "../src/lib/usage-billing-config";
import { billingModelFromPayload } from "../src/lib/billing-model";
import UsagePricingPanel, {
  USAGE_RATE_LINES,
  estimateFromSliders,
} from "../src/components/usage-billing/UsagePricingPanel";
import {
  CATALOG_VERSION,
  assertUsageStripeAccount,
  BOTBOUND_LLC_STRIPE_ACCOUNT_IDS,
  BOTBOUND_STRIPE_ACCOUNT_ID,
  USAGE_STRIPE_PLAN,
  USAGE_STRIPE_PLANS,
  applyGuard,
  envVarNames,
  plannedObjects,
} from "../scripts/stripe-usage-billing-setup.mjs";

describe("usage rate card", () => {
  it("discloses each plan's allowance without selecting it or nesting controls", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(UsagePricingPanel)),
    );
    const cards = [
      ...markup.matchAll(/(<button\b[^>]*>[\s\S]*?<\/button>)\s*(<details\b[\s\S]*?<\/details>)/g),
    ];
    expect(cards).toHaveLength(3);
    for (const [index, id] of (["lite", "standard", "plus"] as const).entries()) {
      const plan = USAGE_TIERS[id];
      const [, selectButton, details] = cards[index];
      expect(selectButton).toContain(`$${plan.includedWorkUsd} shared work included`);
      expect(selectButton).toContain(`${plan.includedNumbers} phone`);
      expect(selectButton).toContain(`${plan.includedEmailAddresses} email`);
      expect(selectButton).not.toMatch(/<(?:summary|details|a)\b/);
      expect(details).toContain(`aria-label="${plan.name} Plan Details"`);
      expect(details).toContain("Calls, SMS, email, and Computer share this allowance.");
      expect(details).toContain("Resets monthly with no rollover.");
      expect(details).toContain('href="#usage-rates"');
    }
    expect(markup).toContain('id="usage-rates"');
    expect(markup).toContain("Get Starter");
  });

  it("shares SMS with call, email and Computer allowance instead of charging a second wallet", () => {
    const input = {
      tier: "lite" as const,
      callsPerMonth: 2,
      avgCallMinutes: 3,
      emailsPerMonth: 25,
      computerMinutes: 5,
      smsSegments: 25,
      number: false,
      emailAddress: false,
    };
    expect(estimateFromSliders(input)).toMatchObject({
      totalUsd: 12,
      workUsd: 4,
      includedRemainingUsd: 0,
    });
    expect(estimateFromSliders({ ...input, smsSegments: 26 })).toMatchObject({ totalUsd: 12.04 });
  });
  it("rounds the pooled invoice once across fractional channels", () => {
    expect(
      estimateUsageBill(
        {
          callMinutes: 48.02,
          emailsHandled: 0,
          computerMinutes: 0.025,
          numbers: 0,
          emailAddresses: 0,
        },
        "previous",
      ).totalUsd,
    ).toBe(19.01);
  });
  it("prices call minutes with included units, then graduated tiers", () => {
    expect(priceMeter("call_minutes", 0)).toBe(0);
    expect(priceMeter("call_minutes", 60)).toBe(15);
    expect(priceMeter("call_minutes", 61)).toBe(15.25);
    expect(priceMeter("call_minutes", 560)).toBe(140);
    expect(priceMeter("call_minutes", 2_060)).toBe(515);
    expect(priceMeter("call_minutes", 2_061)).toBe(515.25);
    expect(priceMeter("call_minutes", -5)).toBe(0);
    expect(priceMeter("call_minutes", Number.NaN)).toBe(0);
  });

  it("prices emails and computer minutes after their included units", () => {
    expect(priceMeter("emails_handled", 100)).toBe(2);
    expect(priceMeter("emails_handled", 300)).toBe(6);
    expect(priceMeter("computer_minutes", 15)).toBe(3);
    expect(priceMeter("computer_minutes", 20)).toBe(4);
  });

  it("reproduces the example bills in the design doc", () => {
    const solo = estimateUsageBill(
      {
        callMinutes: 180,
        emailsHandled: 40,
        computerMinutes: 5,
        numbers: 1,
        emailAddresses: 0,
      },
      "previous",
    );
    const salon = estimateUsageBill(
      {
        callMinutes: 1_000,
        emailsHandled: 300,
        computerMinutes: 20,
        numbers: 1,
        emailAddresses: 1,
      },
      "previous",
    );
    const multiLocation = estimateUsageBill(
      {
        callMinutes: 10_000,
        emailsHandled: 2_000,
        computerMinutes: 120,
        numbers: 3,
        emailAddresses: 3,
      },
      "previous",
    );
    expect(solo.totalUsd).toBe(56.8);
    expect(salon.totalUsd).toBe(274);
    expect(multiLocation.totalUsd).toBe(2_592);
    expect(solo.lines.map((line) => line.key)).toEqual([
      "base",
      "sms_segments",
      "call_minutes",
      "emails_handled",
      "computer_minutes",
      "number",
      "included_work",
    ]);
    expect(salon.fixedUsd).toBe(26);
  });

  it("prices the next unit at the tier the period total is in", () => {
    expect(marginalUnitUsd("call_minutes", 10)).toBe(0.25);
    expect(marginalUnitUsd("call_minutes", 60)).toBe(0.25);
    expect(marginalUnitUsd("call_minutes", 600)).toBe(0.25);
    expect(marginalUnitUsd("call_minutes", 5_000)).toBe(0.25);
  });

  it("keeps the minimum cap above fixed charges and alerts at 50/80/100", () => {
    expect(minimumMonthlyCapUsd({ numbers: 0, emailAddresses: 0 })).toBe(29);
    expect(minimumMonthlyCapUsd({ numbers: 2, emailAddresses: 1 })).toBe(39);
    expect(minimumMonthlyCapUsd({ numbers: 0, emailAddresses: 0 }, "previous")).toBe(24);
    expect(minimumMonthlyCapUsd({ numbers: 2, emailAddresses: 1 }, "previous")).toBe(34);
    expect(crossedAlertThresholds(0, 49)).toEqual([]);
    expect(crossedAlertThresholds(0, 85)).toEqual([50, 80]);
    expect(crossedAlertThresholds(80, 100)).toEqual([100]);
    expect(USAGE_NEVER_PAY_FOR).toEqual(["Bots", "Summaries"]);
  });

  it("estimates from the pricing sliders with optional add-ons", () => {
    expect(
      estimateFromSliders({
        callsPerMonth: 60,
        avgCallMinutes: 3,
        emailsPerMonth: 40,
        number: true,
        emailAddress: false,
      }).totalUsd,
    ).toBe(55.8);
    expect(
      estimateFromSliders({
        callsPerMonth: 0,
        avgCallMinutes: 3,
        emailsPerMonth: 0,
        number: false,
        emailAddress: false,
      }).totalUsd,
    ).toBe(USAGE_BASE_USD_MONTHLY);
  });

  it("writes rate lines from the catalog in plain words", () => {
    const copy = USAGE_RATE_LINES.flat().join(" ");
    expect(copy).toContain("$0.25/min from your shared work allowance");
    expect(copy).toContain("$3/month beyond your plan's included local numbers");
    expect(copy).toContain("Gmail and Outlook connect at no extra cost");
    expect(copy).toContain("Inbound & Outbound Calls");
    expect(copy).toContain("$0.04 per sent US SMS segment");
    expect(copy).not.toMatch(/free|—|wireline/i);
  });
});

describe("usage billing flag and payload", () => {
  it("stays off unless USAGE_BILLING_ENABLED is exactly true", () => {
    expect(usageBillingEnabled({})).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: "1" })).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: "yes" })).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: " TRUE " })).toBe(true);
  });

  it("opens checkout only with the flag and all four offered prices", () => {
    const standard = USAGE_TIER_PRICE_ENV.standard;
    const prices = {
      [standard.base]: "price_base",
      [standard.work]: "price_work",
      [USAGE_PRICE_ENV.number]: "price_number",
      [USAGE_PRICE_ENV.email_address]: "price_mailbox",
    };
    expect(usageCheckoutConfigured(prices)).toBe(false);
    expect(usageCheckoutConfigured({ ...prices, USAGE_BILLING_ENABLED: "true" })).toBe(true);
    const { [standard.work]: _omitted, ...missingOne } = prices;
    expect(usageCheckoutConfigured({ ...missingOne, USAGE_BILLING_ENABLED: "true" })).toBe(false);
    const retired = {
      USAGE_BILLING_ENABLED: "true",
      [USAGE_PRICE_ENV.base]: "price_retired_base",
      [USAGE_PRICE_ENV.work]: "price_retired_work",
      [USAGE_PRICE_ENV.number]: "price_number",
      [USAGE_PRICE_ENV.email_address]: "price_mailbox",
    };
    expect(usageCheckoutConfigured(retired)).toBe(false);
    expect(usageCheckoutConfigured(retired, "previous")).toBe(true);
    expect([...usagePriceIds(prices)].sort()).toEqual(
      ["price_base", "price_work", "price_number", "price_mailbox"].sort(),
    );
  });

  it("defaults meter event names to the catalog and allows an override", () => {
    expect(usageMeterEventName("call_minutes", {})).toBe(USAGE_WORK_EVENT_NAME);
    expect(
      usageMeterEventName("call_minutes", { [USAGE_METER_EVENT_ENV.call_minutes]: "custom" }),
    ).toBe("custom");
  });

  it("reads the billing model from /api/billing/plans and falls back to plans", () => {
    expect(
      billingModelFromPayload({ billing_model: "usage", usage_checkout_available: true }),
    ).toBe("usage");
    expect(
      billingModelFromPayload({ billing_model: "usage", usage_checkout_available: false }),
    ).toBe("plans");
    expect(billingModelFromPayload({ billing_model: "usage" })).toBe("plans");
    expect(billingModelFromPayload({ billing_model: "plans" })).toBe("plans");
    expect(billingModelFromPayload({})).toBe("plans");
    expect(billingModelFromPayload(null)).toBe("plans");
  });
});

describe("Stripe setup script parity", () => {
  it("refuses a key from another account before catalog setup", async () => {
    expect(BOTBOUND_STRIPE_ACCOUNT_ID).toBe("acct_1TkyXL8e6If87QKm");
    await expect(
      assertUsageStripeAccount({ accounts: { retrieve: async () => ({ id: "acct_wrong" }) } }),
    ).rejects.toThrow("requires the BotBound Stripe account");
    await expect(
      assertUsageStripeAccount({
        accounts: { retrieve: async () => ({ id: BOTBOUND_STRIPE_ACCOUNT_ID }) },
      }),
    ).resolves.toBeUndefined();
    for (const accountId of BOTBOUND_LLC_STRIPE_ACCOUNT_IDS) {
      await expect(
        assertUsageStripeAccount(
          { accounts: { retrieve: async () => ({ id: accountId }) } },
          { mode: "test", sandboxAccountId: accountId },
        ),
      ).rejects.toThrow("BOTBOUND LLC");
      await expect(
        assertUsageStripeAccount(
          { accounts: { retrieve: async () => ({ id: accountId }) } },
          { mode: "live" },
        ),
      ).rejects.toThrow("BOTBOUND LLC");
    }
  });
  it("uses the catalog version", () => {
    expect(CATALOG_VERSION).toBe(USAGE_CATALOG_VERSION);
  });

  it("prices the base and add-ons exactly as the catalog", () => {
    expect(USAGE_STRIPE_PLAN.base.unit_amount).toBe(USAGE_TIERS.previous.monthlyUsd * 100);
    expect(USAGE_STRIPE_PLANS.standard.base.unit_amount).toBe(USAGE_BASE_USD_MONTHLY * 100);
    expect(USAGE_STRIPE_PLAN.base.metadata.wireline_plan_id).toBe("usage");
    expect(USAGE_STRIPE_PLAN.product.metadata).not.toHaveProperty("wireline_plan_id");
    for (const addon of USAGE_STRIPE_PLAN.addons) {
      expect(addon.unit_amount).toBe(
        USAGE_ADDONS[addon.key as keyof typeof USAGE_ADDONS].usdMonthly * 100,
      );
    }
  });

  it("grants the shared allowance once through a single Stripe meter", () => {
    expect(USAGE_STRIPE_PLAN.meters).toHaveLength(1);
    expect(USAGE_STRIPE_PLAN.meters[0].event_name).toBe(USAGE_WORK_EVENT_NAME);
    expect(USAGE_STRIPE_PLAN.meters[0].tiers).toEqual([
      { up_to: USAGE_TIERS.previous.includedWorkUsd * 100, unit_amount_decimal: "0" },
      { up_to: "inf", unit_amount_decimal: "1" },
    ]);
  });

  it("lets any mix consume the same allowance exactly once", () => {
    const bill = (callMinutes: number, emailsHandled: number, computerMinutes: number) =>
      estimateUsageBill(
        {
          callMinutes,
          emailsHandled,
          computerMinutes,
          numbers: 0,
          emailAddresses: 0,
        },
        "previous",
      );
    for (const args of [
      [48, 0, 0],
      [0, 600, 0],
      [0, 0, 60],
      [24, 100, 20],
    ]) {
      expect(bill(...(args as [number, number, number])).totalUsd).toBe(19);
    }
    expect(bill(48, 600, 60).totalUsd).toBe(43);
    expect(bill(24, 100, 21).totalUsd).toBe(19.2);
    expect(bill(0, 0, 0).includedRemainingUsd).toBe(12);
    expect(
      estimateUsageBill({
        callMinutes: 0,
        emailsHandled: 0,
        computerMinutes: 0,
        numbers: 0,
        emailAddresses: 0,
      }),
    ).toMatchObject({ totalUsd: 24, includedRemainingUsd: 14 });
  });

  it("teaches the live prices and ignores a retired saved offer", () => {
    const facts = currentPricingFacts().join("\n");
    const retired = `${String.fromCharCode(36)}19/month`;
    expect(facts).toContain("Lite is $12/month");
    expect(facts).toContain("Starter is $24/month");
    expect(facts).toContain("Plus is $49/month");
    expect(facts).toContain("SMS is $0.04 per sent segment");
    expect(facts).toContain("unlimited Bots");
    expect(facts).not.toContain(retired);
    expect(isStaleBotBoundPricing(`BotBound Calls plan is ${retired}`)).toBe(true);
    expect(isStaleBotBoundPricing(`The ${retired} BotBound plan is retired`)).toBe(true);
    expect(isStaleBotBoundPricing(`${retired} with $12 shared work`)).toBe(true);
    expect(isStaleBotBoundPricing(`Our membership is ${retired}`)).toBe(false);
    expect(isStaleBotBoundPricing("BotBound support costs $19.99/month")).toBe(false);
    expect(isStaleBotBoundPricing("BotBound setup costs $1900")).toBe(false);
    expect(isStaleBotBoundPricing("A haircut is 19 dollars")).toBe(false);
    expect(
      withoutStaleBotBoundPricing(
        "Our color service is $80. BotBound Starter is $19/month. Ask for the owner.",
      ),
    ).toBe("Our color service is $80.\nAsk for the owner.");
    const migration = readFileSync(
      "drizzle/migrations/0192_usage_tier_standard_default.sql",
      "utf8",
    );
    expect(migration).toContain("ALTER COLUMN tier SET DEFAULT 'standard'");
    expect(migration).not.toMatch(/\bUPDATE\b/);
    expect(migration).not.toContain("wireline_knowledge");
    expect(migration).not.toContain("wireline_personality");
  });

  it("prints exactly the env vars the server reads, names only", () => {
    expect([...new Set(Object.values(USAGE_STRIPE_PLANS).flatMap(envVarNames))].sort()).toEqual(
      [...USAGE_BILLING_ENV_VARS].sort(),
    );
    expect(JSON.stringify(plannedObjects())).not.toMatch(/(?:sk|rk)_(?:test|live)_/);
  });

  it("dry-runs by default and refuses a live key without approval flags", () => {
    expect(applyGuard({ apply: false, live: false, ratesApproved: false, key: "" })).toEqual({
      mode: "dry-run",
    });
    expect(() => applyGuard({ apply: true, live: false, ratesApproved: false, key: "" })).toThrow();
    const live = "sk_live_" + "x".repeat(8);
    const test = "sk_test_" + "x".repeat(8);
    expect(() => applyGuard({ apply: true, live: false, ratesApproved: false, key: live })).toThrow(
      /--live and --rates-approved/,
    );
    expect(() =>
      applyGuard({ apply: true, live: true, ratesApproved: false, key: live }),
    ).toThrow();
    expect(() =>
      applyGuard({ apply: true, live: false, ratesApproved: true, key: live }),
    ).toThrow();
    expect(applyGuard({ apply: true, live: true, ratesApproved: true, key: live })).toEqual({
      mode: "live",
    });
    expect(applyGuard({ apply: true, live: false, ratesApproved: false, key: test })).toEqual({
      mode: "test",
    });
    expect(() => applyGuard({ apply: true, live: true, ratesApproved: true, key: test })).toThrow(
      /test key/,
    );
    expect(() =>
      applyGuard({ apply: true, live: false, ratesApproved: false, key: "pk_test_x" }),
    ).toThrow();
  });
});

describe("shared work plans", () => {
  it("matches all Stripe allowances and prices while preserving the original offer", () => {
    for (const tier of ["previous", "lite", "standard", "plus"] as const) {
      expect(USAGE_STRIPE_PLANS[tier].base.unit_amount).toBe(USAGE_TIERS[tier].monthlyUsd * 100);
      expect(USAGE_STRIPE_PLANS[tier].meters[0].tiers[0].up_to).toBe(
        USAGE_TIERS[tier].includedWorkUsd * 100,
      );
    }
    expect(USAGE_STRIPE_PLANS.plus.addons).toEqual(USAGE_STRIPE_PLAN.addons);
  });
  it("uses Plus once across mixed work and includes its identities once", () => {
    const bill = estimateFromSliders({
      tier: "plus",
      callsPerMonth: 25,
      avgCallMinutes: 4,
      emailsPerMonth: 500,
      computerMinutes: 5,
      number: true,
      emailAddress: true,
    });
    expect(bill).toMatchObject({ fixedUsd: 49, workUsd: 36, includedUsedUsd: 36, totalUsd: 49 });
    const fractional = estimateUsageBill(
      {
        callMinutes: 144.02,
        emailsHandled: 0,
        computerMinutes: 0.025,
        numbers: 0,
        emailAddresses: 0,
      },
      "plus",
    );
    expect(fractional.totalUsd).toBe(49.01);
    expect(
      estimateUsageBill(
        { callMinutes: 0, emailsHandled: 0, computerMinutes: 0, numbers: 1, emailAddresses: 1 },
        "plus",
      ).totalUsd,
    ).toBe(56);
  });
  it("never opens Plus checkout with only Starter configuration", () => {
    const env = Object.fromEntries(
      Object.values(USAGE_PRICE_ENV).map((key) => [key, "price_test"]),
    );
    env.USAGE_BILLING_ENABLED = "true";
    expect(usageCheckoutConfigured(env, "previous")).toBe(true);
    expect(usageCheckoutConfigured(env, "plus")).toBe(false);
  });
});
