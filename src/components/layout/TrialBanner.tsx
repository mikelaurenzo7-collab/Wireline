import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { authFetch, TRIAL_GATE_EVENT, type TrialGateBlockDetail } from "../../lib/api";
import { safeDate } from "../../lib/safe-date";
import { Button } from "../atoms";
import type { BillingStatusResponse } from "../../types/api";
import { cn } from "../../lib/utils";

interface TrialState {
  daysLeft: number | null;
  outboundUsed: number;
  outboundCap: number;
}

export default function TrialBanner() {
  const [trial, setTrial] = useState<TrialState | null>(null);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => r.json())
      .then((d: BillingStatusResponse) => {
        // Primary source: settings-driven trial block (new tenants who
        // signed up post-trial-gate land here, no Stripe sub yet).
        if (d.trial?.status === "trialing") {
          setTrial({
            daysLeft: typeof d.trial.days_left === "number" ? d.trial.days_left : null,
            outboundUsed: d.trial.outbound_used ?? 0,
            outboundCap: d.trial.outbound_cap ?? 25,
          });
          return;
        }
        // Legacy fallback: Stripe-managed trial (subscription.status =
        // "trialing"). Kept so any tenant with a real Stripe trial
        // sub still sees the banner.
        const sub = d.subscription;
        if (sub?.status === "trialing" && sub?.current_period_end) {
          const periodEnd = safeDate(sub.current_period_end);
          if (periodEnd) {
            const ms = periodEnd.getTime() - Date.now();
            setTrial({
              daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
              outboundUsed: 0,
              outboundCap: 0, // unknown for Stripe-managed trials
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  // Show in two conditions:
  //   1. The final 5 days of the trial window (urgency before the cliff)
  //   2. Outbound usage ≥ 60% of cap (close to the soft cap mid-trial)
  // Day 1-9 with low usage: silent — let the tenant explore.
  if (!trial) return null;
  const daysLeft = trial.daysLeft;
  const usagePct = trial.outboundCap > 0 ? (trial.outboundUsed / trial.outboundCap) * 100 : 0;
  const showByDays = daysLeft !== null && daysLeft <= 5;
  const showByUsage = usagePct >= 60;
  if (!showByDays && !showByUsage) return null;

  const critical = (daysLeft !== null && daysLeft <= 2) || usagePct >= 90;
  const bannerTone = critical ? "wl-banner--critical" : "wl-banner--warn";

  const openUpgrade = () => {
    const detail: TrialGateBlockDetail = {
      code: showByUsage ? "TRIAL_LIMIT_HIT" : "TRIAL_EXPIRED",
      error: "Trial upgrade requested",
      limit: trial.outboundCap || undefined,
      current: trial.outboundUsed || undefined,
      days_left: daysLeft,
      trial_ended_at: daysLeft === 0 ? new Date().toISOString() : null,
    };
    window.dispatchEvent(new CustomEvent<TrialGateBlockDetail>(TRIAL_GATE_EVENT, { detail }));
  };

  // Choose the most pressing message — usage-cap proximity beats
  // days-left when both fire (a tenant burning calls fast needs to
  // upgrade BEFORE the trial day-count matters).
  let message: React.ReactNode;
  if (showByUsage) {
    message = (
      <>
        Trial usage:{" "}
        <strong>
          {trial.outboundUsed} of {trial.outboundCap}
        </strong>{" "}
        outbound calls.
        {daysLeft !== null && daysLeft <= 5 && <> · {daysLeft}d left.</>} Upgrade to keep dialing —
        phone number stays.
      </>
    );
  } else if (daysLeft === 0) {
    message = (
      <>Your trial ends today. Upgrade now to keep your agents live — phone number stays.</>
    );
  } else if (daysLeft === 1) {
    message = (
      <>Your trial ends tomorrow. Upgrade now to keep your agents live — phone number stays.</>
    );
  } else {
    message = (
      <>
        Trial ends in <strong>{daysLeft} days</strong>. Upgrade now to keep your agents live — phone
        number stays.
      </>
    );
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className={cn("wl-banner", bannerTone)}
    >
      <div className="wl-banner__body">
        <AlertTriangle className="wl-banner__icon" aria-hidden />
        <span>{message}</span>
      </div>
      <Button
        type="button"
        disableAnimations
        variant="outline"
        size="sm"
        onClick={openUpgrade}
        className="touch-press hover:scale-[1.02] shrink-0 app-micro-cta h-auto after:hidden border-0 shadow-none"
      >
        Upgrade now
      </Button>
    </motion.div>
  );
}
