import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Loader2, TrendingUp } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

interface UsageSnapshot {
  plan_id: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  voice_minutes_remaining: number;
  overage_minutes: number;
  overage_per_min_usd: number;
  overage_cost_usd: number;
  period_key: string;
  reset_at: string;
  stripe_metered: boolean;
}

const REFRESH_MS = 60_000;

export default function UsageMeter({ compact = false }: { compact?: boolean }) {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const res = await authFetch("/api/billing/usage");
        if (!res.ok) return;
        const data = (await res.json()) as UsageSnapshot;
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
          "flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted/60",
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

  const barAccent = isOver ? "#f43f5e" : isWarn ? "#f59e0b" : "#4F1E7B";
  const resetDate = new Date(snap.reset_at);
  const resetLabel = resetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 py-1.5 px-3.5 rounded-full premium-glass border border-white/8 text-[10px] font-mono shadow-sm hover:shadow-brand/10 hover:border-brand/30 transition-all duration-300 cursor-help"
        title={`${used} of ${included} voice minutes used this month — resets ${resetLabel}`}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: barAccent, boxShadow: `0 0 8px ${barAccent}` }}
        />
        <span className="text-muted/70 font-semibold tracking-wider">VOICE</span>
        <span className="text-ink font-bold tabular-nums">{used.toLocaleString()}</span>
        <span className="text-muted/40 font-light">/</span>
        <span className="text-muted/70 tabular-nums">{included.toLocaleString()}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl premium-glass card-interactive-premium p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: `${barAccent}1a`,
              border: `1px solid ${barAccent}33`,
              boxShadow: `0 4px 10px -2px ${barAccent}22`,
            }}
          >
            <Activity className="w-4.5 h-4.5" style={{ color: barAccent }} />
          </div>
          <div>
            <h4 className="font-display italic text-lg text-ink leading-tight font-bold">
              Voice minutes
            </h4>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/65 font-medium">
              This month · resets {resetLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-mono text-muted/70">
            <span className="text-ink tabular-nums text-base font-bold">
              {used.toLocaleString()}
            </span>
            <span className="text-muted/50"> / {included.toLocaleString()}</span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.3em] text-brand font-semibold mt-0.5">
            {pct}% used
          </p>
        </div>
      </div>

      <div className="relative h-2.5 rounded-full overflow-hidden bg-white/5 shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${barAccent}, #10B981)`,
            boxShadow: `0 0 14px ${barAccent}88, inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}
        />
      </div>

      {isOver && (
        <div
          className="flex items-start gap-2.5 p-3.5 rounded-xl shadow-lg"
          style={{
            background: "rgba(244,63,94,0.08)",
            border: "1px solid rgba(244,63,94,0.25)",
            boxShadow: "0 4px 12px rgba(244,63,94,0.05)",
          }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />
          <div className="text-[11px] leading-relaxed">
            <span className="text-rose-400 font-semibold uppercase tracking-wider text-[9px] mr-1.5 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded-md">
              Overage
            </span>
            <span className="text-rose-400 font-bold">
              {snap.overage_minutes.toLocaleString()} min over plan
            </span>
            <span className="text-muted/80 ml-1">
              {`— billed at $${snap.overage_per_min_usd.toFixed(2)}/min (`}
              <span className="text-ink font-semibold">
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
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-500 font-medium">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>
            Approaching plan limit — overage rate kicks in at {included.toLocaleString()} min.
          </span>
        </div>
      )}
    </motion.div>
  );
}
