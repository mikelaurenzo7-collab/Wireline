import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Loader2, TrendingUp, Wallet } from "lucide-react";
import { authFetch } from "../lib/api";
import { CONVERSATION_BALANCE_COPY } from "../lib/conversation-balance";
import { cn } from "../lib/utils";
import { Progress } from "./ui/shadcn/Progress";
import { Button } from "./atoms";
import type { WorkspaceUsageResponse } from "../types/api";

const REFRESH_MS = 60_000;
const BALANCE_TITLE = CONVERSATION_BALANCE_COPY.title;

export default function UsageMeter({
  compact = false,
  onUpgrade,
}: {
  compact?: boolean;
  /** When provided, approaching/extra-usage states surface a one-click upgrade CTA. */
  onUpgrade?: () => void;
}) {
  const [snap, setSnap] = useState<WorkspaceUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const res = await authFetch("/api/billing/usage");
        if (!res.ok) {
          if (alive) setLoadError("Voice usage unavailable right now.");
          return;
        }
        const data = (await res.json()) as WorkspaceUsageResponse;
        if (alive) {
          setSnap(data);
          setLoadError(null);
        }
      } catch {
        if (alive) setLoadError("Voice usage unavailable right now.");
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

  if (!snap || !snap.plan_id || snap.plan_id === "personal") {
    if (loadError) {
      return (
        <div
          className={cn(
            "flex items-center gap-2 wl-label text-[var(--wireline-color-status-warning)]",
            compact ? "py-1.5 px-3" : "py-4 px-5",
          )}
          role="status"
        >
          {loadError}
        </div>
      );
    }
    return null;
  }

  const used = snap.voice_minutes_used;
  const included = snap.voice_minutes_included;
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const hasExtraUsage = snap.overage_minutes > 0;
  const isWarn = !hasExtraUsage && pct >= 80;
  const credit = snap.credit_balance_usd ?? 0;
  const completionDue = snap.completion_grace_due_usd ?? Math.max(0, -credit);
  const isBlocked = snap.live_voice_blocked || completionDue > 0;
  const usageState = isBlocked ? "over" : hasExtraUsage || isWarn ? "warn" : "ok";
  const resetDate = new Date(snap.reset_at);
  const resetLabel = resetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lowCredit = credit > 0 && credit < 5;
  const compactTitle = isBlocked
    ? completionDue > 0
      ? `New live calls paused — restore $${completionDue.toFixed(2)} after the previous call finished normally.`
      : `New live calls paused — add ${BALANCE_TITLE} or wait for the monthly reset.`
    : `${used} of ${included} included voice minutes used — resets ${resetLabel}`;

  if (compact) {
    return (
      <div
        className="usage-meter flex items-center gap-2 py-1.5 px-3.5 rounded-full wl-panel-elevated border border-white/8 wl-micro-badge font-mono shadow-sm hover:shadow-brand/10 hover:border-brand/30 transition-all duration-300 cursor-help"
        data-usage-state={usageState}
        title={compactTitle}
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

      <div className="relative">
        <Progress
          value={pct}
          className="h-2.5 bg-white/5 shadow-inner wl-accent-progress-glow"
          indicatorClassName={cn(
            "transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isBlocked ? "bg-rose-500" : hasExtraUsage || isWarn ? "bg-amber-500" : "bg-brand",
          )}
        />
      </div>

      {isBlocked && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-md shadow-lg bg-rose-500/8 border border-rose-500/25 shadow-rose-500/5">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />
          <div className="text-[var(--wireline-typography-overline-size)] leading-relaxed">
            <span className="text-rose-400 font-semibold wl-label mr-1.5 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded-md">
              New calls paused
            </span>
            <span className="text-foreground/85">
              {completionDue > 0
                ? `The previous call finished normally and used $${completionDue.toFixed(2)} of completion grace. Restore ${BALANCE_TITLE} before starting another live call.`
                : `Your included minutes are used and ${BALANCE_TITLE} cannot cover another attempt. Add balance or wait for the monthly reset.`}
            </span>
            <span className="block text-foreground/55 mt-1">
              Wireline never cuts off an active call because billing coverage changes
              mid-conversation.
            </span>
          </div>
        </div>
      )}

      {!isBlocked && hasExtraUsage && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-md bg-amber-500/8 border border-amber-500/20">
          <Wallet className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="text-[var(--wireline-typography-overline-size)] leading-relaxed">
            <span className="text-amber-500 font-semibold">
              {snap.overage_minutes.toLocaleString()} extra minute
              {snap.overage_minutes === 1 ? "" : "s"}
            </span>
            <span className="text-foreground/65 ml-1">
              covered by {BALANCE_TITLE} at ${snap.overage_per_min_usd.toFixed(2)}/min. No automatic
              invoice overage.
            </span>
          </div>
        </div>
      )}

      {isWarn && !isBlocked && (
        <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/8 border border-amber-500/20 text-[var(--wireline-typography-overline-size)] text-amber-500 font-medium">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>
            Approaching your {included.toLocaleString()} included minutes. After that, new calls use{" "}
            {BALANCE_TITLE} at ${snap.overage_per_min_usd.toFixed(2)}/min—never an automatic overage
            invoice.
          </span>
        </div>
      )}

      {(isWarn || hasExtraUsage || isBlocked) && onUpgrade && (
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

      {(credit !== 0 || hasExtraUsage || isBlocked) && (
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/8">
          <span className="flex items-center gap-2 wl-label text-foreground/55 font-medium">
            <Wallet className="w-3.5 h-3.5" />
            {BALANCE_TITLE}
          </span>
          {completionDue > 0 ? (
            <span className="text-right leading-tight">
              <span className="tabular-nums font-bold text-[var(--wireline-typography-body-size)] text-rose-400">
                ${completionDue.toFixed(2)} due
              </span>
              <span className="block wl-label text-foreground/55 font-medium">
                restore before another live call
              </span>
            </span>
          ) : credit > 0 ? (
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
                {lowCredit ? "running low — top up below" : "available for controlled extra usage"}
              </span>
            </span>
          ) : (
            <span className="wl-label text-amber-500 font-semibold text-right">
              Add balance before extra live usage
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
