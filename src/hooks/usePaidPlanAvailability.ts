import { useEffect, useState } from "react";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { isSelfServeCheckoutAvailable } from "../lib/checkout-availability";
import type { BillingPlansResponse } from "../types/api-billing";
import { billingModelFromPayload } from "../lib/billing-model";

export function usePaidPlanAvailability({
  interval = "month",
  enabled = true,
  planId,
}: {
  interval?: "month" | "year";
  enabled?: boolean;
  planId?: string;
} = {}) {
  const [plans, setPlans] = useState<BillingPlansResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setStatus("loading");
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/billing/plans", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Plan availability could not be loaded.");
        const payload = (await response.json()) as BillingPlansResponse;
        if (!payload || !Array.isArray(payload.plans)) {
          throw new Error("Plan availability is incomplete.");
        }
        if (active) {
          setPlans(payload);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) setStatus("unavailable");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [enabled]);

  const canActivate = (id: string) => {
    const plan = plans?.plans.find((candidate) => candidate?.id === id);
    return (
      status === "ready" &&
      isSelfServeCheckoutAvailable(plans) &&
      plan?.contact_sales === false &&
      (interval === "year" ? plan.annual_configured : plan.configured) === true
    );
  };
  const available = planId
    ? canActivate(planId)
    : STRIPE_PLANS.some(
        (plan) => plan.public !== false && plan.price_usd_monthly > 0 && canActivate(plan.id),
      );
  const needsEmailSetupReview = (id: string) => {
    const livePlan = plans?.plans.find((plan) => plan?.id === id);
    const catalogPlan = STRIPE_PLANS.find((plan) => plan.id === id);
    return (
      status === "ready" &&
      isSelfServeCheckoutAvailable(plans) &&
      livePlan?.contact_sales === true &&
      catalogPlan?.channels.includes("email") === true &&
      catalogPlan?.channels.includes("sms") === false
    );
  };
  const emailSetupReview = planId ? needsEmailSetupReview(planId) : false;
  const notice =
    status === "loading"
      ? "Checking activation availability…"
      : status === "unavailable"
        ? "Plan availability could not be checked. Refresh and try again."
        : available
          ? "Choose a plan and check out. Cancel anytime."
          : emailSetupReview
            ? "This email plan needs a setup review before checkout."
            : "Checkout is unavailable right now. Try again shortly.";

  // Read from the same /api/billing/plans payload, so no second request.
  const billingModel = status === "ready" ? billingModelFromPayload(plans) : "plans";

  return {
    usageTiers: plans?.usage_tiers ?? [],
    status,
    available,
    billingModel,
    canActivate,
    emailSetupReview,
    needsEmailSetupReview,
    notice,
  };
}
