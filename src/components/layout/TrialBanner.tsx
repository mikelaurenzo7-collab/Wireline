import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { authFetch } from "../../lib/api";
import { safeDate } from "../../lib/safe-date";

export default function TrialBanner() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        const sub = d.subscription;
        if (sub?.status === "trialing" && sub?.current_period_end) {
          const periodEnd = safeDate(sub.current_period_end);
          if (periodEnd) {
            const ms = periodEnd.getTime() - Date.now();
            setDaysLeft(Math.max(0, Math.ceil(ms / 86_400_000)));
          }
        }
      })
      .catch(() => {});
  }, []);

  // Banner ONLY surfaces in the last 5 days of trial. Day 1-9 the
  // user is exploring — a sticky banner would feel pushy. Day 10+
  // they need a clear nudge before the silent hard-block at day 14
  // (the day-14 wall is the conversion-killer we're avoiding).
  if (daysLeft === null || daysLeft > 5) return null;

  // Color escalates as the deadline approaches. Rose for the final
  // 48 hours signals urgency without screaming. Amber for the 3-5
  // day window keeps the tone informational.
  const critical = daysLeft <= 2;
  const containerCls = critical
    ? "bg-rose-500/12 border-b border-rose-500/40"
    : "bg-amber-500/10 border-b border-amber-500/30";
  const textCls = critical ? "text-rose-700" : "text-amber-700";
  const iconCls = critical ? "text-rose-500" : "text-amber-500";
  const buttonCls = critical
    ? "bg-rose-500/25 border border-rose-500/50 text-rose-700 hover:bg-rose-500/35"
    : "bg-amber-500/20 border border-amber-500/40 text-amber-700 hover:bg-amber-500/30";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className={`${containerCls} px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap`}
    >
      <div className={`flex items-center gap-2.5 text-xs ${textCls}`}>
        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${iconCls}`} />
        <span>
          {daysLeft === 0 ? (
            "Your trial ends today."
          ) : daysLeft === 1 ? (
            "Your trial ends tomorrow."
          ) : (
            <>
              Trial ends in <strong>{daysLeft} days</strong>.
            </>
          )}{" "}
          Upgrade now to keep your agents live — your phone number stays.
        </span>
      </div>
      <Link
        to="/admin?tab=subscription"
        className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all ${buttonCls}`}
      >
        Upgrade now
      </Link>
    </motion.div>
  );
}
