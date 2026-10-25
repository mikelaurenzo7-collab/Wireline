import { useEffect, useState } from "react";
import { Button } from "../atoms";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { authFetch } from "../../lib/api";
import { captureSignupIntentFromLocation, usageAddonsFromIntent } from "../../lib/signup-intent";
import { usePaidPlanAvailability } from "../../hooks/usePaidPlanAvailability";
import {
  USAGE_ADDONS,
  USAGE_BASE_USD_MONTHLY,
  USAGE_DEFAULT_MONTHLY_CAP_USD,
  USAGE_INCLUDED_WORK_USD,
  formatUsdCents,
} from "../../lib/usage-billing-catalog";
import type { UsageSpendResponse } from "../../types/api-billing";

/**
 * Usage billing in Settings > Billing. Renders nothing while the server flag is
 * off, so the current plans page is unchanged until launch.
 */
export default function UsageSpendCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<UsageSpendResponse | null>(null);
  const [capDraft, setCapDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [addons] = useState(() => usageAddonsFromIntent(captureSignupIntentFromLocation()));
  const [number, setNumber] = useState(addons.number);
  const [emailAddress, setEmailAddress] = useState(addons.emailAddress);
  const { canActivate } = usePaidPlanAvailability({ planId: "usage" });

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

  async function startCheckout() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: "usage",
          interval: "month",
          addons: { number: number ? 1 : 0, email_address: emailAddress ? 1 : 0 },
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
    const value = Number(capDraft);
    if (!Number.isFinite(value)) {
      setMessage("Enter a dollar amount.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/billing/usage-spend", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_cap_usd: value }),
      });
      const body = (await response.json().catch(() => null)) as {
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
      setState((current) =>
        current && current.enabled && current.usage_account
          ? {
              ...current,
              cap_usd: body?.cap_usd ?? value,
              at_cap: body?.at_cap ?? current.at_cap,
              spent_usd: body?.spent_usd ?? current.spent_usd,
              pct: body?.pct ?? current.pct,
              headroom_usd: body?.headroom_usd ?? current.headroom_usd,
            }
          : current,
      );
      setMessage("Monthly limit saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Limit could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!state.usage_account) {
    if (!canActivate("usage")) return null;
    return (
      <section className="mt-6" aria-label="Pay for what you use">
        <article className="wl-paper wl-paper-elevated space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-base font-semibold">Shared Work Plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ${USAGE_BASE_USD_MONTHLY}/month includes ${USAGE_INCLUDED_WORK_USD} of work shared
              across calls, email and Computer. Your allowance resets monthly without rollover.
              Extra work stays within a monthly limit you set (default $
              {USAGE_DEFAULT_MONTHLY_CAP_USD}) before tax. Applicable tax is added separately.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox checked={number} onChange={(e) => setNumber(e.target.checked)} />
              BotBound number, ${USAGE_ADDONS.number.usdMonthly}/month
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                checked={emailAddress}
                onChange={(e) => setEmailAddress(e.target.checked)}
              />
              BotBound email address, ${USAGE_ADDONS.email_address.usdMonthly}/month
            </label>
          </div>
          <Button type="button" disabled={busy} onClick={() => void startCheckout()}>
            Review Plan
          </Button>
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
        </article>
      </section>
    );
  }

  const pct = Math.min(100, Math.max(0, state.pct));
  return (
    <section className="mt-6" aria-label="Usage this period">
      <article className="wl-paper wl-paper-elevated space-y-4 p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Usage This Period</h2>
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
            Your Bots are paused for new calls, emails, and computer tasks until you raise your
            limit or the next period starts.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We email you at 50%, 80%, and 100%. Your Bots pause at your limit.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {formatUsdCents(state.included_remaining_usd ?? 0)} of your ${USAGE_INCLUDED_WORK_USD}{" "}
          shared work allowance remains. Calls, email and Computer use the same pool. It resets
          monthly without rollover. Heavy Computer tasks may reach a separate processing limit.
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
              onChange={(event) => setCapDraft(event.target.value)}
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
