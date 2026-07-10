/* eslint-disable @typescript-eslint/no-explicit-any -- video presenter entitlement and checkout errors remain loosely typed. */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  CreditCard,
  Loader2,
  Check,
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
import { getStoredSignupIntent, recommendedPlanFromIntent } from "../lib/signup-intent";
import { BRAND } from "../constants/brand-colors";
import { PRODUCT_VERSATILITY } from "../lib/product-copy";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_PRESETS_USD,
} from "../lib/conversation-balance";
import { liveVideoAddonPitch, liveVideoMeteringNote } from "../lib/video-presenter/copy";
import type { LiveVideoAddonState } from "../lib/video-presenter/types";
import { WiredEyebrow } from "./ui/WiredEyebrow";
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

// Conversion-tracking values (USD/mo). Personal activation is tracked through
// Conversation Balance checkout, not subscription checkout.
const CHECKOUT_VALUES: Record<string, number> = {
  team: 29,
  business: 59,
  enterprise: 0,
};

export default function StripeBillingCard() {
  const [plans, setPlans] = useState<ClientPlan[]>([]);
  const [sub, setSub] = useState<BillingSubscriptionState | null>(null);
  const [agentCount, setAgentCount] = useState<number>(0);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [signupPlanInterest, setSignupPlanInterest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creditBusy, setCreditBusy] = useState<number | null>(null);
  const [liveVideoBusy, setLiveVideoBusy] = useState(false);
  const [liveVideoAddon, setLiveVideoAddon] = useState<LiveVideoAddonState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, plansRes, entitlementRes] = await Promise.all([
        authFetch("/api/billing/status").then((r) => r.json() as Promise<BillingStatusResponse>),
        authFetch("/api/billing/plans").then((r) => r.json() as Promise<BillingPlansResponse>),
        authFetch("/api/video-presenter/entitlement").then((r) => (r.ok ? r.json() : null)),
      ]);
      setStripeConfigured(!!statusRes.stripe_configured && !!plansRes.stripe_configured);
      setSub(statusRes.subscription || null);
      setAgentCount(statusRes.agent_count ?? 0);
      const storedIntent = getStoredSignupIntent();
      setSignupPlanInterest(
        statusRes.signup_intent?.plan_id ||
          (storedIntent ? recommendedPlanFromIntent(storedIntent) : null),
      );
      setPlans(plansRes.plans || []);
      setLiveVideoAddon(entitlementRes);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("billing") === "success" ||
      params.get("credits") === "success" ||
      params.get("balance") === "success" ||
      params.get("live_video") === "success"
    ) {
      const t = setTimeout(refresh, 1500);
      window.history.replaceState({}, "", window.location.pathname);
      return () => clearTimeout(t);
    }
  }, []);

  const startCheckout = async (planId: string) => {
    const hasActive =
      !!sub?.has_subscription &&
      (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");
    if (hasActive) return openPortal();

    setBusy(planId);
    setError(null);
    try {
      const r = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const d = await r.json();
      if (r.status === 409 && d?.code === "ALREADY_SUBSCRIBED") {
        setBusy(null);
        return openPortal();
      }
      if (!r.ok || !d.url) throw new Error(d.error || "Checkout failed");

      if (typeof window !== "undefined") {
        try {
          if (typeof (window as any).fbq === "function") {
            (window as any).fbq("track", "InitiateCheckout", {
              content_category: "Subscription",
              content_ids: [planId],
              value: CHECKOUT_VALUES[planId] || 0,
              currency: "USD",
            });
          }
          if (typeof (window as any).plausible === "function") {
            (window as any).plausible("CheckoutInitiated", { props: { plan: planId } });
          }
          if (typeof (window as any).dataLayer?.push === "function") {
            (window as any).dataLayer.push({ event: "checkout_initiated", planId });
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
    setCreditBusy(amountUsd);
    setError(null);
    try {
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

  const startLiveVideoCheckout = async () => {
    setLiveVideoBusy(true);
    setError(null);
    try {
      const r = await authFetch("/api/billing/live-video-checkout", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || "Live video checkout failed");
      window.location.href = d.url;
    } catch (e: any) {
      setError(e?.message || "Live video checkout failed");
      setLiveVideoBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="wl-panel flex items-center gap-4 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-[var(--wireline-typography-body-size)] text-muted-foreground">
          Loading your plan and balance...
        </span>
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
          <h3 className="wl-display-mark text-2xl text-foreground">Billing is finishing setup</h3>
        </div>
        <p className="max-w-2xl text-[var(--wireline-typography-caption-size)] text-foreground/75 leading-relaxed">
          Your account is active. The billing portal is being provisioned and will be live shortly.
          You can keep using Wireline. We'll email you the moment self-serve plan changes are
          available, or write to{" "}
          <a href="mailto:sales@trywireline.com" className="text-brand hover:underline">
            sales@trywireline.com
          </a>{" "}
          if you'd like to talk to us about a plan today.
        </p>
      </div>
    );
  }

  const hasActive =
    !!sub?.has_subscription &&
    (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");

  return (
    <div className="space-y-8">
      {sub?.has_subscription && (
        <ActiveSubCard
          sub={sub}
          agentCount={agentCount}
          busy={busy === "portal"}
          onPortal={openPortal}
        />
      )}
      {hasActive && <UsageMeter onUpgrade={openPortal} />}
      {liveVideoAddon?.addonOffered ? (
        <div className="rounded-md wl-panel border border-dashed border-border p-6 md:p-8 space-y-3">
          <WiredEyebrow>Add-on</WiredEyebrow>
          <h3 className="font-semibold tracking-[-.02em] text-xl text-foreground">
            Live video presence
          </h3>
          <p className="max-w-2xl text-[var(--wireline-typography-caption-size)] leading-relaxed text-muted-foreground">
            {liveVideoAddonPitch()} {liveVideoMeteringNote()}
          </p>
          {liveVideoAddon.liveVideoAddonEnabled || liveVideoAddon.billingEntitled ? (
            <p className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-[var(--wireline-color-status-success)]">
              Active on this workspace
            </p>
          ) : liveVideoAddon.liveVideoCheckoutAvailable ? (
            <ShadButton
              type="button"
              disableAnimations
              variant="outline"
              onClick={() => void startLiveVideoCheckout()}
              disabled={liveVideoBusy}
              className="inline-flex gap-2 px-5 py-2.5 rounded-md border-[color:var(--wireline-color-action-secondary-default)] text-[var(--wireline-color-text-on-action)] bg-[var(--wireline-color-action-secondary-default)] hover:opacity-95"
            >
              {liveVideoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Subscribe · $19/mo
            </ShadButton>
          ) : (
            <p className="text-[var(--wireline-typography-caption-size)] text-muted-foreground">
              Contact Wireline to enable live video on this workspace.
            </p>
          )}
        </div>
      ) : null}
      <CreditTopUpCard
        mode={hasActive ? "topup" : "activation"}
        busy={creditBusy}
        onBuy={startCreditCheckout}
      />
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] p-4 flex items-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-[var(--wireline-color-status-error)] shrink-0" />
          <p className="text-[var(--wireline-typography-overline-size)] text-[var(--wireline-color-status-error)]">
            {error}
          </p>
        </div>
      )}
      {hasActive ? (
        <div className="rounded-md wl-panel border border-border p-8 md:p-10 space-y-5">
          <div className="border-b border-border pb-5">
            <h3 className="font-semibold tracking-[-.02em] text-2xl text-foreground">
              Manage plan
            </h3>
            <p className="text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground mt-1.5 max-w-lg">
              Upgrade, downgrade, update payment method, or cancel through the secure Stripe
              customer portal. Changes apply to your next billing cycle unless noted otherwise.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ShadButton
              type="button"
              disableAnimations
              variant="outline"
              onClick={openPortal}
              disabled={busy === "portal"}
              className="inline-flex gap-2.5 px-6 py-3 rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] hover-premium-glow shadow-premium-button border-brand/40 text-brand"
            >
              {busy === "portal" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Open billing portal
            </ShadButton>
            <span className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground flex items-center gap-2">
              <Shield className="w-3 h-3" />
              Upgrade · cancel · invoices
            </span>
          </div>
        </div>
      ) : (
        <PlanPicker
          plans={plans}
          signupPlanInterest={signupPlanInterest}
          busy={busy}
          onSelectPlan={startCheckout}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[var(--wireline-typography-overline-size)] text-muted-foreground uppercase tracking-[0.2em]">
        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3" />
          Stripe · PCI DSS Level 1 · Cancel anytime
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
    </div>
  );
}

function CreditTopUpCard({
  mode,
  busy,
  onBuy,
}: {
  mode: "activation" | "topup";
  busy: number | null;
  onBuy: (amountUsd: number) => void;
}) {
  const isActivation = mode === "activation";
  return (
    <div className="rounded-md wl-panel border border-border p-8 md:p-10 space-y-5">
      <div className="border-b border-border pb-5">
        <h3 className="font-semibold tracking-[-.02em] text-2xl text-foreground">
          {isActivation ? CONVERSATION_BALANCE_COPY.title : "Add Conversation Balance"}
        </h3>
        <p className="text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground mt-1.5 max-w-lg">
          {isActivation
            ? `${CONVERSATION_BALANCE_COPY.subtitle} ${CONVERSATION_BALANCE_COPY.reassurance}`
            : "Top up when you need more. Scale up for steady use."}
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
            className="inline-flex gap-2 px-6 py-3 rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] hover-premium-glow shadow-premium-button border-brand/40 text-brand"
          >
            {busy === a ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            ${a}
          </ShadButton>
        ))}
        <span className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground flex items-center gap-2">
          <Shield className="w-3 h-3" />
          {isActivation
            ? "Personal activation without a subscription"
            : "Applied to live-work usage"}
        </span>
      </div>
    </div>
  );
}

function PlanPicker({
  plans,
  signupPlanInterest,
  busy,
  onSelectPlan,
}: {
  plans: ClientPlan[];
  signupPlanInterest: string | null;
  busy: string | null;
  onSelectPlan: (planId: string) => void;
}) {
  return (
    <div className="rounded-md wl-panel border border-border p-8 md:p-10 space-y-8">
      <div className="border-b border-border pb-6">
        <h3 className="font-semibold tracking-[-.02em] text-3xl text-foreground">
          Choose operating capacity
        </h3>
        <p className="text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground mt-1.5 max-w-lg">
          {PRODUCT_VERSATILITY.short} Build free, go live from $9/mo with guaranteed voice minutes,
          and move into shared capacity when you need routing, numbers, approvals, and team
          operations. Stripe-secured. Cancel anytime.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
        {plans
          .filter((p) => p.public !== false)
          .map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Building2;
            const accent = PLAN_ACCENTS[plan.id] || BRAND.colors.primary;
            const isBusy = busy === plan.id;
            const isSignupMatch = signupPlanInterest === plan.id;
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "relative rounded-md wl-panel border p-7 flex flex-col gap-5 transition-all group overflow-hidden",
                  isSignupMatch
                    ? "border-brand/50 bg-brand/5 shadow-lg shadow-brand/10"
                    : "border-border hover:border-[color:var(--wireline-color-border-strong)]",
                )}
                data-accent={accent}
              >
                {!isSignupMatch && plan.id === "team" && (
                  <div className="absolute top-0 left-0 px-3 py-1 wl-label rounded-br-md border border-[color-mix(in_srgb,var(--wireline-color-action-primary-default)_40%,transparent)] bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
                    First shared tier
                  </div>
                )}
                {!isSignupMatch && plan.id === "business" && (
                  <div className="absolute top-0 left-0 px-3 py-1 wl-label rounded-br-md border border-[color-mix(in_srgb,var(--wireline-color-action-secondary-default)_40%,transparent)] bg-[var(--wireline-color-action-secondary-container)] text-[var(--wireline-color-action-secondary-default)] shadow-[var(--wireline-elevation-wireGlow)]">
                    Expanded operations
                  </div>
                )}
                {isSignupMatch && (
                  <div className="absolute top-0 left-0 px-3 py-1 wl-label rounded-br-md border border-[color-mix(in_srgb,var(--wireline-color-action-primary-default)_40%,transparent)] bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
                    Matched from visit
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-md flex items-center justify-center wl-accent-surface">
                    <Icon className="w-6 h-6 wl-accent-text" />
                  </div>
                  <span className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground">
                    {plan.max_agents} {plan.max_agents === 1 ? "agent" : "agents"}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold tracking-[-.02em] text-2xl text-foreground">
                    {plan.name}
                  </h4>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="font-semibold tracking-[-.02em] text-4xl text-foreground">
                      ${plan.price_usd_monthly.toLocaleString()}
                    </span>
                    <span className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground">
                      /mo
                    </span>
                  </div>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-caption">
                      <Check
                        className="w-3.5 h-3.5 mt-0.5 shrink-0 wl-accent-text"
                        strokeWidth={2.5}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <ShadButton
                  type="button"
                  disableAnimations
                  variant="outline"
                  onClick={() => onSelectPlan(plan.id)}
                  disabled={isBusy || !plan.configured}
                  className={cn(
                    "w-full py-3 rounded-md wl-label font-medium shadow-premium-button border-border hover:border-[color:var(--wireline-color-border-strong)] text-foreground bg-card hover:bg-muted hover-premium-glow",
                    !isBusy && plan.configured && "wl-accent-subscribe",
                  )}
                >
                  {isBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : plan.configured ? (
                    <>
                      Subscribe <ArrowRight className="w-3 h-3" />
                    </>
                  ) : (
                    "Contact sales"
                  )}
                </ShadButton>
                {!plan.configured && (
                  <p className="text-[var(--wireline-typography-overline-size)] text-muted-foreground text-center leading-relaxed">
                    Stripe catalog still being consolidated for this tier
                  </p>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-60 transition-opacity duration-300 wl-accent-hover-bar" />
              </motion.div>
            );
          })}
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
  const Icon = PLAN_ICONS[sub.plan || ""] || CreditCard;
  const renews = safeDate(sub.current_period_end);
  const daysLeft = renews
    ? Math.max(0, Math.ceil((renews.getTime() - Date.now()) / 86_400_000))
    : null;
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
      className="rounded-md wl-panel border border-border p-8 md:p-10 relative overflow-hidden"
      data-accent={accent}
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none wl-accent-halo" />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-md flex items-center justify-center shrink-0 wl-accent-surface">
            <Icon className="w-8 h-8 wl-accent-text" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="wl-label-muted opacity-70">Current plan</span>
              <Chip tone={statusBadge.tone} dot>
                {statusBadge.label}
              </Chip>
              {sub.cancel_at_period_end && <Chip tone="warning">Cancels at period end</Chip>}
            </div>
            <h3 className="wl-display-mark text-3xl md:text-4xl text-foreground">
              {sub.plan_name || sub.plan || "—"}
            </h3>
            <p className="text-[var(--wireline-typography-overline-size)] font-mono uppercase tracking-[.05em] text-muted-foreground">
              {sub.max_agents ? (
                <span
                  className={
                    agentCount >= sub.max_agents
                      ? "text-[var(--wireline-color-status-warning)]"
                      : agentCount >= sub.max_agents - 1
                        ? "text-[var(--wireline-color-status-warning)]"
                        : ""
                  }
                >
                  {agentCount} / {sub.max_agents} {sub.max_agents === 1 ? "agent" : "agents"} in use
                </span>
              ) : (
                ""
              )}
              {sub.max_agents && sub.max_agents > 1 && agentCount >= sub.max_agents - 1 ? (
                <span className="block mt-1 normal-case tracking-normal text-[var(--wireline-color-status-warning)]">
                  Near capacity — add an extra agent from Manage subscription or upgrade your plan.
                </span>
              ) : null}
              {renews && (
                <>
                  {sub.max_agents ? " · " : ""}renews {formatDate(renews)}
                  {daysLeft !== null ? ` · ${daysLeft}d` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          onClick={onPortal}
          disabled={busy}
          className="inline-flex gap-2.5 px-6 py-3.5 rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.28em] hover-premium-glow shadow-premium-button border wl-accent-cta"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          Manage subscription
        </ShadButton>
      </div>
    </div>
  );
}
