import { useEffect, useState } from "react";
import { Link } from "react-router";

import { authFetch } from "../../lib/api";
import { fetchSelfServeCheckoutAvailable } from "../../lib/checkout-availability";
import { choosePlanHref } from "../../lib/signup-intent";
import { SOFT_OPEN_CHECKOUT_COPY } from "../../lib/wireline-onboarding-copy";

type SimulationAllowanceStatus = {
  month_to_date_usd: number;
  monthly_limit_usd: number;
  percent_used: number;
  warn_threshold_pct: number;
  hard_capped_now: boolean;
  simulation_allowance_enabled: boolean;
  voice_rehearsals_remaining?: number | null;
  voice_rehearsal_seconds?: number | null;
};

/** "2 voice rehearsals left this month (2 minutes each)." from spend status. */
export function voiceRehearsalsLeftCopy(status: {
  voice_rehearsals_remaining?: number | null;
  voice_rehearsal_seconds?: number | null;
}): string | null {
  const remaining = status.voice_rehearsals_remaining;
  if (typeof remaining !== "number") return null;
  if (remaining <= 0)
    return "Voice rehearsals are used for this month. Text rehearsals are still available.";
  const minutes = Math.round((status.voice_rehearsal_seconds ?? 120) / 60);
  return `${remaining} voice ${remaining === 1 ? "rehearsal" : "rehearsals"} left this month (${minutes} ${minutes === 1 ? "minute" : "minutes"} each).`;
}

/**
 * Free Builder's private rehearsal allowance. plan-catalog.ts names silent
 * mid-training depletion "the likeliest place a converting prospect churns" —
 * this makes the allowance visible before it runs out, warns near the
 * threshold, and gives the depleted state a plan path instead of a dead mic.
 * Renders nothing for paid tenants (their guard scope is not the simulation
 * allowance) and nothing while unknown, so it can never block testing.
 */
export default function RehearsalAllowanceMeter({ refreshTick }: { refreshTick: number }) {
  const [status, setStatus] = useState<SimulationAllowanceStatus | null>(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState<boolean | null>(null);

  // refreshTick bumps when a simulation session starts or ends: each session
  // lands a new reserve record, so a mount-only fetch would keep showing the
  // stale amount while the user runs through the warning threshold.
  useEffect(() => {
    let cancelled = false;
    void authFetch("/api/spend/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: SimulationAllowanceStatus | null) => {
        if (!cancelled && body?.simulation_allowance_enabled) setStatus(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    let cancelled = false;
    void fetchSelfServeCheckoutAvailable().then((available) => {
      if (!cancelled) setCheckoutAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || !(status.monthly_limit_usd > 0)) return null;

  const percent = Math.max(0, Math.min(100, status.percent_used));
  const nearLimit = !status.hard_capped_now && percent >= status.warn_threshold_pct;

  return (
    <div
      className="rounded-xl border border-border bg-secondary px-4 py-3"
      data-testid="simulation-allowance-meter"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
          Private rehearsal allowance
        </p>
        <p className="font-mono text-[length:var(--wireline-typography-caption-size)] tabular-nums text-muted-foreground">
          ${status.month_to_date_usd.toFixed(2)} of ${status.monthly_limit_usd.toFixed(2)} used
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Rehearsal allowance used"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            status.hard_capped_now
              ? "bg-destructive"
              : nearLimit
                ? "bg-[var(--wireline-color-feedback-warning-icon,#eab308)]"
                : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!status.hard_capped_now && voiceRehearsalsLeftCopy(status) ? (
        <p className="mt-2 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          {voiceRehearsalsLeftCopy(status)}
        </p>
      ) : null}
      {status.hard_capped_now ? (
        <p className="mt-2 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          {checkoutAvailable === false ? (
            <>
              {SOFT_OPEN_CHECKOUT_COPY.allowanceDetail}{" "}
              <Link
                to={SOFT_OPEN_CHECKOUT_COPY.href}
                className="font-semibold text-primary underline underline-offset-4"
              >
                {SOFT_OPEN_CHECKOUT_COPY.cta}
              </Link>
            </>
          ) : checkoutAvailable === true ? (
            <>
              This month's included rehearsal allowance is used.{" "}
              <Link
                to={choosePlanHref()}
                className="font-semibold text-primary underline underline-offset-4"
              >
                Choose a Plan
              </Link>{" "}
              to keep rehearsing and go live.
            </>
          ) : (
            "This month's included rehearsal allowance is used."
          )}
        </p>
      ) : nearLimit ? (
        <p className="mt-2 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          {checkoutAvailable === true
            ? "Running low. A paid plan removes the rehearsal ceiling and adds a live number."
            : "Running low. Preview Voice is still available."}
        </p>
      ) : null}
    </div>
  );
}
