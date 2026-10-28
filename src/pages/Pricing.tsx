import { useState } from "react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import {
  DEFAULT_ACTIVATION_PLAN_ID,
  getStoredSignupIntent,
  parseSignupIntent,
} from "../lib/signup-intent";
import { usePaidPlanAvailability } from "../hooks/usePaidPlanAvailability";
import UsagePricingPanel from "../components/usage-billing/UsagePricingPanel";
import { type UsageTierId } from "../lib/usage-billing-catalog";

/** Public shared-work plans, followed by one estimator and the common rates. */
function UsagePricing({ availableTiers }: { availableTiers: readonly UsageTierId[] }) {
  return (
    <MarketingPageFrame className="wl-pricing-page">
      <PageMeta
        title="Pricing | Shared Work Allowance | BotBound"
        description="Monthly plans for calls, SMS, email and Computer. Compare included numbers, email addresses and shared work."
        path="/pricing"
      />
      <section id="plans" className="marketing-section marketing-section--screen">
        <div className="wl-public-rail mx-auto max-w-5xl">
          <div className="mx-auto mb-6 max-w-3xl text-center">
            <h1 className="marketing-hero-title mx-auto">Room to Do More.</h1>
            <p className="marketing-hero-lead mx-auto mt-4">
              Calls, SMS, email, and Computer. One shared allowance.
            </p>
          </div>
          <UsagePricingPanel availableTiers={availableTiers} />
        </div>
      </section>
    </MarketingPageFrame>
  );
}

export default function Pricing() {
  const [billingInterval] = useState<"month" | "year">(
    () =>
      parseSignupIntent(window.location.search)?.preferredBillingInterval ??
      getStoredSignupIntent()?.preferredBillingInterval ??
      "month",
  );
  const [selectedPlanId] = useState<string>(
    () =>
      parseSignupIntent(window.location.search)?.preferredPlanId ??
      getStoredSignupIntent()?.preferredPlanId ??
      DEFAULT_ACTIVATION_PLAN_ID,
  );
  const { usageTiers } = usePaidPlanAvailability({
    interval: billingInterval,
    planId: selectedPlanId,
  });
  return <UsagePricing availableTiers={usageTiers} />;
}
