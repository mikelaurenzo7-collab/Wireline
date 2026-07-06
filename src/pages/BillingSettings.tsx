import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";

import { Badge, Button, Skeleton } from "../components/atoms";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";

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
  const [portalBusy, setPortalBusy] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("balance") === "success" || params.get("billing") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const activePlan = planDetails(subscription?.plan ?? null);
  const hasSubscription = Boolean(subscription?.plan && subscription?.current_period_end);
  const monthlyPrice = activePlan.monthly > 0 ? `$${activePlan.monthly}/mo` : "$0";
  const invoiceTotal = `$${activePlan.monthly}.00`;
  const balanceFill =
    balanceUsd !== null && balanceUsd > 0 ? Math.min(100, Math.round((balanceUsd / 500) * 100)) : 0;

  async function addBalance(amountUsd: number) {
    setTopUpBusy(amountUsd);
    setActionError(null);
    try {
      const res = await authFetch("/api/conversation-balance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amountUsd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not start checkout.");
      setTopUpBusy(null);
    }
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setActionError(null);
    try {
      const res = await authFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Could not open billing portal.");
      window.location.href = data.url;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not open billing portal.");
      setPortalBusy(false);
    }
  }

  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame narrow>
        <SettingsTabs />

        <section className="rounded-[16px] border border-primary/20 bg-primary p-6 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground/70">
            Current plan
          </h2>
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
              {subscription?.status ? (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60">
                  Status · {subscription.status.replace(/_/g, " ")}
                </p>
              ) : null}
              {hasSubscription ? (
                <Button
                  type="button"
                  disableAnimations
                  variant="outline"
                  onClick={() => void openBillingPortal()}
                  disabled={portalBusy}
                  className="mt-5 inline-flex gap-2 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                >
                  {portalBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="size-4" aria-hidden="true" />
                  )}
                  Manage subscription
                </Button>
              ) : null}
            </>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="studio-card flex min-h-[148px] flex-col p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Conversation Balance
            </h2>
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
                <div className="mt-4 flex flex-wrap gap-2">
                  {CONVERSATION_BALANCE_PRESETS_USD.map((amount) => (
                    <Button
                      key={amount}
                      type="button"
                      disableAnimations
                      variant="outline"
                      size="sm"
                      onClick={() => void addBalance(amount)}
                      disabled={topUpBusy !== null}
                      className="gap-1.5"
                    >
                      {topUpBusy === amount ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3.5" aria-hidden="true" />
                      )}
                      ${amount}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </article>
          <article className="studio-card flex min-h-[148px] flex-col p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Next invoice
            </h2>
            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading billing…</span>
              </div>
            ) : hasSubscription ? (
              <>
                <p className="wl-display-3 mt-auto pt-4">{invoiceTotal}</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Due {formatInvoiceDate(subscription?.current_period_end ?? null)}
                </p>
              </>
            ) : (
              <p className="wl-display-3 mt-auto pt-4">—</p>
            )}
          </article>
        </section>

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <section className="studio-card p-5 sm:p-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Recent invoices
          </h2>
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
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              —
            </p>
          )}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
