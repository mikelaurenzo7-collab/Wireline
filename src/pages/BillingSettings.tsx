import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Skeleton } from "../components/atoms";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";

type SubscriptionState = {
  plan: string | null;
  plan_name: string | null;
  status: string | null;
  current_period_end: string | null;
};

function formatUsd(value: number | null) {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

function formatInvoiceDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function planDetails(planId: string | null) {
  // No subscription means the free Personal tier — never fabricate a paid
  // plan or an invoice amount the account does not actually carry.
  const plan =
    STRIPE_PLANS.find((item) => item.id === planId) ??
    STRIPE_PLANS.find((item) => item.id === "personal");
  if (!plan) return { name: "Wireline Personal", monthly: 0, features: "1 agent · 1 line" };
  const capacity = `${plan.max_agents} agent${plan.max_agents === 1 ? "" : "s"} · ${plan.included_phone_numbers} line${plan.included_phone_numbers === 1 ? "" : "s"}`;
  return {
    name: plan.name,
    monthly: plan.price_usd_monthly,
    features:
      plan.id === "personal"
        ? `${capacity} · Conversation Balance funds live work`
        : `${capacity} · Routing · Approvals · Shared inbox`,
  };
}

export default function BillingSettings() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [statusRes, balanceRes] = await Promise.all([
          authFetch("/api/billing/status"),
          authFetch("/api/conversation-balance"),
        ]);
        if (cancelled) return;
        if (statusRes.ok) {
          const data = await statusRes.json();
          setSubscription(data.subscription ?? null);
        }
        if (balanceRes.ok) {
          const data = await balanceRes.json();
          setBalanceUsd(data.balance_usd ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePlan = planDetails(subscription?.plan ?? null);
  const hasSubscription = Boolean(subscription?.plan && subscription?.current_period_end);
  const monthlyPrice = activePlan.monthly > 0 ? `$${activePlan.monthly}/mo` : "$0";
  const invoiceTotal = `$${activePlan.monthly}.00`;
  const balanceFill =
    balanceUsd !== null && balanceUsd > 0 ? Math.min(100, Math.round((balanceUsd / 500) * 100)) : 0;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame narrow>
        <SettingsTabs />

        <section className="rounded-[16px] border border-primary/20 bg-primary p-6 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
          <p className={WL_APP_CLASSES.wiredEyebrow}>Current plan</p>
          {loading ? (
            <div className="mt-4 space-y-3" aria-busy="true">
              <Skeleton shape="text" className="h-10 w-48 bg-primary-foreground/20" />
              <Skeleton shape="text" className="h-4 w-full max-w-md bg-primary-foreground/15" />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <h2 className="font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,1.4rem+1.6vw,2.4rem)] font-normal leading-none tracking-[-0.035em]">
                  {subscription?.plan_name || activePlan.name}
                </h2>
                <span className="pb-1 font-[var(--wireline-font-family-display)] text-[clamp(1.5rem,1.2rem+1.4vw,2rem)] leading-none tracking-[-0.035em]">
                  — {monthlyPrice}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-primary-foreground/78">
                {activePlan.features}
              </p>
              {subscription?.status ? (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60">
                  Status · {subscription.status.replace(/_/g, " ")}
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="studio-card flex min-h-[148px] flex-col p-5">
            <p className={WL_APP_CLASSES.wiredEyebrow}>Conversation Balance</p>
            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading balance…</span>
              </div>
            ) : (
              <>
                <p className="wl-display-3 mt-auto pt-4">{formatUsd(balanceUsd)}</p>
                <div className="mt-5 h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${balanceFill}%` }}
                  />
                </div>
              </>
            )}
          </article>
          <article className="studio-card flex min-h-[148px] flex-col p-5">
            <p className={WL_APP_CLASSES.wiredEyebrow}>Next invoice</p>
            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading billing…</span>
              </div>
            ) : hasSubscription ? (
              <>
                <p className="wl-display-3 mt-auto pt-4">{invoiceTotal}</p>
                <p className="mt-5 text-sm text-muted-foreground">
                  Due {formatInvoiceDate(subscription?.current_period_end ?? null)}
                </p>
              </>
            ) : (
              <>
                <p className="wl-display-3 mt-auto pt-4">—</p>
                <p className="mt-5 text-sm text-muted-foreground">No subscription</p>
              </>
            )}
          </article>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <p className={WL_APP_CLASSES.wiredEyebrow}>Recent invoices</p>
          {loading ? (
            <div className="mt-4 grid gap-2" aria-busy="true">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} shape="text" className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : subscription?.current_period_end ? (
            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/35 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {formatInvoiceDate(subscription.current_period_end)}
                </p>
                <p className="text-sm font-semibold text-foreground">{invoiceTotal}</p>
                <Badge variant="outline">
                  {(subscription.status || "active").replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No invoices yet</p>
          )}
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                Clear commercial model
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Plans add capacity. Conversation Balance pays for live calls, texts, and
                provider-backed actions.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              View pricing <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
