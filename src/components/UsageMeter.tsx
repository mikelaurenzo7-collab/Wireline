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

  const barAccent = isOver ? "#f43f5e" : isWarn ? "#f59e0b" : "#0AC8D4";
  const resetDate = new Date(snap.reset_at);
  const resetLabel = resetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 py-1.5 px-3 rounded-full glass border border-white/8 text-[10px] font-mono"
        title={`${used} of ${included} voice minutes used this month — resets ${resetLabel}`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: barAccent, boxShadow: `0 0 6px ${barAccent}` }}
        />
        <span className="text-muted/70">VOICE</span>
        <span className="text-ink tabular-nums">{used.toLocaleString()}</span>
        <span className="text-muted/40">/</span>
        <span className="text-muted/70 tabular-nums">{included.toLocaleString()}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl glass border border-white/10 p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `${barAccent}1f`, border: `1px solid ${barAccent}40` }}
          >
            <Activity className="w-4 h-4" style={{ color: barAccent }} />
          </div>
          <div>
            <h4 className="font-display italic text-lg text-ink leading-tight">Voice minutes</h4>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/60">
              This month · resets {resetLabel}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-mono text-muted/70">
            <span className="text-ink tabular-nums text-base font-semibold">
              {used.toLocaleString()}
            </span>
            <span className="text-muted/50"> / {included.toLocaleString()}</span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.3em] text-muted/50 mt-0.5">{pct}% used</p>
        </div>
      </div>

      <div className="relative h-2 rounded-full overflow-hidden bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${barAccent}, ${barAccent}cc)`,
            boxShadow: `0 0 12px ${barAccent}66`,
          }}
        />
      </div>

      {isOver && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-xl"
          style={{
            background: "rgba(244,63,94,0.08)",
            border: "1px solid rgba(244,63,94,0.25)",
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-rose-500 shrink-0" />
          <div className="text-[11px] leading-relaxed">
            <span className="text-rose-500 font-medium">
              {snap.overage_minutes.toLocaleString()} min over plan
            </span>
            <span className="text-muted/80">
              {` — overage billed at $${snap.overage_per_min_usd.toFixed(2)}/min (`}
              {snap.stripe_metered
                ? `≈ $${snap.overage_cost_usd.toFixed(2)} this period`
                : "metered billing pending Stripe setup"}
              {")"}
            </span>
          </div>
        </div>
      )}

      {isWarn && !isOver && (
        <div className="flex items-center gap-2 text-[11px] text-amber-600/90">
          <TrendingUp className="w-3 h-3" />
          <span>
            Approaching plan limit — overage rate kicks in at {included.toLocaleString()} min.
          </span>
        </div>
      )}
    </motion.div>
  );
}
