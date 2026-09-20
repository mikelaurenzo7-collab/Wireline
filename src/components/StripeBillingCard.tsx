/* eslint-disable @typescript-eslint/no-explicit-any -- billing and analytics provider errors remain loosely typed. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import {
  CreditCard,
  Loader2,
  Check,
  ChevronDown,
  Shield,
  ArrowRight,
  AlertTriangle,
  ExternalLink,
  Building2,
  Plus,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { safeDate, formatDate } from "../lib/safe-date";
import UsageMeter from "./UsageMeter";
import { ShadButton } from "./ui/shadcn/ShadButton";
import {
  billingIntervalFromIntent,
  getStoredSignupIntent,
  recommendedPlanFromIntent,
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

const CHECKOUT_RELEASE_MESSAGE =
  "New purchases are temporarily unavailable. Please try again soon.";

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
      const checkoutAvailable =
        configured &&
        plansRes.checkout_available === true &&
        livePlans.some((plan) => plan.price_usd_monthly > 0 && plan.configured === true);
      setSelfServeBillingReleased(checkoutAvailable);
      onCheckoutAvailabilityChange?.(checkoutAvailable ? "available" : "paused");
      setSub(statusRes.subscription || null);
      setAgentCount(statusRes.agent_count ?? 0);
      const urlPlan = new URLSearchParams(window.location.search).get("plan");
      const explicitPaidPlan =
        urlPlan && ["starter", "team", "business", "enterprise"].includes(urlPlan) ? urlPlan : null;
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
    if (!billingReady || !selfServeBillingReleased || !selectedIntervalReady) {
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
    setBusy("portal");
    setError(null);
    try {
      const r = await authFetch("/api/billing/portal", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Portal failed");
      window.location.href = d.url;
    } catch (e: any) {
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
            {CHECKOUT_RELEASE_MESSAGE} Existing subscriptions and secure billing management remain
            available.
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
        <GrantedPlanAccessCard sub={sub} agentCount={agentCount} />
      ) : null}
      {hasActiveSubscription ? (
        <UsageMeter onUpgrade={openPortal} showBalance={showUsageBalance} />
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
      {!hasPlanAccess ? (
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
      <div className="flex items-center gap-2">
        <Shield className="w-3 h-3" />
        Encrypted payments · Cancel anytime
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

function planSummary(plan: ClientPlan): string[] {
  const usd = (value: number) => `$${value.toFixed(2).replace(/\.00$/, "")}`;
  const allowance = plan.ai_spend_allowance_usd_monthly;
  if (plan.is_free) {
    return [
      "Private setup and simulation",
      ...(typeof allowance === "number" && Number.isFinite(allowance)
        ? [`${usd(allowance)} of private AI simulation each month`]
        : plan.features.filter((feature) => /simulation.*month/i.test(feature))),
      "No live number until activation",
    ];
  }
  const runtime = plan.runtime_allowance_usd_monthly;
  return [
    ...(Number.isFinite(plan.included_phone_numbers)
      ? [
          `${plan.included_phone_numbers} phone number${plan.included_phone_numbers === 1 ? "" : "s"} included`,
        ]
      : []),
    ...(Number.isFinite(plan.voice_minutes_monthly)
      ? [`${plan.voice_minutes_monthly.toLocaleString()} voice minutes each month`]
      : []),
    ...(typeof runtime === "number" &&
    Number.isFinite(runtime) &&
    typeof allowance === "number" &&
    Number.isFinite(allowance)
      ? [`${usd(runtime)} Runtime + ${usd(allowance)} managed AI each month`]
      : plan.features.filter((feature) => /allowance/i.test(feature))),
    ...(Number.isFinite(plan.overage_per_min_usd)
      ? [`$${plan.overage_per_min_usd.toFixed(2)}/min prepaid after included minutes`]
      : []),
    ...plan.features.filter((feature) => /no automatic overages/i.test(feature)),
  ];
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
  return (
    <div className="rounded-md wl-panel border border-border p-4 sm:p-6 space-y-5">
      <div className="border-b border-border pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="font-semibold tracking-[-.02em] text-3xl text-foreground">Plans</h3>
          <div
            className="inline-flex shrink-0 rounded-full border border-border bg-muted/40 p-1"
            role="group"
            aria-label="Billing interval"
          >
            <button
              type="button"
              onClick={() => onBillingIntervalChange("month")}
              className={cn(
                "min-h-9 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.14em] transition",
                billingInterval === "month"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={billingInterval === "month"}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => onBillingIntervalChange("year")}
              className={cn(
                "min-h-9 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.14em] transition",
                billingInterval === "year"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={billingInterval === "year"}
            >
              Annual
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
        {plans
          .filter((p) => p.public !== false)
          .map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Building2;
            const accent = PLAN_ACCENTS[plan.id] || BRAND.colors.primary;
            const isBusy = busy === plan.id;
            const isSignupMatch = signupPlanInterest === plan.id;
            const isFree = plan.is_free === true;
            const annual = plan.price_usd_annual > 0;
            const showAnnual = billingInterval === "year" && annual;
            const canSubscribe =
              checkoutReleased &&
              !isFree &&
              (showAnnual ? plan.annual_configured === true : plan.configured === true);
            const price = showAnnual ? plan.price_usd_annual : plan.price_usd_monthly;
            const priceSuffix = isFree ? "forever" : showAnnual ? "/yr" : "/mo";
            const monthsSaved =
              annual && plan.price_usd_monthly > 0
                ? Math.max(0, Math.round(12 - plan.price_usd_annual / plan.price_usd_monthly))
                : 0;
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "relative rounded-md wl-panel border p-4 sm:p-5 flex flex-col gap-4 transition-all group overflow-hidden",
                  isSignupMatch
                    ? "border-brand/50 bg-brand/5 shadow-lg shadow-brand/10"
                    : "border-border hover:border-[color:var(--wireline-color-border-strong)]",
                )}
                data-accent={accent}
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center wl-accent-surface">
                    <Icon className="w-5 h-5 wl-accent-text" />
                  </div>
                  <span className="text-[length:var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground">
                    {plan.max_agents} {plan.max_agents === 1 ? "Bot" : "Bots"}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold tracking-[-.02em] text-2xl text-foreground">
                    {plan.name}
                  </h4>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="font-semibold tracking-[-.02em] text-4xl text-foreground tabular-nums">
                      ${price.toLocaleString()}
                    </span>
                    <span className="text-[length:var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground">
                      {priceSuffix}
                    </span>
                  </div>
                  {showAnnual && monthsSaved > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Save {monthsSaved} month{monthsSaved === 1 ? "" : "s"} vs monthly
                    </p>
                  ) : !isFree && billingInterval === "year" && !annual ? (
                    <p className="mt-1 text-xs text-muted-foreground">Billed monthly</p>
                  ) : annual ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      or ${plan.price_usd_annual}/yr
                      {monthsSaved > 0
                        ? ` · save ${monthsSaved} month${monthsSaved === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <ul className="space-y-2 flex-1">
                  {planSummary(plan).map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-caption">
                      <Check
                        className="w-3.5 h-3.5 mt-0.5 shrink-0 wl-accent-text"
                        strokeWidth={2.5}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isFree ? (
                  <ShadButton
                    asChild
                    disableAnimations
                    variant="outline"
                    className="w-full rounded-md border-border bg-card py-3 font-medium text-foreground shadow-premium-button hover:border-[color:var(--wireline-color-border-strong)] hover:bg-muted hover-premium-glow wl-label wl-accent-subscribe"
                  >
                    <Link to="/studio">
                      Open Free Builder <ArrowRight className="w-3 h-3" />
                    </Link>
                  </ShadButton>
                ) : checkoutReleased && !canSubscribe ? (
                  <ShadButton
                    asChild
                    disableAnimations
                    variant="outline"
                    className="w-full rounded-md border-border bg-card py-3 font-medium text-foreground wl-label"
                  >
                    <Link to="/contact?topic=billing">
                      Contact Sales <ArrowRight className="w-3 h-3" />
                    </Link>
                  </ShadButton>
                ) : (
                  <ShadButton
                    type="button"
                    disableAnimations
                    variant="outline"
                    onClick={() => onSelectPlan(plan.id, showAnnual ? "year" : "month")}
                    disabled={isBusy || !canSubscribe}
                    className={cn(
                      "w-full py-3 rounded-md wl-label font-medium shadow-premium-button border-border hover:border-[color:var(--wireline-color-border-strong)] text-foreground bg-card hover:bg-muted hover-premium-glow",
                      !isBusy && canSubscribe && "wl-accent-subscribe",
                    )}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : canSubscribe ? (
                      <>
                        Subscribe {showAnnual ? "annually" : ""} <ArrowRight className="w-3 h-3" />
                      </>
                    ) : (
                      "Checkout paused"
                    )}
                  </ShadButton>
                )}
                {!isFree && !canSubscribe && (
                  <p className="text-[length:var(--wireline-typography-overline-size)] text-muted-foreground text-center leading-relaxed">
                    {checkoutReleased
                      ? "Online checkout is not yet available for this plan"
                      : "Online checkout is temporarily unavailable"}
                  </p>
                )}
                {plan.features.length > 0 ? (
                  <details className="group/details border-t border-border pt-1">
                    <summary className="wl-focus-ring-halo flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground marker:hidden">
                      Plan Details
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </summary>
                    <ul className="space-y-2 pb-2 pt-1" aria-label={`${plan.name} full details`}>
                      {plan.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-caption text-muted-foreground"
                        >
                          <Check
                            className="mt-0.5 size-3.5 shrink-0 wl-accent-text"
                            aria-hidden="true"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-60 transition-opacity duration-300 wl-accent-hover-bar" />
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}

function GrantedPlanAccessCard({
  sub,
  agentCount,
}: {
  sub: BillingSubscriptionState;
  agentCount: number;
}) {
  const accent = PLAN_ACCENTS[sub.plan || ""] || BRAND.colors.primary;
  const Icon = PLAN_ICONS[sub.plan || ""] || Building2;
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
              <span className="wl-label-muted opacity-70">Current plan</span>
              <Chip tone="success" dot>
                Granted access
              </Chip>
            </div>
            <h3 className="wl-display-mark text-3xl md:text-4xl text-foreground">
              {sub.plan_name || sub.plan || "Paid Plan"}
            </h3>
            <p className="text-sm font-semibold text-foreground">Plan access is active</p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Paid-plan access is granted directly to this workspace. No recurring invoice is
              scheduled.
            </p>
            {sub.max_agents ? (
              <p className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
                {agentCount} / {sub.max_agents} {sub.max_agents === 1 ? "Bot" : "Bots"} in use
              </p>
            ) : null}
          </div>
        </div>
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
              <span className="wl-label-muted opacity-70">Current Plan</span>
              <Chip tone={statusBadge.tone} dot>
                {statusBadge.label}
              </Chip>
              {sub.cancel_at_period_end && !subscriptionEnded && (
                <Chip tone="warning">Cancels at period end</Chip>
              )}
            </div>
            <h3 className="wl-display-mark break-words text-2xl sm:text-3xl text-foreground">
              {sub.plan_name || sub.plan || "N/A"}
            </h3>
            <p className="text-sm tabular-nums text-muted-foreground">
              {sub.max_agents ? (
                <span
                  className={
                    agentCount >= sub.max_agents - 1
                      ? "text-[var(--wireline-color-status-warning)]"
                      : ""
                  }
                >
                  {agentCount} / {sub.max_agents} {sub.max_agents === 1 ? "Bot" : "Bots"} in use
                </span>
              ) : (
                ""
              )}
              {periodEnd && periodEndLabel && (
                <>
                  {sub.max_agents ? " · " : ""}
                  {periodEndLabel} {formatDate(periodEnd)}
                </>
              )}
            </p>
            {sub.max_agents && sub.max_agents > 1 && agentCount >= sub.max_agents - 1 ? (
              <p className="text-sm text-[var(--wireline-color-status-warning)]">
                {agentCount >= sub.max_agents ? "All Bot slots in use." : "Near capacity."} Add Bots
                or upgrade in Manage Subscription.
              </p>
            ) : null}
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
          Manage Subscription
        </ShadButton>
      </div>
    </div>
  );
}
