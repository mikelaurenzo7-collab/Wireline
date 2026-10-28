import { useState } from "react";
import { Link } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import {
  DEFAULT_ACTIVATION_PLAN_ID,
  getStoredSignupIntent,
  parseSignupIntent,
} from "../lib/signup-intent";
import { usePaidPlanAvailability } from "../hooks/usePaidPlanAvailability";
import UsagePricingPanel from "../components/usage-billing/UsagePricingPanel";
import { PUBLIC_USAGE_TIERS, type UsageTierId } from "../lib/usage-billing-catalog";

/** Public shared-work plans, followed by one estimator and the common rates. */
function UsagePricing({
  availableTiers,
  status,
}: {
  availableTiers: readonly UsageTierId[];
  status: "loading" | "ready" | "unavailable";
}) {
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
          {status !== "ready" || availableTiers.length === 0 ? (
            <p role="status" className="mb-6 text-center text-sm text-muted-foreground">
              {status === "loading"
                ? "Showing plan details while we check availability. Checkout is not yet confirmed."
                : status === "unavailable"
                  ? "Plan availability could not be checked. Prices are shown for reference; refresh to try again."
                  : "Plans are unavailable right now. Please check back shortly."}
            </p>
          ) : null}
          <UsagePricingPanel availableTiers={availableTiers} />
          <details className="mx-auto mt-8 max-w-3xl text-sm leading-6 text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground wl-focus-ring-halo">
              How long can a call last?
            </summary>
            <p className="mt-2">
              Live calls can run for up to 60 minutes per session, unless a shorter limit is
              configured. Your available work and spending limit can shorten the reserved duration.
              Reaching a session or reserved limit ends the call.
            </p>
          </details>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-6 text-muted-foreground">
            Cancel anytime; cancellation takes effect at the end of your billing period. Request a
            refund within 30 days of your first paid invoice; we verify the account and transaction
            before confirming. Contact{" "}
            <a
              href="mailto:support@botbound.app"
              className="underline underline-offset-4 wl-focus-ring-halo"
            >
              support@botbound.app
            </a>
            . Usage purchases, third-party fees, and later invoices are excluded.{" "}
            <Link to="/terms" className="underline underline-offset-4 wl-focus-ring-halo">
              See Terms
            </Link>
            .
          </p>
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
  const { usageTiers, status } = usePaidPlanAvailability({
    interval: billingInterval,
    planId: selectedPlanId,
  });
  return (
    <UsagePricing
      availableTiers={status === "ready" ? usageTiers : PUBLIC_USAGE_TIERS}
      status={status}
    />
  );
}
