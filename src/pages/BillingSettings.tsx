import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Button, Skeleton } from "../components/atoms";
import UsageMeter from "../components/UsageMeter";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { CONVERSATION_BALANCE_PRESETS_USD } from "../lib/conversation-balance";
import { conversationBalanceMinuteEstimates } from "../lib/voice-pricing-display";
import type { BillingStatusResponse } from "../types/api";

type SubscriptionState = BillingStatusResponse["subscription"];

type ConversationBalanceResponse = {
  balance_usd: number;
};

function formatUsd(value: number | null) {
  if (value === null) return "—";
  const absolute = Math.abs(value);
  return value < 0 ? `-$${absolute.toFixed(2)}` : `$${absolute.toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isPaidPlan(planId: string | null | undefined) {
  return Boolean(planId && planId !== "personal");
}

export default function BillingSettings() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>(null);
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

        if (statusRes.ok) {
          const data = (await statusRes.json()) as BillingStatusResponse;
          setSubscription(data.subscription ?? null);
        } else {
          setLoadError("Subscription status is temporarily unavailable.");
        }

        if (balanceRes.ok) {
          const data = (await balanceRes.json()) as ConversationBalanceResponse;
          setBalanceUsd(Number(data.balance_usd ?? 0));
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

  const plan = useMemo(
    () =>
      STRIPE_PLANS.find((item) => item.id === subscription?.plan_id) ??
      STRIPE_PLANS.find((item) => item.id === "personal")!,
    [subscription?.plan_id],
  );
  const paidPlan = isPaidPlan(subscription?.plan_id);
  const hasSubscription = Boolean(paidPlan && subscription?.has_subscription);
  const planStatus = subscription?.status?.replace(/_/g, " ") || "free builder";
  const balanceDue = Math.max(0, -(balanceUsd ?? 0));
  const balanceMinuteEstimates = conversationBalanceMinuteEstimates();

  async function addBalance(amountUsd: number) {
    if (!paidPlan) {
      setActionError("Choose Starter, Starter Plus, Pro, or Business before adding Conversation Balance.");
      return;
    }
    setTopUpBusy(amountUsd);
    setActionError(null);
    try {
      const response = await authFetch("/api/conversation-balance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amountUsd }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start checkout.");
      setTopUpBusy(null);
    }
  }

  async function openBillingPortal() {
    setPortalBusy(true);
    setActionError(null);
    try {
      const response = await authFetch("/api/billing/portal", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "Could not open billing portal.");
      window.location.href = data.url;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not open billing portal.");
      setPortalBusy(false);
    }
  }

  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />

        {loadError ? (
          <div
            className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {loadError}
          </div>
        ) : null}

        <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Current plan
              </p>
              {loading ? (
                <div className="mt-4 space-y-3" aria-busy="true">
                  <Skeleton shape="text" className="h-10 w-56" />
                  <Skeleton shape="text" className="h-4 w-full max-w-md" />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <h1 className="font-[var(--wireline-font-family-display)] text-[clamp(1.85rem,1.45rem+1.8vw,2.65rem)] font-normal leading-none tracking-[-0.04em] text-foreground">
                      {subscription?.plan_name || plan.name}
                    </h1>
                    <Badge variant={planStatus === "active" ? "success" : "outline"}>
                      {planStatus}
                    </Badge>
                  </div>
                  <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
                    {paidPlan
                      ? `${plan.max_agents} live AI employee${plan.max_agents === 1 ? "" : "s"}, up to ${plan.included_phone_numbers} on-demand production number${plan.included_phone_numbers === 1 ? "" : "s"}, and ${plan.voice_minutes_monthly.toLocaleString()} pooled live-call minutes each month. Lead Hunt and connected email workflows are available; variable SMS, enrichment, and extra voice usage draw from prepaid balance.`
                      : "Build, train, and privately simulate one draft AI employee. Choose a paid plan before provisioning a production number or running paid provider actions."}
                  </p>
                </>
              )}
            </div>

            {!loading ? (
              <div className="flex flex-wrap gap-2">
                {!paidPlan ? (
                  <Button asChild disableAnimations>
                    <Link to="/pricing">Choose a live plan</Link>
                  </Button>
                ) : null}
                {hasSubscription ? (
                  <Button
                    type="button"
                    disableAnimations
                    variant="secondary"
                    onClick={() => void openBillingPortal()}
                    disabled={portalBusy}
                    className="inline-flex gap-2"
                  >
                    {portalBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ExternalLink className="size-4" aria-hidden="true" />
                    )}
                    Manage in Stripe
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {paidPlan ? <UsageMeter onUpgrade={() => (window.location.href = "/pricing")} /> : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="wl-paper wl-paper-elevated flex min-h-[250px] flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Conversation Balance
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Prepaid funding for additional voice, SMS segments, provider-backed enrichment, and other variable channel work.
                </p>
              </div>
              <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </div>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading balance…</span>
              </div>
            ) : (
              <>
                <p className={`wl-display-3 mt-6 ${balanceDue > 0 ? "text-destructive" : "text-foreground"}`}>
                  {balanceDue > 0 ? `$${balanceDue.toFixed(2)} due` : formatUsd(balanceUsd)}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {!paidPlan
                    ? "Conversation Balance becomes available after a live plan is active."
                    : balanceDue > 0
                      ? "A previous active call finished normally after coverage ran out. Restore this amount before another paid provider action."
                      : "Included plan capacity is used first. Additional variable usage draws only from this balance—never an automatic postpaid overage invoice."}
                </p>

                {paidPlan ? (
                  <div className="mt-5 flex flex-wrap gap-2">
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
                          title={minutes > 0 ? `Approximately ${minutes.toLocaleString()} additional voice minutes at the published blended rate` : undefined}
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
                ) : (
                  <Button asChild variant="outline" size="sm" className="mt-5 self-start">
                    <Link to="/pricing">Compare live plans</Link>
                  </Button>
                )}
              </>
            )}
          </article>

          <article className="wl-paper wl-paper-elevated flex min-h-[250px] flex-col p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Subscription
            </p>
            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Loading subscription…</span>
              </div>
            ) : hasSubscription ? (
              <>
                <p className="mt-6 font-[var(--wireline-font-family-display)] text-3xl leading-none tracking-[-0.04em] text-foreground">
                  Renews {formatDate(subscription?.current_period_end)}
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Stripe is the source of truth for your renewal amount, billing interval, payment method, invoices, cancellation, discounts, and tax details.
                </p>
                <Button
                  type="button"
                  disableAnimations
                  variant="outline"
                  size="sm"
                  onClick={() => void openBillingPortal()}
                  disabled={portalBusy}
                  className="mt-5 self-start gap-2"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  View invoices and payment method
                </Button>
              </>
            ) : (
              <>
                <p className="mt-6 font-[var(--wireline-font-family-display)] text-3xl leading-none tracking-[-0.04em] text-foreground">
                  No recurring invoice
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Free Builder creates no production telephony or recurring subscription cost. Activate only when an agent is trained and ready for live work.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-5 self-start">
                  <Link to="/pricing">View Founder Early Access plans</Link>
                </Button>
              </>
            )}
          </article>
        </section>

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
