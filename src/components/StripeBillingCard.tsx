import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  CreditCard, Loader2, Check, Sparkles, Shield, ArrowRight,
  AlertTriangle, ExternalLink, Crown, Zap, Building2,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

interface Plan {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  features: string[];
  configured: boolean;
}

interface SubscriptionState {
  plan: string | null;
  plan_name: string | null;
  max_agents: number | null;
  status: string | null;          // Stripe verbatim
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  has_subscription: boolean;
  updated_at: string | null;
}

const PLAN_ICONS: Record<string, any> = {
  starter: Sparkles,
  pro: Zap,
  enterprise: Crown,
};

const PLAN_ACCENTS: Record<string, string> = {
  starter: "#7DF9FF",
  pro: "#C58BFF",
  enterprise: "#FFC07D",
};

export default function StripeBillingCard() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // plan_id | "portal"
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, plansRes] = await Promise.all([
        authFetch("/api/billing/status").then(r => r.json()),
        authFetch("/api/billing/plans").then(r => r.json()),
      ]);
      setStripeConfigured(!!statusRes.stripe_configured && !!plansRes.stripe_configured);
      setSub(statusRes.subscription || null);
      setPlans(plansRes.plans || []);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

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
    setBusy(planId);
    setError(null);
    try {
      const r = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const d = await r.json();
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
      <div className="bg-white brutal-border border-8 p-12 flex items-center gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-ink" />
        <span className="text-[10px] font-black uppercase tracking-[0.4em] italic">LOADING_BILLING_STATE</span>
      </div>
    );
  }

  if (!stripeConfigured) {
    return (
      <div className="bg-amber-50 brutal-border border-8 border-amber-500 p-10 md:p-12 space-y-4">
        <div className="flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
          <h3 className="text-2xl font-black uppercase tracking-tighter font-display italic">STRIPE_NOT_CONFIGURED</h3>
        </div>
        <p className="text-sm text-amber-900 font-bold uppercase tracking-[0.2em] italic leading-relaxed">
          Set <code className="font-mono not-italic bg-amber-200 px-2 py-0.5">STRIPE_SECRET_KEY</code>,
          <code className="font-mono not-italic bg-amber-200 px-2 py-0.5 ml-1">STRIPE_WEBHOOK_SECRET</code>, and the
          per-plan price IDs (<code className="font-mono not-italic bg-amber-200 px-2 py-0.5">STRIPE_STARTER_PRICE_ID</code>,
          <code className="font-mono not-italic bg-amber-200 px-2 py-0.5 ml-1">_PRO_PRICE_ID</code>,
          <code className="font-mono not-italic bg-amber-200 px-2 py-0.5 ml-1">_ENTERPRISE_PRICE_ID</code>) to enable real billing.
          The simulator below still works for development.
        </p>
      </div>
    );
  }

  const hasActive = sub?.has_subscription && (sub.status === "active" || sub.status === "trialing");

  return (
    <div className="space-y-8">
      {/* Active subscription card */}
      {sub?.has_subscription && (
        <ActiveSubCard sub={sub} busy={busy === "portal"} onPortal={openPortal} />
      )}

      {error && (
        <div className="bg-rose-50 brutal-border border-4 border-rose-500 p-4 text-rose-700 text-xs font-mono uppercase tracking-wider">
          ⚠ {error}
        </div>
      )}

      {/* Plan picker */}
      <div className="bg-white brutal-border border-8 border-ink p-10 md:p-12 space-y-8">
        <div className="border-b-8 border-ink pb-6">
          <h3 className="text-3xl font-black uppercase tracking-tighter font-display italic">
            {hasActive ? "CHANGE_PLAN" : "ACTIVATE_BILLING"}
          </h3>
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic mt-2">
            {hasActive ? "Manage from the Stripe portal above for upgrades, downgrades, and cancellation." : "Pick a tier to start. Cancel any time."}
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map(plan => {
            const Icon = PLAN_ICONS[plan.id] || Building2;
            const accent = PLAN_ACCENTS[plan.id] || "#7DF9FF";
            const isCurrent = sub?.plan === plan.id && hasActive;
            const isBusy = busy === plan.id;
            return (
              <motion.div
                key={plan.id}
                whileHover={{ y: -4 }}
                className={cn(
                  "relative brutal-border border-8 border-ink p-8 flex flex-col gap-5",
                  isCurrent ? "bg-emerald-50" : "bg-white",
                )}
              >
                {isCurrent && (
                  <div className="absolute -top-4 right-4 bg-emerald-500 text-white px-3 py-1 brutal-border border-4 shadow-none text-[10px] font-black uppercase tracking-wider italic">
                    CURRENT
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div
                    className="w-14 h-14 brutal-border border-4 border-ink flex items-center justify-center"
                    style={{ background: accent }}
                  >
                    <Icon className="w-7 h-7 text-ink" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] italic text-muted">
                    {plan.max_agents} {plan.max_agents === 1 ? "AGENT" : "AGENTS"}
                  </span>
                </div>
                <div>
                  <h4 className="text-3xl font-black uppercase tracking-tighter font-display italic">{plan.name}</h4>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-5xl font-black font-display italic">${plan.price_usd_monthly}</span>
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-muted italic">/MO</span>
                  </div>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs font-bold uppercase tracking-wider text-ink/80 italic">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: accent }} strokeWidth={4} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => startCheckout(plan.id)}
                  disabled={isBusy || isCurrent || !plan.configured}
                  className={cn(
                    "brutal-btn !py-4 !text-[10px] !tracking-[0.3em] flex items-center justify-center gap-2 disabled:opacity-40",
                    isCurrent ? "!bg-zinc-200 !text-zinc-500" : "",
                  )}
                >
                  {isBusy
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : isCurrent
                      ? <>CURRENT</>
                      : <>{hasActive ? "SWITCH" : "SUBSCRIBE"} <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
                {!plan.configured && (
                  <p className="text-[9px] font-mono uppercase tracking-wider text-amber-600 text-center">
                    Price not configured ({plan.id} env var missing)
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic flex items-center gap-2 border-t-4 border-ink pt-6">
          <Shield className="w-3 h-3" />
          PAYMENTS_PROCESSED_BY_STRIPE · PCI_DSS_LEVEL_1 · YOU_CAN_CANCEL_ANYTIME
        </div>
      </div>
    </div>
  );
}

function ActiveSubCard({
  sub, busy, onPortal,
}: { sub: SubscriptionState; busy: boolean; onPortal: () => void }) {
  const accent = PLAN_ACCENTS[sub.plan || ""] || "#7DF9FF";
  const Icon = PLAN_ICONS[sub.plan || ""] || CreditCard;
  const renews = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const daysLeft = renews ? Math.max(0, Math.ceil((renews.getTime() - Date.now()) / 86_400_000)) : null;

  const statusBadge =
    sub.status === "active" ? { label: "ACTIVE", color: "bg-emerald-500" } :
    sub.status === "trialing" ? { label: "TRIAL", color: "bg-cyan-500" } :
    sub.status === "past_due" ? { label: "PAST_DUE", color: "bg-amber-500" } :
    sub.status === "canceled" ? { label: "CANCELED", color: "bg-rose-500" } :
    { label: (sub.status || "UNKNOWN").toUpperCase(), color: "bg-zinc-500" };

  return (
    <div className="bg-ink text-white brutal-border border-8 border-ink p-10 md:p-12 relative overflow-hidden">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: accent }} />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="flex items-center gap-6">
          <div
            className="w-20 h-20 brutal-border border-4 border-white flex items-center justify-center shrink-0"
            style={{ background: accent }}
          >
            <Icon className="w-10 h-10 text-ink" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic">CURRENT_PLAN</span>
              <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 brutal-border border-2 shadow-none italic text-white", statusBadge.color)}>
                {statusBadge.label}
              </span>
              {sub.cancel_at_period_end && (
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 brutal-border border-2 shadow-none italic bg-rose-500 text-white">
                  CANCELS_AT_PERIOD_END
                </span>
              )}
            </div>
            <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter font-display italic">
              {sub.plan_name || sub.plan || "—"}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60 italic">
              {sub.max_agents ? `${sub.max_agents} AGENT_NODES` : ""}
              {renews && (
                <>
                  {sub.max_agents ? " · " : ""}
                  RENEWS {renews.toLocaleDateString()}
                  {daysLeft !== null ? ` · ${daysLeft}D` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onPortal}
          disabled={busy}
          className="brutal-btn !bg-brand !text-ink !py-6 !px-8 !text-[11px] !tracking-[0.3em] flex items-center gap-3 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          MANAGE_SUBSCRIPTION
        </button>
      </div>
    </div>
  );
}
