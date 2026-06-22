import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { authFetch, safeJson, TRIAL_GATE_EVENT, type TrialGateBlockDetail } from "../lib/api";
import { clearFreshSignupSession, isFreshSignupSession } from "../lib/post-signup-onboarding";

const CHECKPOINT_SHOWN_KEY = "wireline_activation_checkpoint_shown";

type BillingStatus = {
  subscription?: { status?: string | null } | null;
};

function hasUsableSubscription(status: BillingStatus["subscription"]): boolean {
  const value = status?.status;
  return value === "active" || value === "trialing" || value === "past_due";
}

/**
 * New Wireline accounts are paid-activation accounts. This checkpoint opens
 * the plan selector once, immediately after signup, before the user spends
 * time configuring an agent they cannot deploy yet. It is intentionally
 * silent for existing customers and Stripe return URLs.
 */
export default function ActivationCheckpoint() {
  const location = useLocation();

  useEffect(() => {
    if (!isFreshSignupSession()) return;

    const params = new URLSearchParams(location.search);
    const billing = params.get("billing");
    if (billing === "success" || billing === "canceled") {
      // Stripe has handed the customer back to Wireline. Do not compete with
      // that return state by immediately reopening plan selection while the
      // webhook is still reconciling the subscription.
      try {
        sessionStorage.setItem(CHECKPOINT_SHOWN_KEY, "1");
      } catch {
        // ignore
      }
      return;
    }

    try {
      if (sessionStorage.getItem(CHECKPOINT_SHOWN_KEY) === "1") return;
    } catch {
      // Private browsing can reject storage; the activation gate still works.
    }

    let cancelled = false;

    const run = async () => {
      try {
        const response = await authFetch("/api/billing/status");
        const payload = await safeJson<BillingStatus>(response);
        if (cancelled || !response.ok) return;
        const status = payload as BillingStatus;

        if (hasUsableSubscription(status.subscription)) {
          clearFreshSignupSession();
          return;
        }

        try {
          sessionStorage.setItem(CHECKPOINT_SHOWN_KEY, "1");
        } catch {
          // ignore
        }

        const detail: TrialGateBlockDetail = {
          code: "ACTIVATION_REQUIRED",
          error: "Choose a plan before creating or deploying an assistant.",
        };
        window.dispatchEvent(new CustomEvent<TrialGateBlockDetail>(TRIAL_GATE_EVENT, { detail }));
      } catch {
        // The explicit server-side gate remains the source of truth if this
        // optional client-side checkpoint cannot load.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.search]);

  return null;
}
