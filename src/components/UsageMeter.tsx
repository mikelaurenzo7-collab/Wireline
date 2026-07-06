import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Loader2, TrendingUp, Wallet } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { Progress } from "./ui/shadcn/Progress";
import { Button } from "./atoms";
import type { WorkspaceUsageResponse } from "../types/api";

const REFRESH_MS = 60_000;

export default function UsageMeter({
  compact = false,
  onUpgrade,
}: {
  compact?: boolean;
  /** When provided, approaching/over states surface a one-click upgrade CTA. */
  onUpgrade?: () => void;
}) {
  const [snap, setSnap] = useState<WorkspaceUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const res = await authFetch("/api/billing/usage");
        if (!res.ok) return;
        const data = (await res.json()) as WorkspaceUsageResponse;
        if (alive) setSnap(data);
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchOnce();
    const timer = setInterval(fetchOnce, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 wl-label text-foreground/55",
          compact ? "py-1.5 px-3" : "py-4 px-5",
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading voice usage
      </div>
    );
  }

  if (!snap || !snap.plan_id) {
    return null; // no active plan — nothing to display
  }

  const used = snap.voice_minutes_used;
  const included = snap.voice_minutes_included;
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const isOver = snap.overage_minutes > 0;
  const isWarn = !isOver && pct >= 80;
  const usageState = isOver ? "over" : isWarn ? "warn" : "ok";
  const resetDate = new Date(snap.reset_at);
  const resetLabel = resetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const credit = snap.credit_balance_usd ?? 0;
  const lowCredit = credit > 0 && credit < 5;

  if (compact) {
    return (
      <div
        className="usage-meter flex items-center gap-2 py-1.5 px-3.5 rounded-full wl-panel-elevated border border-white/8 wl-micro-badge font-mono shadow-sm hover:shadow-brand/10 hover:border-brand/30 transition-all duration-300 cursor-help"
        data-usage-state={usageState}
        title={`${used} of ${included} voice minutes used this month — resets ${resetLabel}`}
      >
        <span className="w-2 h-2 rounded-full animate-pulse wl-accent-dot" data-circular />
        <span className="text-foreground/55 font-semibold tracking-wider">VOICE</span>
        <span className="text-foreground font-bold tabular-nums">{used.toLocaleString()}</span>
        <span className="text-foreground/55 font-light">/</span>
        <span className="text-foreground/55 tabular-nums">{included.toLocaleString()}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="usage-meter rounded-md wl-panel-elevated card-interactive-premium p-5 space-y-4"
      data-usage-state={usageState}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md flex items-center justify-center shadow-lg wl-accent-icon-box">
            <Activity className="w-4.5 h-4.5 wl-accent-text" />
          </div>
          <div>
            <h4 className="font-display italic text-lg text-foreground leading-tight font-bold">
              Voice minutes
            </h4>
            <p className="wl-label text-foreground/55 font-medium">
              This month · resets {resetLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[var(--wireline-typography-overline-size)] font-mono text-foreground/55">
            <span className="text-foreground tabular-nums text-base font-bold">
              {used.toLocaleString()}
            </span>
            <span className="text-foreground/55"> / {included.toLocaleString()}</span>
          </div>
          <p className="wl-label text-brand font-semibold mt-0.5">{pct}% used</p>
        </div>
      </div>

      {/* Premium SHADCN Progress bar with custom styling */}
      <div className="relative">
        <Progress
          value={pct}
          className="h-2.5 bg-white/5 shadow-inner wl-accent-progress-glow"
          indicatorClassName={cn(
            "transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOver ? "bg-rose-500" : isWarn ? "bg-amber-500" : "bg-brand",
          )}
        />
      </div>

      {isOver && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-md shadow-lg bg-rose-500/8 border border-rose-500/25 shadow-rose-500/5">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />
          <div className="text-[var(--wireline-typography-overline-size)] leading-relaxed">
            <span className="text-rose-400 font-semibold wl-label mr-1.5 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded-md">
              Overage
            </span>
            <span className="text-rose-400 font-bold">
              {snap.overage_minutes.toLocaleString()} min over plan
            </span>
            <span className="text-muted/80 ml-1">
              {`— billed at $${snap.overage_per_min_usd.toFixed(2)}/min (`}
              <span className="text-foreground font-semibold">
                {snap.stripe_metered
                  ? `≈ $${snap.overage_cost_usd.toFixed(2)} this period`
                  : "metered billing pending Stripe setup"}
              </span>
              {")"}
            </span>
          </div>
        </div>
      )}

      {isWarn && !isOver && (
        <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/8 border border-amber-500/20 text-[var(--wireline-typography-overline-size)] text-amber-500 font-medium">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>
            Approaching your {included.toLocaleString()}-minute plan — upgrading adds headroom; past
            it, overage bills at ${snap.overage_per_min_usd.toFixed(2)}/min.
          </span>
        </div>
      )}

      {/* Primary path when usage runs hot: upgrade for more included minutes
          (cheaper than recurring overage/top-ups). Credits stay the safety net. */}
      {(isWarn || isOver) && onUpgrade && (
        <Button
          type="button"
          variant="ghost"
          disableAnimations
          onClick={onUpgrade}
          className="w-full h-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md wl-label font-semibold bg-brand/10 border border-brand/30 text-brand hover:bg-brand/15 transition-colors"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Upgrade for more included minutes
        </Button>
      )}

      {/* Prepaid credits — relevant when the Account Holder holds a balance or is in
          overage, where credits absorb the cost before Stripe meters it. */}
      {(credit > 0 || isOver) && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/8">
          <span className="flex items-center gap-2 wl-label text-foreground/55 font-medium">
            <Wallet className="w-3.5 h-3.5" />
            Prepaid credits
          </span>
          {credit > 0 ? (
            <span className="text-right leading-tight">
              <span
                className={cn(
                  "tabular-nums font-bold text-[var(--wireline-typography-body-size)]",
                  lowCredit ? "text-amber-500" : "text-foreground",
                )}
              >
                ${credit.toFixed(2)}
              </span>
              <span className="block wl-label text-foreground/55 font-medium">
                {isOver
                  ? "auto-applied to overage"
                  : lowCredit
                    ? "running low — top up below"
                    : "covers overage first"}
              </span>
            </span>
          ) : (
            <span className="wl-label text-amber-500 font-semibold text-right">
              Add credits below to cover overage
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
