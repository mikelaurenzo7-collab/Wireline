import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules/StatusNotice";
import StripeBillingCard, {
  BillingTrustFooter,
  type CheckoutAvailability,
} from "../components/StripeBillingCard";
import SettingsTabs from "../components/settings/SettingsTabs";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";
import {
  activatedPostCreateWizard,
  checkoutReturnFlowFromSearch,
  checkoutReturnUrlWithoutProof,
  classifyCheckoutReturn,
  hasCheckoutReturnToVerify,
  shouldFinalizeCheckoutReturn,
  shouldResumePostCreateLaunch,
  type CheckoutReturnOutcome,
  type CheckoutReturnVerification,
} from "../lib/billing-checkout-return";
import {
  readPostCreateWizard,
  readPostCreateWizardStep,
  updatePostCreateWizard,
} from "../lib/wireline-create-flow";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import {
  CONVERSATION_BALANCE_COPY,
  CONVERSATION_BALANCE_PRESETS_USD,
} from "../lib/conversation-balance";
import { conversationBalanceMinuteEstimates } from "../lib/voice-pricing-display";
import type { BillingStatusResponse } from "../types/api";
import RuntimeBalanceActivity, {
  readRuntimeBalanceEntries,
  type RuntimeBalanceEntry,
} from "../components/RuntimeBalanceActivity";

type SubscriptionState = BillingStatusResponse["subscription"];

type ConversationBalanceResponse = {
  balance_usd: number;
  ledger?: unknown;
};

type CheckoutReturnNotice = {
  tone: "info" | "success";
  title: string;
  message: string;
};

function formatUsd(value: number | null) {
  if (value === null) return "N/A";
  const absolute = Math.abs(value);
  return value < 0 ? `-$${absolute.toFixed(2)}` : `$${absolute.toFixed(2)}`;
}

function isPaidPlan(planId: string | null | undefined) {
  return Boolean(planId && planId !== "personal");
}

const CHECKOUT_VERIFY_RETRY_DELAYS_MS = [0, 1_000, 2_500] as const;

function waitForCheckoutRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export default function BillingSettings() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [balanceEntries, setBalanceEntries] = useState<RuntimeBalanceEntry[] | null>(null);
  const [activityUnavailable, setActivityUnavailable] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutReturnNotice, setCheckoutReturnNotice] = useState<CheckoutReturnNotice | null>(
    null,
  );
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [checkoutAvailability, setCheckoutAvailability] = useState<CheckoutAvailability>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [billingReady, setBillingReady] = useState(() =>
    typeof window === "undefined" ? true : !hasCheckoutReturnToVerify(window.location.search),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      setCheckoutReturnNotice(null);
      try {
        const params = new URLSearchParams(window.location.search);
        const returnedSessionId = params.get("session_id");
        const returnFlow = checkoutReturnFlowFromSearch(window.location.search);
        let checkoutOutcome: CheckoutReturnOutcome | null = null;
        let verification: CheckoutReturnVerification | null = null;
        let resumePostCreateLaunch = false;
        const resumeWizardAgentId = readPostCreateWizard()?.agentId ?? null;

        if (returnFlow && returnedSessionId) {
          for (const retryDelayMs of CHECKOUT_VERIFY_RETRY_DELAYS_MS) {
            if (retryDelayMs > 0) await waitForCheckoutRetry(retryDelayMs);
            if (cancelled) return;

            const verifyResponse = await authFetch("/api/billing/checkout/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: returnedSessionId }),
            }).catch(() => null);
            const candidate = verifyResponse?.ok
              ? ((await verifyResponse
                  .json()
                  .catch(() => null)) as CheckoutReturnVerification | null)
              : null;
            if (candidate) verification = candidate;
            checkoutOutcome = classifyCheckoutReturn(
              returnFlow,
              verifyResponse?.status ?? null,
              candidate,
            );
            if (shouldFinalizeCheckoutReturn(checkoutOutcome)) break;
          }

          if (!cancelled) {
            if (checkoutOutcome === "fulfilled" && verification) {
              if (returnFlow === "runtime_balance" && verification.credit_granted) {
                setCheckoutReturnNotice({
                  tone: "success",
                  title: "Runtime Balance Added",
                  message: "Your prepaid balance is ready for calls, texts, and live work.",
                });
              } else if (returnFlow === "plan" && verification.synced) {
                setCheckoutReturnNotice({
                  tone: "success",
                  title: "Plan Confirmed",
                  message: "Your BotBound plan and workspace access are up to date.",
                });
              }
            } else if (checkoutOutcome === "retired") {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Legacy Checkout Reconciled",
                message:
                  "Live video is retired and was not activated. Any legacy billing record was preserved for support review.",
              });
            } else if (checkoutOutcome === "expired") {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Checkout Expired",
                message: "No payment was completed. Your current billing options are shown below.",
              });
            } else if (checkoutOutcome === "pending") {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Payment Processing",
                message:
                  returnFlow === "runtime_balance"
                    ? "Your Runtime Balance will update automatically after payment is confirmed."
                    : returnFlow === "live_video"
                      ? "This legacy checkout is still processing. Live video remains retired and no new activation will be granted."
                      : "Your plan will activate automatically after payment is confirmed.",
              });
            } else if (checkoutOutcome === "invalid") {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Checkout Reference Unavailable",
                message:
                  "This checkout could not be matched to your account. Your current billing status is shown below.",
              });
            } else {
              setCheckoutReturnNotice({
                tone: "info",
                title: "Still Confirming Checkout",
                message:
                  "We could not confirm this checkout yet. Its secure reference has been retained, so refreshing this page will retry safely.",
              });
            }

            resumePostCreateLaunch = checkoutOutcome
              ? shouldResumePostCreateLaunch(
                  returnFlow,
                  checkoutOutcome,
                  Boolean(readPostCreateWizard()),
                  readPostCreateWizardStep(),
                )
              : false;
          }
        }

        const finalizeCheckoutReturn =
          Boolean(returnFlow && !returnedSessionId) ||
          Boolean(checkoutOutcome && shouldFinalizeCheckoutReturn(checkoutOutcome));
        if (finalizeCheckoutReturn && !cancelled) {
          // This page is the sole owner of Stripe return reconciliation and
          // query cleanup. Keep session_id across transient/delayed outcomes;
          // remove it only after fulfillment, expiry, or a definitive invalid response.
          window.history.replaceState(
            window.history.state,
            "",
            checkoutReturnUrlWithoutProof(
              window.location.pathname,
              window.location.search,
              window.location.hash,
            ),
          );
        }
        if (resumePostCreateLaunch && !cancelled && returnFlow && checkoutOutcome) {
          const wizard = activatedPostCreateWizard(
            returnFlow,
            checkoutOutcome,
            resumeWizardAgentId,
            readPostCreateWizard(),
            readPostCreateWizardStep(),
          );
          // Persist the fulfilled plan before reopening this same Bot's guide.
          // A dismissed or replaced guide must not be resumed by a late return.
          if (wizard && updatePostCreateWizard(wizard)) {
            window.location.replace("/studio");
            return;
          }
        }
        if (!cancelled) setBillingReady(true);

        const [statusRes, balanceRes] = await Promise.all([
          authFetch("/api/billing/status"),
          authFetch("/api/conversation-balance"),
        ]);
        if (cancelled) return;

        if (statusRes.ok) {
          const data = (await statusRes.json().catch(() => null)) as BillingStatusResponse | null;
          if (cancelled) return;
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

        const balanceData = balanceRes.ok
          ? ((await balanceRes.json().catch(() => null)) as ConversationBalanceResponse | null)
          : null;
        if (cancelled) return;
        if (balanceData && Number.isFinite(balanceData.balance_usd)) {
          setBalanceUsd(balanceData.balance_usd);
          const entries = readRuntimeBalanceEntries(balanceData.ledger);
          if (entries) setBalanceEntries(entries);
          setActivityUnavailable(entries === null);
        } else {
          setActivityUnavailable(true);
          if (statusRes.ok) {
            setLoadError(`${CONVERSATION_BALANCE_COPY.title} is temporarily unavailable.`);
          }
        }
      } catch {
        if (!cancelled) {
          setStatusUnavailable(true);
          setActivityUnavailable(true);
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
  }, [refreshKey]);

  function retryBilling() {
    // Keep the card mounted so plan/interval choices survive. Both surfaces
    // refresh together, after any retained Checkout proof is reconciled again.
    setLoading(true);
    setCheckoutAvailability("loading");
    setBillingReady(!hasCheckoutReturnToVerify(window.location.search));
    setRefreshKey((current) => current + 1);
  }

  const plan = useMemo(
    () => STRIPE_PLANS.find((item) => item.id === subscription?.plan_id) ?? null,
    [subscription?.plan_id],
  );
  const paidPlan = isPaidPlan(subscription?.plan_id) && Boolean(plan && plan.id !== "personal");
  const canAddBalance =
    !loading &&
    billingReady &&
    checkoutAvailability === "available" &&
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
          : checkoutAvailability !== "available"
            ? "Balance top-ups are unavailable. Refresh this page to check again."
            : paidPlan
              ? "Restore your active subscription before adding Runtime Balance."
              : "Choose a paid plan before adding Runtime Balance.",
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
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="narrow">
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
          <StatusNotice
            tone="destructive"
            title="Billing Details Need Attention"
            className="mb-6"
            action={
              checkoutAvailability !== "unavailable" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loading}
                  onClick={retryBilling}
                >
                  Retry
                </Button>
              ) : undefined
            }
          >
            {loadError}
          </StatusNotice>
        ) : null}

        <StripeBillingCard
          showBalanceTopUp={false}
          showUsageBalance={false}
          showTrustFooter={false}
          billingReady={billingReady}
          refreshKey={refreshKey}
          onRetry={retryBilling}
          onCheckoutAvailabilityChange={setCheckoutAvailability}
        />

        {!loading && !statusUnavailable && paidPlan && plan ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Plan capacity · {plan.included_phone_numbers} live number
            {plan.included_phone_numbers === 1 ? "" : "s"} included
          </p>
        ) : null}

        <section className="mt-6">
          <article className="wl-paper wl-paper-elevated p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-6 text-foreground">
                  {CONVERSATION_BALANCE_COPY.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Prepaid voice, SMS, and generated work beyond your plan.
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
                    : checkoutAvailability === "loading"
                      ? "Checking top-up availability…"
                      : checkoutAvailability === "unavailable"
                        ? "Top-up status is unavailable. Refresh this page to retry."
                        : checkoutAvailability === "paused"
                          ? "Balance top-ups are paused. Check back later."
                          : !canAddBalance
                            ? "Available after a live plan is active."
                            : balanceDue > 0
                              ? "A previous live action finished after coverage ran out. Restore this amount before another paid action."
                              : "Extra usage draws only from this balance, never an automatic overage invoice."}
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
            <RuntimeBalanceActivity
              entries={balanceEntries}
              loading={loading}
              unavailable={activityUnavailable}
              onRetry={retryBilling}
            />
          </article>
        </section>

        {actionError ? (
          <StatusNotice tone="destructive" title="Billing Action Unavailable" className="mt-4">
            {actionError}
          </StatusNotice>
        ) : null}

        <div className="mt-8">
          <BillingTrustFooter />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
