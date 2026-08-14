import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules/StatusNotice";
import StripeBillingCard from "../components/StripeBillingCard";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_PRESETS_USD,
} from "../lib/conversation-balance";
import { conversationBalanceMinuteEstimates } from "../lib/voice-pricing-display";
import type { BillingStatusResponse } from "../types/api";

type SubscriptionState = BillingStatusResponse["subscription"];

type ConversationBalanceResponse = {
  balance_usd: number;
};

type CheckoutReturnNotice = {
  tone: "info" | "success";
  title: string;
  message: string;
};

function formatUsd(value: number | null) {
  if (value === null) return "—";
  const absolute = Math.abs(value);
  return value < 0 ? `-$${absolute.toFixed(2)}` : `$${absolute.toFixed(2)}`;
}

function isPaidPlan(planId: string | null | undefined) {
  return Boolean(planId && planId !== "personal");
}

export default function BillingSettings() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [topUpBusy, setTopUpBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutReturnNotice, setCheckoutReturnNotice] = useState<CheckoutReturnNotice | null>(
    null,
  );
  // A failed status read must never masquerade as an unpaid/free workspace.
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      setCheckoutReturnNotice(null);
      try {
        // Prove a returning Checkout Session before reading status so the page
        // is correct even when Stripe webhook delivery is delayed. The webhook
        // remains the primary writer; verification is idempotent against it.
        const params = new URLSearchParams(window.location.search);
        const returnedSessionId = params.get("session_id");
        const returnFlow =
          params.get("billing") === "success"
            ? "plan"
            : params.get("balance") === "success"
              ? "runtime_balance"
              : params.get("live_video") === "success"
                ? "live_video"
                : null;
        if (returnFlow && returnedSessionId) {
          const verifyResponse = await authFetch("/api/billing/checkout/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: returnedSessionId }),
          }).catch(() => null);
          const verification = verifyResponse?.ok
            ? ((await verifyResponse.json().catch(() => null)) as {
                payment_status?: string;
                synced?: boolean;
                credit_granted?: boolean;
                live_video_enabled?: boolean;
              } | null)
            : null;
          if (verification) {
            if (verification.payment_status === "unpaid") {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Payment processing",
                message:
                  returnFlow === "runtime_balance"
                    ? "Your Runtime Balance will update automatically after Stripe confirms the funds."
                    : returnFlow === "live_video"
                      ? "Live video will activate automatically after Stripe confirms the funds."
                      : "Your plan will activate automatically after Stripe confirms the funds.",
              });
            } else if (returnFlow === "runtime_balance" && verification.credit_granted) {
              setCheckoutReturnNotice({
                tone: "success",
                title: "Runtime Balance added",
                message: "Your prepaid balance is ready for calls, texts, and live work.",
              });
            } else if (returnFlow === "live_video" && verification.live_video_enabled) {
              setCheckoutReturnNotice({
                tone: "success",
                title: "Live video activated",
                message: "Your workspace can now use the live video add-on.",
              });
            } else if (returnFlow === "plan" && verification.synced) {
              setCheckoutReturnNotice({
                tone: "success",
                title: "Plan confirmed",
                message: "Your Wireline plan and workspace access are up to date.",
              });
            }
          }
        }

        const [statusRes, balanceRes] = await Promise.all([
          authFetch("/api/billing/status"),
          authFetch("/api/conversation-balance"),
        ]);
        if (cancelled) return;

        if (statusRes.ok) {
          const data = (await statusRes.json().catch(() => null)) as BillingStatusResponse | null;
          if (data) {
            setSubscription(data.subscription ?? null);
            setStatusUnavailable(false);
          } else {
            setStatusUnavailable(true);
            setLoadError("Subscription status is temporarily unavailable.");
          }
        } else {
          setStatusUnavailable(true);
          setLoadError("Subscription status is temporarily unavailable.");
        }

        // A malformed balance body degrades only the balance line; it must not
        // erase a successfully loaded subscription state.
        const balanceData = balanceRes.ok
          ? ((await balanceRes.json().catch(() => null)) as ConversationBalanceResponse | null)
          : null;
        if (balanceData) {
          setBalanceUsd(Number(balanceData.balance_usd ?? 0));
        } else if (statusRes.ok) {
          setLoadError(`${CONVERSATION_BALANCE_COPY.title} is temporarily unavailable.`);
        }
      } catch {
        if (!cancelled) {
          setStatusUnavailable(true);
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
    if (
      params.get("balance") === "success" ||
      params.get("billing") === "success" ||
      params.get("live_video") === "success"
    ) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const plan = useMemo(
    () => STRIPE_PLANS.find((item) => item.id === subscription?.plan_id) ?? null,
    [subscription?.plan_id],
  );
  const paidPlan = isPaidPlan(subscription?.plan_id) && Boolean(plan && plan.id !== "personal");
  const canAddBalance =
    !statusUnavailable &&
    paidPlan &&
    (subscription?.status === "active" || subscription?.status === "trialing");
  const balanceDue = Math.max(0, -(balanceUsd ?? 0));
  const balanceMinuteEstimates = conversationBalanceMinuteEstimates();

  async function addBalance(amountUsd: number) {
    if (!canAddBalance) {
      setActionError(
        statusUnavailable
          ? "Billing status is unavailable. Retry before adding Runtime Balance."
          : paidPlan
            ? "Restore your active subscription before adding Runtime Balance."
            : "Choose Starter, Starter Plus, Pro, or Business before adding Runtime Balance.",
      );
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

  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <SettingsTabs />
        <WorkspacePageIntro title="Billing" titleHidden />

        {checkoutReturnNotice ? (
          <StatusNotice
            tone={checkoutReturnNotice.tone}
            title={checkoutReturnNotice.title}
            className="mb-6"
            aria-live="polite"
          >
            {checkoutReturnNotice.message}
          </StatusNotice>
        ) : null}

        {loadError ? (
          <StatusNotice tone="destructive" title="Billing details need attention" className="mb-6">
            {loadError}
          </StatusNotice>
        ) : null}

        {/*
         * Canonical plan surface: current plan or plan picker, plan usage,
         * Live Video add-on, invoices/payment/cancel management. Billing owns
         * the actual balance ledger below, so the generic duplicate top-up card
         * is intentionally suppressed here.
         */}
        <StripeBillingCard showBalanceTopUp={false} />

        {!loading && !statusUnavailable && paidPlan && plan ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Plan capacity · {plan.included_phone_numbers} live number
            {plan.included_phone_numbers === 1 ? "" : "s"} included
          </p>
        ) : null}

        <section className="mt-6">
          <article className="wl-paper wl-paper-elevated p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-eyebrow text-muted-foreground">
                  {CONVERSATION_BALANCE_COPY.title}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Prepaid coverage for live voice, SMS, and enrichment beyond included plan usage.
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
                <p
                  className={`wl-display-3 mt-6 ${balanceDue > 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {balanceDue > 0 ? `$${balanceDue.toFixed(2)} due` : formatUsd(balanceUsd)}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {statusUnavailable
                    ? "Billing status could not be verified. No balance action is available until it reloads."
                    : !canAddBalance
                      ? "Available after a live plan is active."
                      : balanceDue > 0
                        ? "A previous live action finished after coverage ran out. Restore this amount before another paid action."
                        : "Extra usage draws only from this balance — never an automatic overage invoice."}
                </p>

                {canAddBalance ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {CONVERSATION_BALANCE_PRESETS_USD.map((amount) => {
                      const minutes =
                        balanceMinuteEstimates.find((row) => row.amountUsd === amount)?.minutes ??
                        0;
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
                            minutes > 0
                              ? `Approximately ${minutes.toLocaleString()} additional voice minutes at the published blended rate`
                              : undefined
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
                ) : null}
              </>
            )}
          </article>
        </section>

        {actionError ? (
          <StatusNotice tone="destructive" title="Billing action unavailable" className="mt-4">
            {actionError}
          </StatusNotice>
        ) : null}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
