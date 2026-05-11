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
      .then(r => r.json())
      .then(d => {
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

  if (daysLeft === null) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap"
    >
      <div className="flex items-center gap-2.5 text-amber-300 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          Your free trial ends in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>.
          Add a payment method before it expires to keep your agents running.
        </span>
      </div>
      <Link
        to="/admin"
        className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] uppercase tracking-[0.3em] hover:bg-amber-500/30 transition-all"
      >
        Add Card
      </Link>
    </motion.div>
  );
}
