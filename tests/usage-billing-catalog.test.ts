import { describe, expect, it } from "vitest";
import {
  USAGE_ADDONS,
  USAGE_BASE_USD_MONTHLY,
  USAGE_CATALOG_VERSION,
  USAGE_METERS,
  USAGE_NEVER_PAY_FOR,
  crossedAlertThresholds,
  estimateUsageBill,
  marginalUnitUsd,
  minimumMonthlyCapUsd,
  priceMeter,
  type UsageMeterKey,
} from "../src/lib/usage-billing-catalog";
import {
  USAGE_BILLING_ENV_VARS,
  USAGE_METER_EVENT_ENV,
  USAGE_PRICE_ENV,
  usageBillingEnabled,
  usageCheckoutConfigured,
  usageMeterEventName,
  usagePriceIds,
} from "../src/lib/usage-billing-config";
import { billingModelFromPayload } from "../src/lib/billing-model";
import {
  USAGE_RATE_LINES,
  estimateFromSliders,
} from "../src/components/usage-billing/UsagePricingPanel";
import {
  CATALOG_VERSION,
  assertUsageStripeAccount,
  BOTBOUND_STRIPE_ACCOUNT_ID,
  USAGE_STRIPE_PLAN,
  applyGuard,
  envVarNames,
  plannedObjects,
} from "../scripts/stripe-usage-billing-setup.mjs";

describe("usage rate card", () => {
  it("prices call minutes with included units, then graduated tiers", () => {
    expect(priceMeter("call_minutes", 0)).toBe(0);
    expect(priceMeter("call_minutes", 60)).toBe(0);
    expect(priceMeter("call_minutes", 61)).toBe(0.25);
    expect(priceMeter("call_minutes", 560)).toBe(125);
    expect(priceMeter("call_minutes", 2_060)).toBe(125 + 330);
    expect(priceMeter("call_minutes", 2_061)).toBe(455.2);
    expect(priceMeter("call_minutes", -5)).toBe(0);
    expect(priceMeter("call_minutes", Number.NaN)).toBe(0);
  });

  it("prices emails and computer minutes after their included units", () => {
    expect(priceMeter("emails_handled", 100)).toBe(0);
    expect(priceMeter("emails_handled", 300)).toBe(4);
    expect(priceMeter("computer_minutes", 15)).toBe(0);
    expect(priceMeter("computer_minutes", 20)).toBe(0.75);
  });

  it("reproduces the example bills in the design doc", () => {
    const solo = estimateUsageBill({
      callMinutes: 180,
      emailsHandled: 40,
      computerMinutes: 5,
      numbers: 1,
      emailAddresses: 0,
    });
    const salon = estimateUsageBill({
      callMinutes: 1_000,
      emailsHandled: 300,
      computerMinutes: 20,
      numbers: 1,
      emailAddresses: 1,
    });
    const multiLocation = estimateUsageBill({
      callMinutes: 10_000,
      emailsHandled: 2_000,
      computerMinutes: 120,
      numbers: 3,
      emailAddresses: 3,
    });
    expect(solo.totalUsd).toBe(52);
    expect(salon.totalUsd).toBe(252.55);
    expect(multiLocation.totalUsd).toBe(2_136.75);
    expect(solo.lines.map((line) => line.key)).toEqual([
      "base",
      "call_minutes",
      "emails_handled",
      "computer_minutes",
      "number",
    ]);
    expect(salon.fixedUsd).toBe(26);
  });

  it("prices the next unit at the tier the period total is in", () => {
    expect(marginalUnitUsd("call_minutes", 10)).toBe(0);
    expect(marginalUnitUsd("call_minutes", 60)).toBe(0.25);
    expect(marginalUnitUsd("call_minutes", 600)).toBe(0.22);
    expect(marginalUnitUsd("call_minutes", 5_000)).toBe(0.2);
  });

  it("keeps the minimum cap above fixed charges and alerts at 50/80/100", () => {
    expect(minimumMonthlyCapUsd({ numbers: 0, emailAddresses: 0 })).toBe(24);
    expect(minimumMonthlyCapUsd({ numbers: 2, emailAddresses: 1 })).toBe(34);
    expect(crossedAlertThresholds(0, 49)).toEqual([]);
    expect(crossedAlertThresholds(0, 85)).toEqual([50, 80]);
    expect(crossedAlertThresholds(80, 100)).toEqual([100]);
    expect(USAGE_NEVER_PAY_FOR).toEqual(["Bots", "Roles", "Seats", "Summaries"]);
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
    ).toBe(52);
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
    expect(copy).toContain("60 included, then $0.25/min");
    expect(copy).toContain("$3/month, only if your Bots take calls");
    expect(copy).toContain("Gmail and Outlook connect at no extra cost");
    expect(copy).not.toMatch(/free|text|sms|—|wireline/i);
  });
});

describe("usage billing flag and payload", () => {
  it("stays off unless USAGE_BILLING_ENABLED is exactly true", () => {
    expect(usageBillingEnabled({})).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: "1" })).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: "yes" })).toBe(false);
    expect(usageBillingEnabled({ USAGE_BILLING_ENABLED: " TRUE " })).toBe(true);
  });

  it("opens checkout only with the flag and all six offered prices", () => {
    const prices = {
      [USAGE_PRICE_ENV.base]: "price_base",
      [USAGE_PRICE_ENV.call_minutes]: "price_calls",
      [USAGE_PRICE_ENV.emails_handled]: "price_emails",
      [USAGE_PRICE_ENV.computer_minutes]: "price_computer",
      [USAGE_PRICE_ENV.number]: "price_number",
      [USAGE_PRICE_ENV.email_address]: "price_mailbox",
    };
    expect(usageCheckoutConfigured(prices)).toBe(false);
    expect(usageCheckoutConfigured({ ...prices, USAGE_BILLING_ENABLED: "true" })).toBe(true);
    const { [USAGE_PRICE_ENV.computer_minutes]: _omitted, ...missingOne } = prices;
    expect(usageCheckoutConfigured({ ...missingOne, USAGE_BILLING_ENABLED: "true" })).toBe(false);
    expect([...usagePriceIds(prices)].sort()).toEqual(
      [
        "price_base",
        "price_calls",
        "price_computer",
        "price_emails",
        "price_number",
        "price_mailbox",
      ].sort(),
    );
  });

  it("defaults meter event names to the catalog and allows an override", () => {
    expect(usageMeterEventName("call_minutes", {})).toBe("botbound_call_minutes");
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
    await expect(
      assertUsageStripeAccount({ accounts: { retrieve: async () => ({ id: "acct_wrong" }) } }),
    ).rejects.toThrow("requires the BotBound Stripe account");
    await expect(
      assertUsageStripeAccount({
        accounts: { retrieve: async () => ({ id: BOTBOUND_STRIPE_ACCOUNT_ID }) },
      }),
    ).resolves.toBeUndefined();
  });
  it("uses the catalog version", () => {
    expect(CATALOG_VERSION).toBe(USAGE_CATALOG_VERSION);
  });

  it("prices the base and add-ons exactly as the catalog", () => {
    expect(USAGE_STRIPE_PLAN.base.unit_amount).toBe(USAGE_BASE_USD_MONTHLY * 100);
    expect(USAGE_STRIPE_PLAN.base.metadata.wireline_plan_id).toBe("usage");
    expect(USAGE_STRIPE_PLAN.product.metadata).not.toHaveProperty("wireline_plan_id");
    for (const addon of USAGE_STRIPE_PLAN.addons) {
      expect(addon.unit_amount).toBe(
        USAGE_ADDONS[addon.key as keyof typeof USAGE_ADDONS].usdMonthly * 100,
      );
    }
  });

  it("encodes included units as a $0 first tier, then the catalog tiers", () => {
    for (const meter of USAGE_STRIPE_PLAN.meters) {
      const rate = USAGE_METERS[meter.key as UsageMeterKey];
      expect(meter.event_name).toBe(rate.defaultEventName);
      const expected = [
        { up_to: rate.included, unit_amount_decimal: "0" },
        ...rate.tiers.map((tier) => ({
          up_to: tier.upTo === null ? "inf" : rate.included + tier.upTo,
          unit_amount_decimal: String(Math.round(tier.unitUsd * 100)),
        })),
      ];
      expect(meter.tiers).toEqual(expected);
    }
  });

  it("prints exactly the env vars the server reads, names only", () => {
    expect([...envVarNames()].sort()).toEqual([...USAGE_BILLING_ENV_VARS].sort());
    expect(JSON.stringify(plannedObjects())).not.toMatch(/sk_|rk_/);
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
