import { useEffect, useRef, useState } from "react";
import { Button } from "../atoms";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { authFetch } from "../../lib/api";
import { captureSignupIntentFromLocation, usageAddonsFromIntent } from "../../lib/signup-intent";
import { usePaidPlanAvailability } from "../../hooks/usePaidPlanAvailability";
import {
  DEFAULT_PUBLIC_USAGE_TIER,
  PUBLIC_USAGE_TIERS,
  USAGE_ADDONS,
  USAGE_DEFAULT_MONTHLY_CAP_USD,
  USAGE_TIERS,
  usageTier,
  type UsageTierId,
  formatUsdCents,
} from "../../lib/usage-billing-catalog";
import type { UsageSpendResponse } from "../../types/api-billing";

/**
 * Usage billing in Settings > Billing. Renders nothing while the server flag is
 * off, so the current plans page is unchanged until launch.
 */
export default function UsageSpendCard({
  refreshKey = 0,
  hasSubscription = false,
  grantedPlanName,
}: {
  refreshKey?: number;
  hasSubscription?: boolean;
  grantedPlanName?: string;
}) {
  const [state, setState] = useState<UsageSpendResponse | null>(null);
  const [capDraft, setCapDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const capSavingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [intent] = useState(captureSignupIntentFromLocation);
  const addons = usageAddonsFromIntent(intent);
  const [selectedTier, setTier] = useState<UsageTierId | undefined>(() =>
    PUBLIC_USAGE_TIERS.find((tier) => tier === intent?.preferredUsageTier),
  );
  const [number, setNumber] = useState(addons.number);
  const [emailAddress, setEmailAddress] = useState(addons.emailAddress);
  const { canActivate, usageTiers } = usePaidPlanAvailability({ planId: "usage" });

  useEffect(() => {
    let active = true;
    void authFetch("/api/billing/usage-spend")
      .then(async (response) =>
        response.ok ? ((await response.json()) as UsageSpendResponse) : null,
      )
      .then((next) => {
        if (!active || !next) return;
        setState(next);
        if (next.enabled && next.usage_account) setCapDraft(String(next.cap_usd));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (!state || !state.enabled) return null;

  async function startCheckout(tier: UsageTierId) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: "usage",
          usage_tier: tier,
          interval: "month",
          addons: {
            number: number ? 1 : 0,
            email_address: emailAddress ? 1 : 0,
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error || "Checkout could not start.");
      window.location.assign(body.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not start.");
      setBusy(false);
    }
  }

  async function saveCap() {
    if (capSavingRef.current) return;
    const value = Number(capDraft);
    if (!Number.isFinite(value)) {
      setMessage("Enter a dollar amount.");
      return;
    }
    const requestedCap = Math.round(value * 100) / 100;
    capSavingRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/billing/usage-spend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_cap_usd: value }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: unknown;
        cap_usd?: number;
        at_cap?: boolean;
        spent_usd?: number;
        pct?: number;
        headroom_usd?: number;
        error?: string;
        message?: string;
      } | null;
      if (!response.ok)
        throw new Error(body?.error || body?.message || "Limit could not be saved.");
      if (
        (body?.ok !== undefined && body.ok !== true) ||
        typeof body?.cap_usd !== "number" ||
        !Number.isFinite(body.cap_usd) ||
        body.cap_usd !== requestedCap ||
        typeof body.at_cap !== "boolean" ||
        typeof body.spent_usd !== "number" ||
        !Number.isFinite(body.spent_usd) ||
        typeof body.pct !== "number" ||
        !Number.isFinite(body.pct) ||
        typeof body.headroom_usd !== "number" ||
        !Number.isFinite(body.headroom_usd)
      )
        throw new Error(
          "Limit could not be confirmed. Your draft is kept. Refresh billing before retrying.",
        );
      const { cap_usd, at_cap, spent_usd, pct, headroom_usd } = body;
      setState((current) =>
        current && current.enabled && current.usage_account
          ? {
              ...current,
              cap_usd,
              at_cap,
              spent_usd,
              pct,
              headroom_usd,
            }
          : current,
      );
      setCapDraft(String(cap_usd));
      setMessage("Monthly limit saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Limit could not be saved.");
    } finally {
      capSavingRef.current = false;
      setBusy(false);
    }
  }

  if (!state.usage_account) {
    // Checkout refuses a second live subscription. Do not present its offer
    // as an active allowance or lead an existing subscriber to a dead end.
    if (hasSubscription) return null;
    if (!canActivate("usage") || usageTiers.length === 0) return null;
    const defaultTier = usageTiers.includes(DEFAULT_PUBLIC_USAGE_TIER)
      ? DEFAULT_PUBLIC_USAGE_TIER
      : usageTiers[0];
    const tier = selectedTier ?? defaultTier;
    const plan = usageTiers.includes(tier) ? USAGE_TIERS[tier] : null;
    const Offer = grantedPlanName ? "details" : "div";
    return (
      <section className="mt-6" aria-label="Subscription Plans">
        <Offer className="wl-paper wl-paper-elevated space-y-4 p-5 sm:p-6">
          {grantedPlanName ? (
            <summary className="cursor-pointer text-sm font-semibold wl-focus-ring-halo">
              Explore Shared Work Plans
            </summary>
          ) : null}
          <div>
            <h2 className="text-base font-semibold">Start a Subscription</h2>
            {grantedPlanName ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Optional. Your current {grantedPlanName} access is granted separately.
              </p>
            ) : null}
            <label className="mt-3 block text-sm font-semibold">
              Plan
              <select
                value={plan?.id ?? ""}
                onChange={(event) => setTier(event.target.value as UsageTierId)}
                aria-describedby={plan ? undefined : "usage-plan-availability"}
                className="ml-3 min-h-11 rounded-lg border border-border bg-background px-3"
              >
                {!plan ? (
                  <option value="" disabled>
                    Choose a plan
                  </option>
                ) : null}
                {usageTiers.map((id) => (
                  <option value={id} key={id}>
                    {USAGE_TIERS[id].name} · ${USAGE_TIERS[id].monthlyUsd}/Month
                  </option>
                ))}
              </select>
            </label>
            {plan ? (
              <p className="mt-1 text-sm text-muted-foreground">
                ${plan.monthlyUsd}/month includes ${plan.includedWorkUsd} of work shared across
                calls, SMS, email and Computer. Your allowance resets monthly without rollover.
                Extra work stays within a monthly limit you set (default $
                {USAGE_DEFAULT_MONTHLY_CAP_USD}) before tax. Applicable tax is added separately.
              </p>
            ) : (
              <p
                id="usage-plan-availability"
                role="status"
                className="mt-1 text-sm text-muted-foreground"
              >
                Your selected plan is currently unavailable. Choose an available plan.
              </p>
            )}
          </div>
          {plan ? (
            <p className="text-sm">
              {plan.includedNumbers} {plan.includedNumbers === 1 ? "Number" : "Numbers"} +{" "}
              {plan.includedEmailAddresses}{" "}
              {plan.includedEmailAddresses === 1 ? "Email Address" : "Email Addresses"} Included
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox checked={number} onChange={(e) => setNumber(e.target.checked)} />
              Extra Number, ${USAGE_ADDONS.number.usdMonthly}/Month
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                checked={emailAddress}
                onChange={(e) => setEmailAddress(e.target.checked)}
              />
              Extra Email Address, ${USAGE_ADDONS.email_address.usdMonthly}/Month
            </label>
          </div>
          <Button
            type="button"
            disabled={busy || !plan}
            onClick={() => {
              if (plan) void startCheckout(plan.id);
            }}
          >
            Review Plan
          </Button>
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
        </Offer>
      </section>
    );
  }

  const pct = Math.min(100, Math.max(0, state.pct));
  return (
    <section className="mt-6" aria-label="Usage this period">
      <article className="wl-paper wl-paper-elevated space-y-4 p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">
            {usageTier(state.tier).name} · Usage This Period
          </h2>
          <p className="text-sm tabular-nums">
            {formatUsdCents(state.spent_usd)} of {formatUsdCents(state.cap_usd)}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label="Share of monthly limit used"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        {state.reconciliation_required ? (
          <p role="status" className="text-sm font-semibold">
            New work is paused while we verify your usage charges. Contact support for an update.
          </p>
        ) : state.at_cap ? (
          <p role="status" className="text-sm font-semibold">
            Your Bots are paused for new calls, SMS, emails, and Computer tasks until you raise your
            limit or the next period starts.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We email you at 50%, 80%, and 100%. Your Bots pause at your limit.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {formatUsdCents(state.included_remaining_usd ?? 0)} of your $
          {state.included_work_usd ?? usageTier(state.tier).includedWorkUsd} shared work allowance
          remains. Calls, SMS, email and Computer use the same pool. It resets monthly without
          rollover. Heavy Computer tasks may reach a separate processing limit.
        </p>
        <p className="text-sm text-muted-foreground">
          Your limit covers BotBound charges before tax. Applicable tax is added separately. Active
          calls reserve time under your limit. Unused time is released when the call ends.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold" htmlFor="usage-monthly-cap">
            Monthly limit (USD)
            <input
              id="usage-monthly-cap"
              type="number"
              inputMode="decimal"
              min={1}
              max={state.max_cap_usd}
              step="1"
              value={capDraft}
              disabled={busy || state.reconciliation_required}
              onChange={(event) => {
                if (capSavingRef.current) return;
                setCapDraft(event.target.value);
                setMessage(null);
              }}
              className="mt-1 block min-h-11 w-40 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || state.reconciliation_required}
            onClick={() => void saveCap()}
          >
            Save Limit
          </Button>
        </div>
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </article>
    </section>
  );
}
