import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { authFetch, TRIAL_GATE_EVENT, type TrialGateBlockDetail } from "../../lib/api";
import { safeDate } from "../../lib/safe-date";

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
      .then((d) => {
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

  // Color escalates as risk approaches. Rose for the final 48 hours
  // OR ≥90% outbound usage — both signal urgency without screaming.
  // Amber otherwise.
  const critical = (daysLeft !== null && daysLeft <= 2) || usagePct >= 90;
  const containerStyle = critical
    ? { background: "rgba(232,70,106,0.12)", borderBottom: "1px solid rgba(232,70,106,0.40)" }
    : { background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.30)" };
  const textColor = critical ? "#be123c" : "#b45309";
  const iconColor = critical ? "#E8466A" : "#f59e0b";
  const buttonStyle = critical
    ? {
        background: "rgba(232,70,106,0.25)",
        border: "1px solid rgba(232,70,106,0.50)",
        color: "#be123c",
      }
    : {
        background: "rgba(245,158,11,0.20)",
        border: "1px solid rgba(245,158,11,0.40)",
        color: "#b45309",
      };

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
      className="px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap"
      style={containerStyle}
    >
      <div className="flex items-center gap-2.5 text-xs" style={{ color: textColor }}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: iconColor }} />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={openUpgrade}
        className="shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all"
        style={buttonStyle}
      >
        Upgrade now
      </button>
    </motion.div>
  );
}
