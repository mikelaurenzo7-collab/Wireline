/* eslint-disable @typescript-eslint/no-explicit-any -- billing and analytics provider errors remain loosely typed. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  CreditCard,
  Loader2,
  Shield,
  AlertTriangle,
  ExternalLink,
  Building2,
  Plus,
} from "lucide-react";
import { authFetch } from "../lib/api";
import BillingIntervalControl from "./BillingIntervalControl";
import ChannelPlanPicker, { hasChannelPlanDetails } from "./ChannelPlanPicker";
import CapacityUpgradeCard from "./CapacityUpgradeCard";
import { STRIPE_PLANS, isUsagePlanId, planById } from "../lib/plan-catalog";
import { billingModelFromPayload, type BillingModel } from "../lib/billing-model";
import { getPlanDisplayLabel } from "../lib/plan-display";
import { safeDate, formatDate } from "../lib/safe-date";
import UsageMeter from "./UsageMeter";
import { ShadButton } from "./ui/shadcn/ShadButton";
import {
  billingIntervalFromIntent,
  DEFAULT_ACTIVATION_PLAN_ID,
  getStoredSignupIntent,
  recommendedPlanFromIntent,
  persistSignupIntent,
  mergeSignupIntent,
  type SignupPlanId,
} from "../lib/signup-intent";
import { BRAND } from "../constants/brand-colors";
import { emitProductEvent } from "../lib/product-event-client";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_PRESETS_USD,
} from "../lib/conversation-balance";
import { Chip } from "./atoms";

import type {
  BillingPlansResponse,
  BillingStatusResponse,
  BillingSubscriptionState,
  ClientPlan,
} from "../types/api";

const PLAN_ICONS: Record<string, any> = {
  team: Building2,
  business: CreditCard,
  enterprise: Building2,
};

const PLAN_ACCENTS: Record<string, string> = {
  team: BRAND.colors.primary,
  business: BRAND.colors.primary,
  enterprise: BRAND.colors.primary,
};

const CHECKOUT_RELEASE_MESSAGE = "New purchases are temporarily paused.";

export type CheckoutAvailability = "loading" | "available" | "paused" | "unavailable";

type StripeBillingCardProps = {
  /**
   * Some account surfaces do not load the customer's actual balance. Keep the
   * generic top-up card there, but let BillingSettings own the single canonical
   * balance + top-up surface when it already has the balance ledger loaded.
   */
  showBalanceTopUp?: boolean;
  /** Billing Settings shows the canonical balance beside its own top-up actions. */
  showUsageBalance?: boolean;
  /**
   * The Stripe/PCI trust row reads as a page footer. Pages that render more
   * cards after this component suppress it here and place their own footer at
   * the true end of the page, so the legal row never lands mid-scroll.
   */
  showTrustFooter?: boolean;
  /**
   * BillingSettings holds this false while it reconciles a Stripe Checkout
   * return. That prevents an older status request from racing the entitlement
   * sync and overwriting the reconciled state in this card.
   */
  billingReady?: boolean;
  /** Share the verified checkout gate with the page's canonical balance controls. */
  onCheckoutAvailabilityChange?: (availability: CheckoutAvailability) => void;
  /** Coordinate recovery with a page that also owns billing status/balance. */
  refreshKey?: number;
  onRetry?: () => void;
};

export default function StripeBillingCard({
  showBalanceTopUp = true,
  showUsageBalance = true,
  showTrustFooter = true,
  billingReady = true,
  onCheckoutAvailabilityChange,
  refreshKey = 0,
  onRetry,
}: StripeBillingCardProps = {}) {
  const [plans, setPlans] = useState<ClientPlan[]>([]);
  const [sub, setSub] = useState<BillingSubscriptionState | null>(null);
  const [agentCount, setAgentCount] = useState<number>(0);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [selfServeBillingReleased, setSelfServeBillingReleased] = useState(false);
  const [signupPlanInterest, setSignupPlanInterest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creditBusy, setCreditBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">(() => {
    try {
      return billingIntervalFromIntent(getStoredSignupIntent(), window.location.search);
    } catch {
      /* ignore */
    }
    return "month";
  });
  const [billingModel, setBillingModel] = useState<BillingModel>("plans");

  const portalPendingRef = useRef(false);
  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const isCurrent = () => generation === refreshGeneration.current;
    setLoading(true);
    setError(null);
    setSelfServeBillingReleased(false);
    onCheckoutAvailabilityChange?.("loading");
    try {
      const [statusRaw, plansRaw] = await Promise.all([
        authFetch("/api/billing/status"),
        authFetch("/api/billing/plans"),
      ]);
      if (!statusRaw.ok || !plansRaw.ok) {
        throw new Error("Billing details could not be loaded. Refresh and try again.");
      }
      const statusRes = (await statusRaw.json().catch(() => null)) as BillingStatusResponse | null;
      const plansRes = (await plansRaw.json().catch(() => null)) as BillingPlansResponse | null;
      if (!statusRes || !plansRes || !Array.isArray(plansRes.plans)) {
        throw new Error("Billing details could not be loaded. Refresh and try again.");
      }
      if (!isCurrent()) return;
      const livePlans = plansRes.plans;
      const configured =
        statusRes.stripe_configured === true && plansRes.stripe_configured === true;
      setStripeConfigured(configured);
      setBillingModel(billingModelFromPayload(plansRes));
      const checkoutAvailable =
        configured &&
        plansRes.checkout_available === true &&
        livePlans.some(
          (plan) =>
            plan.price_usd_monthly > 0 &&
            (plan.configured === true || plan.annual_configured === true),
        );
      setSelfServeBillingReleased(checkoutAvailable);
      onCheckoutAvailabilityChange?.(checkoutAvailable ? "available" : "paused");
      setSub(statusRes.subscription || null);
      setAgentCount(statusRes.agent_count ?? 0);
      const urlPlan = new URLSearchParams(window.location.search).get("plan");
      const explicitPaidPlan =
        urlPlan &&
        livePlans.some(
          (plan) =>
            plan.id === urlPlan && (plan.catalog_family === "channels" || isUsagePlanId(plan.id)),
        )
          ? urlPlan
          : null;
      const storedIntent = getStoredSignupIntent();
      setSignupPlanInterest(
        explicitPaidPlan ||
          statusRes.signup_intent?.plan_id ||
          (storedIntent ? recommendedPlanFromIntent(storedIntent) : null),
      );
      setPlans(livePlans);
    } catch (e: any) {
      if (!isCurrent()) return;
      onCheckoutAvailabilityChange?.("unavailable");
      setError(e?.message || "Load failed");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [onCheckoutAvailabilityChange]);

  useEffect(() => {
    if (billingReady) {
      void refresh();
    } else {
      setLoading(true);
      setSelfServeBillingReleased(false);
      onCheckoutAvailabilityChange?.("loading");
    }
    // A checkout reconciliation, new refresh, or unmount retires earlier reads.
    return () => {
      refreshGeneration.current += 1;
    };
  }, [billingReady, refresh, onCheckoutAvailabilityChange, refreshKey]);

  const startCheckout = async (planId: string, interval: "month" | "year" = billingInterval) => {
    const hasActive =
      !!sub?.has_subscription &&
      (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");
    if (hasActive) return openPortal();

    const selectedPlan = plans.find((plan) => plan.id === planId);
    const selectedIntervalReady =
      interval === "year"
        ? selectedPlan?.annual_configured === true
        : selectedPlan?.configured === true;
    if (
      !billingReady ||
      !selfServeBillingReleased ||
      !selectedIntervalReady ||
      selectedPlan?.checkout_availability !== "available" ||
      selectedPlan.catalog_family !== "channels" ||
      selectedPlan.channels?.includes("sms")
    ) {
      setError(CHECKOUT_RELEASE_MESSAGE);
      return;
    }

    setBusy(planId);
    setError(null);
    try {
      const r = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, interval }),
      });
      const d = await r.json();
      if (r.status === 409 && d?.code === "ALREADY_SUBSCRIBED") {
        setBusy(null);
        return openPortal();
      }
      if (!r.ok || !d.url) throw new Error(d.error || "Checkout failed");

      if (typeof window !== "undefined") {
        try {
          const checkoutValue =
            interval === "year"
              ? (selectedPlan?.price_usd_annual ?? 0)
              : (selectedPlan?.price_usd_monthly ?? 0);
          if (typeof (window as any).fbq === "function") {
            (window as any).fbq("track", "InitiateCheckout", {
              content_category: "Subscription",
              content_ids: [planId],
              value: checkoutValue,
              currency: "USD",
            });
          }
          if (typeof (window as any).plausible === "function") {
            (window as any).plausible("CheckoutInitiated", {
              props: { plan: planId, interval },
            });
          }
          if (typeof (window as any).dataLayer?.push === "function") {
            (window as any).dataLayer.push({ event: "checkout_initiated", planId, interval });
          }
        } catch (err) {
          console.error("[wireline:analytics] Failed to log checkout initiation:", err);
        }
      }

      window.location.href = d.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed");
      setBusy(null);
    }
  };

  const startCreditCheckout = async (amountUsd: number) => {
    if (!billingReady || !selfServeBillingReleased) {
      setError(CHECKOUT_RELEASE_MESSAGE);
      return;
    }
    const hasPaidSubscription =
      !!sub?.has_subscription && (sub.status === "active" || sub.status === "trialing");
    if (!hasPaidSubscription) {
      setError("Choose a live plan before adding Runtime Balance.");
      return;
    }
    setCreditBusy(amountUsd);
    setError(null);
    try {
      emitProductEvent({
        event: "conversation_balance_checkout_started",
        metadata: { amount_usd: amountUsd, source: "stripe_billing_card" },
      });
      const r = await authFetch("/api/conversation-balance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amountUsd }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Could not start credit checkout");
      window.location.href = d.url;
    } catch (e: any) {
      setError(e?.message || "Could not start credit checkout");
      setCreditBusy(null);
    }
  };

  const openPortal = async () => {
    // Both portal entry points share ownership, including clicks before rerender.
    if (portalPendingRef.current) return;
    portalPendingRef.current = true;
    setBusy("portal");
    setError(null);
    try {
      const r = await authFetch("/api/billing/portal", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Portal failed");
      window.location.href = d.url;
    } catch (e: any) {
      portalPendingRef.current = false;
      setError(e?.message || "Portal failed");
      setBusy(null);
    }
  };

  if (loading || !billingReady) {
    return (
      <div className="wl-panel flex items-center gap-4 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-[length:var(--wireline-typography-body-size)] text-muted-foreground">
          Loading your plan and balance...
        </span>
      </div>
    );
  }

  if (error && !stripeConfigured) {
    return (
      <div className="wl-paper rounded-md border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] p-8 md:p-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 border border-[var(--wireline-color-feedback-error-border)] bg-[color:color-mix(in_srgb,var(--wireline-color-status-error)_14%,transparent)]">
            <AlertTriangle className="w-5 h-5 text-[var(--wireline-color-status-error)]" />
          </div>
          <h3 className="wl-display-mark text-2xl text-foreground">Billing Unavailable</h3>
        </div>
        <p className="max-w-2xl text-[length:var(--wireline-typography-caption-size)] text-foreground/75 leading-relaxed">
          {error}
        </p>
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (onRetry ? onRetry() : void refresh())}
        >
          Retry
        </ShadButton>
      </div>
    );
  }

  if (!stripeConfigured) {
    return (
      <div className="wl-paper rounded-md border border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] p-8 md:p-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 border border-[var(--wireline-color-feedback-warning-border)] bg-[color:color-mix(in_srgb,var(--wireline-color-status-warning)_14%,transparent)]">
            <AlertTriangle className="w-5 h-5 text-[var(--wireline-color-status-warning)]" />
          </div>
          <h3 className="wl-display-mark text-2xl text-foreground">Billing Is Unavailable</h3>
        </div>
        <p className="max-w-2xl text-[length:var(--wireline-typography-caption-size)] text-foreground/75 leading-relaxed">
          Online billing is unavailable right now. Your saved Bots are still here. Please try again
          later or{" "}
          <Link to="/contact" className="text-brand hover:underline">
            talk to BotBound
          </Link>{" "}
          about a plan today.
        </p>
      </div>
    );
  }

  const hasActiveSubscription =
    !!sub?.has_subscription &&
    (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");
  const hasGrantedPlanAccess =
    !!sub &&
    !sub.has_subscription &&
    !!sub.plan &&
    sub.plan !== "personal" &&
    (sub.status === "active" || sub.status === "trialing");
  const hasPlanAccess = hasActiveSubscription || hasGrantedPlanAccess;
  const canAddBalance =
    !isUsagePlanId(sub?.plan) &&
    selfServeBillingReleased &&
    !!sub?.has_subscription &&
    (sub.status === "active" || sub.status === "trialing");

  return (
    <div className="space-y-5">
      {!selfServeBillingReleased ? (
        <div
          role="status"
          className="rounded-md border border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] p-4 flex items-start gap-3"
        >
          <AlertTriangle className="mt-0.5 w-4 h-4 text-[var(--wireline-color-status-warning)] shrink-0" />
          <p className="text-[length:var(--wireline-typography-caption-size)] leading-relaxed text-foreground/75">
            {CHECKOUT_RELEASE_MESSAGE}
            {sub?.has_subscription ? " You can still manage your subscription below." : ""}
          </p>
        </div>
      ) : null}
      {sub?.has_subscription ? (
        <ActiveSubCard
          sub={sub}
          agentCount={agentCount}
          busy={busy === "portal"}
          onPortal={openPortal}
        />
      ) : hasGrantedPlanAccess ? (
        <GrantedPlanAccessCard
          sub={sub}
          agentCount={agentCount}
          busy={busy === "portal"}
          onPortal={openPortal}
        />
      ) : null}
      {hasActiveSubscription && !isUsagePlanId(sub?.plan) ? (
        <UsageMeter
          onUpgrade={openPortal}
          upgradePending={busy === "portal"}
          showBalance={showUsageBalance}
        />
      ) : null}
      {hasActiveSubscription &&
      sub?.status === "active" &&
      sub.plan &&
      plans.some((plan) => plan.id === sub.plan && plan.catalog_family === "channels") ? (
        <CapacityUpgradeCard
          key={sub.plan}
          currentPlanId={sub.plan}
          plans={plans}
          cancelAtPeriodEnd={sub.cancel_at_period_end === true}
          refreshKey={refreshKey}
          onRefreshBilling={() => (onRetry ? onRetry() : void refresh())}
        />
      ) : null}
      {hasGrantedPlanAccess ? <UsageMeter showBalance={showUsageBalance} /> : null}
      {showBalanceTopUp ? (
        <>{canAddBalance && <CreditTopUpCard busy={creditBusy} onBuy={startCreditCheckout} />}</>
      ) : null}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] p-4 flex items-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-[var(--wireline-color-status-error)] shrink-0" />
          <p className="text-[length:var(--wireline-typography-overline-size)] text-[var(--wireline-color-status-error)]">
            {error}
          </p>
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (onRetry ? onRetry() : void refresh())}
          >
            Retry
          </ShadButton>
        </div>
      )}
      {!hasPlanAccess && billingModel !== "usage" ? (
        <PlanPicker
          plans={plans}
          signupPlanInterest={signupPlanInterest}
          busy={busy}
          billingInterval={billingInterval}
          checkoutReleased={selfServeBillingReleased}
          onBillingIntervalChange={setBillingInterval}
          onSelectPlan={startCheckout}
        />
      ) : null}
      {showTrustFooter ? <BillingTrustFooter /> : null}
    </div>
  );
}

/** Shared payment-security + legal row for billing surfaces. */
export function BillingTrustFooter() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[length:var(--wireline-typography-overline-size)] text-muted-foreground uppercase tracking-[0.2em]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Shield className="w-3 h-3" aria-hidden="true" />
        {/* Each phrase stays whole: the pair wraps as two lines, never a stray word. */}
        <span className="whitespace-nowrap">Encrypted payments</span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">Cancel anytime</span>
      </div>
      <div className="flex items-center gap-3">
        <a href="/privacy" className="hover:text-foreground transition-colors">
          Privacy
        </a>
        <span>·</span>
        <a href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </a>
      </div>
    </div>
  );
}

function CreditTopUpCard({
  busy,
  onBuy,
}: {
  busy: number | null;
  onBuy: (amountUsd: number) => void;
}) {
  return (
    <div className="rounded-md wl-panel border border-border p-8 md:p-10 space-y-5">
      <div className="border-b border-border pb-5">
        <h3 className="font-semibold tracking-[-.02em] text-2xl text-foreground">
          Add {CONVERSATION_BALANCE_COPY.title}
        </h3>
        <p className="text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground mt-1.5 max-w-lg">
          Top up when you need more. Scale up for steady use.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {CONVERSATION_BALANCE_PRESETS_USD.map((a) => (
          <ShadButton
            key={a}
            type="button"
            disableAnimations
            variant="outline"
            onClick={() => onBuy(a)}
            disabled={busy !== null}
            className="inline-flex gap-2 px-6 py-3 rounded-md text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] hover-premium-glow shadow-premium-button border-brand/40 text-brand"
          >
            {busy === a ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            ${a}
          </ShadButton>
        ))}
        <span className="text-[length:var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground flex items-center gap-2">
          <Shield className="w-3 h-3" />
          Applied to live-work usage
        </span>
      </div>
    </div>
  );
}

function PlanPicker({
  plans,
  signupPlanInterest,
  busy,
  billingInterval,
  checkoutReleased,
  onBillingIntervalChange,
  onSelectPlan,
}: {
  plans: ClientPlan[];
  signupPlanInterest: string | null;
  busy: string | null;
  billingInterval: "month" | "year";
  checkoutReleased: boolean;
  onBillingIntervalChange: (interval: "month" | "year") => void;
  onSelectPlan: (planId: string, interval: "month" | "year") => void;
}) {
  const availablePlans = plans
    .filter((plan) => plan.catalog_family === "channels" && plan.id !== "personal")
    .filter(hasChannelPlanDetails)
    .filter((plan) => !plan.channels.includes("sms"));
  const displayPlans = availablePlans.length
    ? availablePlans
    : STRIPE_PLANS.filter(
        (plan) =>
          plan.catalogFamily === "channels" &&
          plan.id !== "personal" &&
          !plan.channels.includes("sms"),
      );
  const personalPlan =
    plans.find((plan) => plan.id === "personal") ??
    STRIPE_PLANS.find((plan) => plan.id === "personal");
  const [selectedId, setSelectedId] = useState(() =>
    displayPlans.some((plan) => plan.id === signupPlanInterest)
      ? signupPlanInterest!
      : DEFAULT_ACTIVATION_PLAN_ID,
  );
  useEffect(() => {
    if (
      signupPlanInterest &&
      STRIPE_PLANS.some(
        (plan) =>
          plan.catalogFamily === "channels" &&
          plan.id === signupPlanInterest &&
          plan.id !== "personal" &&
          !plan.channels.includes("sms"),
      )
    )
      setSelectedId(signupPlanInterest);
  }, [signupPlanInterest, plans]);
  function selectPackage(id: string, interval = billingInterval) {
    setSelectedId(id);
    persistSignupIntent(
      mergeSignupIntent(getStoredSignupIntent(), {
        preferredPlanId: id as SignupPlanId,
        preferredBillingInterval: interval,
        capturedAt: new Date().toISOString(),
      }),
    );
    const url = new URL(window.location.href);
    url.searchParams.set("plan", id);
    url.searchParams.set("interval", interval);
    window.history.replaceState(window.history.state, "", url);
  }
  return (
    <div className="wl-billing-plans space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-tight">Your Plan</h3>
        <BillingIntervalControl
          value={billingInterval}
          disabled={!!busy}
          onChange={(interval) => {
            selectPackage(selectedId, interval);
            onBillingIntervalChange(interval);
          }}
        />
      </div>
      {personalPlan ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold">
              Personal · $
              {billingInterval === "year"
                ? personalPlan.price_usd_annual
                : personalPlan.price_usd_monthly}
              {billingInterval === "year" ? "/year" : "/month"}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Calls and a computer. Connect Gmail or Outlook for the inbox you already use.
            </p>
          </div>
          <ShadButton
            type="button"
            disableAnimations
            disabled={!!busy}
            onClick={() => onSelectPlan("personal", billingInterval)}
          >
            {busy === "personal" ? "Opening checkout" : "Choose Personal"}
          </ShadButton>
        </div>
      ) : null}
      <ChannelPlanPicker
        id="billing"
        plans={displayPlans}
        availableChannels={["voice", "email"]}
        selectedPlanId={selectedId}
        onSelectPlan={selectPackage}
        interval={billingInterval}
        disabled={!!busy}
        renderAction={(plan) => {
          const live = availablePlans.find((item) => item.id === plan.id);
          const canSubscribe =
            checkoutReleased &&
            live?.checkout_availability === "available" &&
            (billingInterval === "year" ? live.annual_configured : live.configured) === true;
          const needsEmailSetupReview =
            checkoutReleased &&
            live?.contact_sales === true &&
            live.checkout_availability === "available" &&
            live.channels.includes("email");
          return (
            <div className="space-y-2">
              {needsEmailSetupReview ? (
                <div role="status" className="space-y-2 text-sm text-muted-foreground">
                  <p>Email activation requires a setup review.</p>
                  <Link
                    to="/contact?topic=email"
                    className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Ask About Email Setup
                  </Link>
                </div>
              ) : null}
              <ShadButton
                type="button"
                disableAnimations
                className="w-full"
                disabled={!!busy || !canSubscribe}
                onClick={() => onSelectPlan(plan.id, billingInterval)}
              >
                {busy === plan.id ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Opening checkout
                  </>
                ) : canSubscribe ? (
                  "Continue to Checkout"
                ) : (
                  "Checkout Paused"
                )}
              </ShadButton>
            </div>
          );
        }}
      />
    </div>
  );
}

function GrantedPlanAccessCard({
  sub,
  agentCount,
  busy,
  onPortal,
}: {
  sub: BillingSubscriptionState;
  agentCount: number;
  busy: boolean;
  onPortal: () => void;
}) {
  const accent = PLAN_ACCENTS[sub.plan || ""] || BRAND.colors.primary;
  const Icon = PLAN_ICONS[sub.plan || ""] || Building2;
  const includedNumbers = planById(sub.plan)?.included_phone_numbers ?? 0;
  return (
    <div
      className="rounded-md wl-panel border border-border p-8 md:p-10 relative overflow-hidden"
      data-accent={accent}
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none wl-accent-halo" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-md flex items-center justify-center shrink-0 wl-accent-surface">
            <Icon className="w-8 h-8 wl-accent-text" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="wl-label text-foreground/70 font-medium">Current plan</span>
              <Chip tone="success" dot>
                Granted access
              </Chip>
            </div>
            <h3 className="wl-display-mark text-3xl md:text-4xl text-foreground">
              {getPlanDisplayLabel({ id: sub.plan, name: sub.plan_name })}
            </h3>
            <p className="text-sm font-semibold text-foreground">Plan access is active</p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Paid-plan access is granted directly to this workspace.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
              {agentCount} {agentCount === 1 ? "Bot" : "Bots"} in use
            </p>
            {!isUsagePlanId(sub.plan) && includedNumbers > 0 ? (
              <p className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
                {includedNumbers} number{includedNumbers === 1 ? "" : "s"} included in your plan
              </p>
            ) : null}
          </div>
        </div>
        {sub.has_customer === true ? (
          <ShadButton
            type="button"
            disableAnimations
            variant="outline"
            onClick={onPortal}
            disabled={busy}
            className="inline-flex h-auto min-h-11 w-full shrink-0 gap-2.5 whitespace-normal rounded-md border px-4 py-3 text-sm font-semibold tracking-normal hover-premium-glow shadow-premium-button wl-accent-cta sm:w-auto"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Manage Billing
          </ShadButton>
        ) : null}
      </div>
    </div>
  );
}

function ActiveSubCard({
  sub,
  agentCount,
  busy,
  onPortal,
}: {
  sub: BillingSubscriptionState;
  agentCount: number;
  busy: boolean;
  onPortal: () => void;
}) {
  const accent = PLAN_ACCENTS[sub.plan || ""] || BRAND.colors.primary;
  const periodEnd = safeDate(sub.current_period_end);
  const subscriptionEnded = sub.status === "canceled" || sub.status === "incomplete_expired";
  const periodEndLabel = subscriptionEnded
    ? null
    : sub.cancel_at_period_end
      ? "Ends"
      : sub.status === "trialing"
        ? "Trial Ends"
        : sub.status === "active" || sub.status === "past_due"
          ? "Renews"
          : "Period End";
  const statusBadge =
    sub.status === "active"
      ? { label: "Active", tone: "success" as const }
      : sub.status === "trialing"
        ? { label: "Trial", tone: "primary" as const }
        : sub.status === "past_due"
          ? { label: "Past Due", tone: "warning" as const }
          : sub.status === "canceled"
            ? { label: "Canceled", tone: "error" as const }
            : { label: (sub.status || "Unknown").toLowerCase(), tone: "neutral" as const };
  return (
    <div
      className="rounded-md wl-panel border border-border p-5 sm:p-6 relative overflow-hidden"
      data-accent={accent}
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none wl-accent-halo" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0 flex-1 basis-96">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="wl-label text-foreground/70 font-medium">Current Plan</span>
              <Chip tone={statusBadge.tone} dot>
                {statusBadge.label}
              </Chip>
              {sub.cancel_at_period_end && !subscriptionEnded && (
                <Chip tone="warning">Cancels at period end</Chip>
              )}
            </div>
            <h3 className="wl-display-mark break-words text-2xl sm:text-3xl text-foreground">
              {getPlanDisplayLabel({ id: sub.plan, name: sub.plan_name })}
            </h3>
            <p className="text-sm tabular-nums text-muted-foreground">
              <span>
                {agentCount} {agentCount === 1 ? "Bot" : "Bots"} in use
              </span>
              {periodEnd && periodEndLabel ? (
                <>
                  {" · "}
                  {periodEndLabel} {formatDate(periodEnd)}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          onClick={onPortal}
          disabled={busy}
          className="inline-flex h-auto min-h-11 w-full shrink-0 gap-2.5 whitespace-normal rounded-md border px-4 py-3 text-sm font-semibold tracking-normal hover-premium-glow shadow-premium-button wl-accent-cta sm:w-auto"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          Manage Billing
        </ShadButton>
      </div>
    </div>
  );
}
