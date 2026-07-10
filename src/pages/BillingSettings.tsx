import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Button, Skeleton } from "../components/atoms";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";
import {
  conversationBalanceMinuteEstimates,
  publishedVoiceRates,
} from "../lib/voice-pricing-display";

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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [statusRes, balanceRes] = await Promise.all([
          authFetch("/api/billing/status"),
          authFetch("/api/conversation-balance"),
        ]);
        if (cancelled) return;
        if (!statusRes.ok && !balanceRes.ok) {
          setLoadError("Couldn't load billing details. Refresh or try again in a moment.");
          return;
        }
        if (statusRes.ok) {
          const data = await statusRes.json();
          setSubscription(data.subscription ?? null);
        } else {
          setLoadError("Subscription status is temporarily unavailable.");
        }
        if (balanceRes.ok) {
          const data = await balanceRes.json();
          setBalanceUsd(data.balance_usd ?? 0);
        } else if (statusRes.ok) {
          setLoadError("Conversation Balance is temporarily unavailable.");
        }
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load billing details. Check your connection and try again.");
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
  const zeroMonthly = activePlan.monthly <= 0;
  const monthlyPrice = zeroMonthly ? "$0" : `$${activePlan.monthly}/mo`;
  const invoiceTotal = `$${activePlan.monthly}.00`;
  const planStatus = subscription?.status?.replace(/_/g, " ") || (hasSubscription ? "active" : "personal");
  const balanceFill =
    balanceUsd !== null && balanceUsd > 0 ? Math.min(100, Math.round((balanceUsd / 500) * 100)) : 0;
  const balanceMinuteEstimates = conversationBalanceMinuteEstimates();
  const personalVoiceRate = publishedVoiceRates()[0]?.rateUsd ?? 0.2;

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
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />

        {loadError && (
          <div
            className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {loadError}
          </div>
        )}

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Current plan
              </h2>
              {loading ? (
                <div className="mt-4 space-y-3" aria-busy="true">
                  <Skeleton shape="text" className="h-10 w-56" />
                  <Skeleton shape="text" className="h-4 w-full max-w-md" />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <h2 className="font-[var(--wireline-font-family-display)] text-[clamp(1.85rem,1.45rem+1.8vw,2.65rem)] font-normal leading-none tracking-[-0.04em] text-foreground">
                      {subscription?.plan_name || activePlan.name}
                    </h2>
                    <Badge variant={planStatus === "active" ? "success" : "outline"}>
                      {planStatus}
                    </Badge>
                  </div>
                  <p className="mt-3 max-w-[64ch] text-sm leading-6 text-muted-foreground">
                    {zeroMonthly
                      ? "Founder access is active. Conversation Balance still controls live usage."
                      : activePlan.features}
                  </p>
                </>
              )}
            </div>
            {!loading ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3 lg:min-w-40">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Monthly
                </p>
                <p className="mt-1 font-[var(--wireline-font-family-display)] text-3xl leading-none tracking-[-0.04em] text-foreground">
                  {monthlyPrice}
                </p>
              </div>
            ) : null}
          </div>

          {hasSubscription ? (
            <Button
              type="button"
              disableAnimations
              variant="secondary"
              onClick={() => void openBillingPortal()}
              disabled={portalBusy}
              className="mt-5 inline-flex gap-2"
            >
              {portalBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink className="size-4" aria-hidden="true" />
              )}
              Manage subscription
            </Button>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="wl-paper wl-paper-elevated flex min-h-[168px] flex-col p-5">
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
                {balanceUsd !== null && balanceUsd <= 0 ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Add balance before your first live call — usage draws down as conversations run.
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Voice draws at ${personalVoiceRate.toFixed(2)}/min from balance — top-ups below
                    show approximate minutes.
                  </p>
                )}
                <div className="mt-5 h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${balanceFill}%` }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {CONVERSATION_BALANCE_PRESETS_USD.map((amount) => {
                    const minutes =
                      balanceMinuteEstimates.find((row) => row.amountUsd === amount)?.minutes ?? 0;
                    return (
                      <Button
                        key={amount}
                        type="button"
                        disableAnimations
                        variant="outline"
                        size="sm"
                        onClick={() => void addBalance(amount)}
                        disabled={topUpBusy !== null}
                        className="gap-1.5"
                        title={
                          minutes > 0 ? `≈ ${minutes.toLocaleString()} voice minutes` : undefined
                        }
                      >
                        {topUpBusy === amount ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Plus className="size-3.5" aria-hidden="true" />
                        )}
                        ${amount}
                      </Button>
                    );
                  })}
                </div>
              </>
            )}
          </article>
          <article className="wl-paper wl-paper-elevated flex min-h-[168px] flex-col p-5">
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
                <p className="wl-display-3 mt-auto pt-4">
                  {zeroMonthly ? "No charge" : invoiceTotal}
                </p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {zeroMonthly ? "Included through" : "Due"} {formatInvoiceDate(subscription?.current_period_end ?? null)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-auto pt-4 text-sm leading-6 text-muted-foreground">
                  No subscription invoice on Personal — Conversation Balance funds live work as you go.
                </p>
                <Link
                  to="/pricing"
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Compare paid plans
                </Link>
              </>
            )}
          </article>
        </section>

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
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
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/35 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {formatInvoiceDate(subscription.current_period_end)}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {zeroMonthly ? "No charge" : invoiceTotal}
                </p>
                <Badge variant="outline">
                  {(subscription.status || "active").replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No invoices yet</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Personal runs on Conversation Balance. Team and Business add a monthly subscription
                with invoices here.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/pricing">View plans</Link>
              </Button>
            </div>
          )}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
