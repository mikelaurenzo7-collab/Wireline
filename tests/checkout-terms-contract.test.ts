import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHECKOUT_TERMS_TEXT } from "../src/components/billing/CheckoutTermsNote";
import { USAGE_SPEND_ALERT_THRESHOLDS } from "../src/lib/usage-billing-catalog";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("cancellation and refund terms at checkout", () => {
  it("states the same promise as /pricing and the Terms", () => {
    const pricing = flat(read("src/pages/Pricing.tsx"));
    for (const phrase of [
      "cancellation takes effect at the end of your billing period",
      "Request a refund within 30 days of your first paid invoice",
      "Usage purchases, third-party fees, and later invoices are excluded",
    ]) {
      expect(CHECKOUT_TERMS_TEXT).toContain(phrase);
      expect(pricing).toContain(phrase);
    }
    const terms = flat(read("src/components/LegalPage.tsx"));
    expect(terms).toContain("cancellation takes effect at the end of the current billing period");
    expect(terms).toContain("The 30 day window starts on the invoice date");
  });

  it("appears wherever the app starts a plan checkout", () => {
    expect(read("src/components/usage-billing/UsageSpendCard.tsx")).toMatch(
      /Review Plan\s*<\/Button>\s*<CheckoutTermsNote \/>/,
    );
    expect(read("src/components/TrialGateModal.tsx")).toContain(
      "{showPlanCheckout && <CheckoutTermsNote",
    );
    expect(read("src/components/StripeBillingCard.tsx")).toContain(
      '{!hasPlanAccess && billingModel !== "usage" ? <CheckoutTermsNote /> : null}',
    );
  });
});

describe("usage warning before the limit", () => {
  it("turns the meter to a warning at the last alert email before 100%", () => {
    const card = read("src/components/usage-billing/UsageSpendCard.tsx");
    expect(Math.max(...USAGE_SPEND_ALERT_THRESHOLDS.filter((pct) => pct < 100))).toBe(80);
    expect(card).toContain(
      "const USAGE_WARNING_PCT = Math.max(...USAGE_SPEND_ALERT_THRESHOLDS.filter((pct) => pct < 100));",
    );
    expect(card).toContain(
      'data-usage-level={state.at_cap ? "at_cap" : nearCap ? "near_cap" : "ok"}',
    );
    expect(card).toContain("Raise your limit below to keep them working.");
  });
});
