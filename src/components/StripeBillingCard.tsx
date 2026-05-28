/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  CreditCard,
  Loader2,
  Check,
  Sparkles,
  Shield,
  ArrowRight,
  AlertTriangle,
  ExternalLink,
  Crown,
  Zap,
  Building2,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { safeDate, formatDate } from "../lib/safe-date";
import UsageMeter from "./UsageMeter";
import { getStoredSignupIntent, recommendedPlanFromIntent } from "../lib/signup-intent";

interface Plan {
  id: "personal" | "starter" | "pro" | "business" | "enterprise";
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  voice_minutes_monthly?: number;
  overage_per_min_usd?: number;
  features: string[];
  configured: boolean;
}

interface SubscriptionState {
  plan: string | null;
  plan_name: string | null;
  max_agents: number | null;
  status: string | null; // Stripe verbatim
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  has_subscription: boolean;
  updated_at: string | null;
}

const PLAN_ICONS: Record<string, any> = {
  personal: Sparkles,
  starter: Sparkles,
  pro: Zap,
  business: Building2,
  enterprise: Crown,
};

const PLAN_ACCENTS: Record<string, string> = {
  personal: "#10B981",
  starter: "#0A0A0A",
  pro: "#0A0A0A",
  business: "#0A0A0A",
  enterprise: "#FFC07D",
};

export default function StripeBillingCard() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [agentCount, setAgentCount] = useState<number>(0);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [signupPlanInterest, setSignupPlanInterest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // plan_id | "portal"
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, plansRes] = await Promise.all([
        authFetch("/api/billing/status").then((r) => r.json()),
        authFetch("/api/billing/plans").then((r) => r.json()),
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
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Reflect Stripe's redirect back to /admin?billing=success — refresh
  // so the card flips from "no sub" to active without needing the user
  // to reload by hand.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      // Give the webhook a moment to land before re-fetching.
      const t = setTimeout(refresh, 1500);
      // Strip the query so a reload doesn't double-fire.
      window.history.replaceState({}, "", window.location.pathname);
      return () => clearTimeout(t);
    }
  }, []);

  const startCheckout = async (planId: string) => {
    // Plan changes for an existing subscriber go through the Customer
    // Portal — Stripe handles proration cleanly there and we avoid
    // creating a second concurrent subscription. The server enforces
    // this with a 409 ALREADY_SUBSCRIBED, but routing client-side
    // gives a smoother UX (one redirect instead of two).
    const hasActive =
      !!sub?.has_subscription &&
      (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");
    if (hasActive) {
      return openPortal();
    }

    setBusy(planId);
    setError(null);
    try {
      const r = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const d = await r.json();
      // Defense-in-depth: if the server still rejected (race with a
      // checkout in another tab, etc.), bounce to the portal.
      if (r.status === 409 && d?.code === "ALREADY_SUBSCRIBED") {
        setBusy(null);
        return openPortal();
      }
      if (!r.ok || !d.url) throw new Error(d.error || "Checkout failed");
      window.location.href = d.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed");
      setBusy(null);
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

  if (loading) {
    return (
      <div className="rounded-2xl glass border border-white/10 p-10 flex items-center gap-4">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <span className="app-section-title/70">Loading billing state…</span>
      </div>
    );
  }

  if (!stripeConfigured) {
    // White-label posture: customers never see operator env-var names.
    // If Stripe isn't ready on the backend, show a generic "in setup"
    // message and a contact path. Operator notifications happen via
    // Vercel logs + /api/health/integrations (owner-gated).
    return (
      <div className="rounded-2xl glass border border-amber-500/25 bg-amber-500/[0.04] p-8 md:p-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="font-display italic lowercase text-2xl text-ink">
            billing is finishing setup
          </h3>
        </div>
        <p className="text-[12px] text-ink/75 leading-relaxed">
          Your account is active. The billing portal is being provisioned and will be live shortly.
          You can keep using Wireline — we'll email you the moment self-serve plan changes are
          available, or write to{" "}
          <a href="mailto:trywireline@yahoo.com" className="text-brand hover:underline">
            trywireline@yahoo.com
          </a>{" "}
          if you'd like to talk to us about a plan today.
        </p>
      </div>
    );
  }

  const hasActive = sub?.has_subscription && (sub.status === "active" || sub.status === "trialing");

  return (
    <div className="space-y-8">
      {/* Active subscription card */}
      {sub?.has_subscription && (
        <ActiveSubCard
          sub={sub}
          agentCount={agentCount}
          busy={busy === "portal"}
          onPortal={openPortal}
        />
      )}

      {/* Voice-minute usage — only renders when there's an active plan */}
      {sub?.has_subscription && <UsageMeter />}

      {error && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-500/8 border border-rose-500/30 p-4 flex items-center gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-[11px] text-rose-500">{error}</p>
        </div>
      )}

      {/* Plan picker */}
      <div className="rounded-2xl glass border border-white/10 p-8 md:p-10 space-y-8">
        <div className="border-b border-white/8 pb-6">
          <h3 className="font-display italic lowercase text-3xl text-ink">
            {hasActive ? "change plan" : "choose a plan"}
          </h3>
          {!hasActive && (
            <p className="text-[12px] text-muted/70 mt-1.5 leading-relaxed max-w-lg">
              Each agent replaces hours of human intake, follow-up, and triage work — for a fraction
              of the cost. No setup fees. Cancel anytime.
            </p>
          )}
          {hasActive && (
            <p className="app-section-title/70 mt-2">
              Use the Stripe portal above to upgrade, downgrade, or cancel.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Building2;
            const accent = PLAN_ACCENTS[plan.id] || "#0A0A0A";
            const isCurrent = sub?.plan === plan.id && hasActive;
            const isBusy = busy === plan.id;
            const isSignupMatch = !hasActive && signupPlanInterest === plan.id;
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -3 }}
                className={cn(
                  "relative rounded-2xl glass border p-7 flex flex-col gap-5 transition-all",
                  isCurrent
                    ? "border-brand/40 bg-brand/5"
                    : isSignupMatch
                      ? "border-brand/50 bg-brand/5 shadow-lg shadow-brand/10"
                      : "border-white/10 hover:border-white/20",
                )}
              >
                {isCurrent && (
                  <div
                    className="absolute -top-3 right-4 px-3 py-1 rounded-full text-paper text-[9px] uppercase tracking-[0.3em]"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
                  >
                    Current plan
                  </div>
                )}
                {!isCurrent && isSignupMatch && (
                  <div
                    className="absolute -top-3 left-4 px-3 py-1 rounded-full text-[9px] uppercase tracking-[0.3em]"
                    style={{
                      background: "#0A0A0A",
                      color: "#fff",
                    }}
                  >
                    Matched from visit
                  </div>
                )}
                {!isCurrent && !isSignupMatch && plan.id === "pro" && (
                  <div
                    className="absolute -top-3 left-4 px-3 py-1 rounded-full text-[9px] uppercase tracking-[0.3em]"
                    style={{
                      background: "#0A0A0A",
                      color: "#fff",
                    }}
                  >
                    Most popular
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: accent }} />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                    {plan.max_agents} {plan.max_agents === 1 ? "agent" : "agents"}
                  </span>
                </div>
                <div>
                  <h4 className="font-display italic lowercase text-2xl text-ink">{plan.name}</h4>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    {plan.price_usd_monthly > 0 ? (
                      <>
                        <span className="font-display italic text-4xl text-ink">
                          ${plan.price_usd_monthly.toLocaleString()}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-muted/70">
                          /mo
                        </span>
                      </>
                    ) : (
                      // price 0 == contact-sales tier (Enterprise) — never
                      // render "$0/mo", which reads as free.
                      <span className="font-display italic text-4xl text-ink">Custom</span>
                    )}
                  </div>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-caption">
                      <Check
                        className="w-3.5 h-3.5 mt-0.5 shrink-0"
                        style={{ color: accent }}
                        strokeWidth={2.5}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => startCheckout(plan.id)}
                  disabled={isBusy || isCurrent || !plan.configured}
                  className={cn(
                    "w-full py-3 rounded-xl text-[10px] uppercase tracking-[0.28em] font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
                    isCurrent
                      ? "bg-white/5 border border-white/10 text-muted"
                      : "border border-white/20 hover:border-white/40 text-ink bg-white/5 hover:bg-white/10",
                  )}
                  style={!isCurrent && !isBusy ? { borderColor: `${accent}50` } : {}}
                >
                  {isBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isCurrent ? (
                    <>Current</>
                  ) : (
                    <>
                      {hasActive ? "Switch" : "Subscribe"} <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
                {!plan.configured && (
                  <p className="text-[9px] uppercase tracking-[0.28em] text-muted/60 text-center leading-relaxed">
                    Available soon — contact us to start on this tier
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-6">
          <div className="app-section-title/65 flex items-center gap-2">
            <Shield className="w-3 h-3" />
            Stripe · PCI DSS Level 1 · Cancel anytime
          </div>
          <div className="flex items-center gap-3 text-[9px] text-muted/60 uppercase tracking-[0.2em]">
            <a href="/privacy" className="hover:text-muted/70 transition-colors">
              Privacy
            </a>
            <span>·</span>
            <a href="/terms" className="hover:text-muted/70 transition-colors">
              Terms
            </a>
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
  sub: SubscriptionState;
  agentCount: number;
  busy: boolean;
  onPortal: () => void;
}) {
  const accent = PLAN_ACCENTS[sub.plan || ""] || "#0A0A0A";
  const Icon = PLAN_ICONS[sub.plan || ""] || CreditCard;
  const renews = safeDate(sub.current_period_end);
  const daysLeft = renews
    ? Math.max(0, Math.ceil((renews.getTime() - Date.now()) / 86_400_000))
    : null;

  const statusBadge =
    sub.status === "active"
      ? { label: "Active", cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-600" }
      : sub.status === "trialing"
        ? { label: "Trial", cls: "bg-brand/15 border-brand/30 text-brand" }
        : sub.status === "past_due"
          ? { label: "Past Due", cls: "bg-amber-500/15 border-amber-500/30 text-amber-600" }
          : sub.status === "canceled"
            ? { label: "Canceled", cls: "bg-rose-500/15 border-rose-500/30 text-rose-500" }
            : {
                label: (sub.status || "Unknown").toLowerCase(),
                cls: "bg-white/10 border-white/20 text-muted",
              };

  return (
    <div className="rounded-2xl glass border border-white/12 p-8 md:p-10 relative overflow-hidden">
      <div
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: accent }}
      />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="flex items-center gap-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}
          >
            <Icon className="w-8 h-8" style={{ color: accent }} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] uppercase tracking-[0.45em] text-muted/60">
                Current plan
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.25em] border",
                  statusBadge.cls,
                )}
              >
                {statusBadge.label}
              </span>
              {sub.cancel_at_period_end && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.25em] border bg-rose-500/15 border-rose-500/30 text-rose-500">
                  Cancels at period end
                </span>
              )}
            </div>
            <h3 className="font-display italic lowercase text-3xl md:text-4xl text-ink">
              {sub.plan_name || sub.plan || "—"}
            </h3>
            <p className="app-section-title/60">
              {sub.max_agents ? (
                <span className={agentCount >= sub.max_agents ? "text-amber-600" : ""}>
                  {agentCount} / {sub.max_agents} agents
                </span>
              ) : (
                ""
              )}
              {renews && (
                <>
                  {sub.max_agents ? " · " : ""}
                  renews {formatDate(renews)}
                  {daysLeft !== null ? ` · ${daysLeft}d` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onPortal}
          disabled={busy}
          className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl border text-[11px] uppercase tracking-[0.28em] transition-all disabled:opacity-50"
          style={{
            background: `${accent}12`,
            borderColor: `${accent}40`,
            color: accent,
          }}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          Manage subscription
        </button>
      </div>
    </div>
  );
}
