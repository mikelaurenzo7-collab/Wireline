/**
 * Compact usage ring for Director chat — bottom-right, out of the way (Cursor/Claude style).
 */
import { DIRECTOR_USAGE_RING_COPY } from "../../lib/director-copy";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";


interface UsageRingSnapshot {
  plan_id: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  voice_usage_pct: number;
  ai_spend_usd: number;
  ai_spend_limit_usd: number;
  ai_spend_pct: number;
  usage_pct: number;
}

const REFRESH_MS = 45_000;
const R = 8;
const CIRC = 2 * Math.PI * R;

function ringColor(pct: number): string {
  if (pct >= 100) return "stroke-destructive";
  if (pct >= 85) return "stroke-brand";
  return "stroke-brand/70";
}

export function DirectorUsageIndicator({ className }: { className?: string }) {
  const [snap, setSnap] = useState<UsageRingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await authFetch("/api/billing/usage");
        if (!res.ok || !alive) return;
        setSnap((await res.json()) as UsageRingSnapshot);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const pct = snap?.usage_pct ?? 0;
  const offset = CIRC - (pct / 100) * CIRC;

  const title = useMemo(() => {
    if (!snap?.plan_id) return DIRECTOR_USAGE_RING_COPY.noPlan;
    const voice = `${snap.voice_minutes_used} / ${snap.voice_minutes_included} voice min (${snap.voice_usage_pct}%)`;
    const ai = `$${snap.ai_spend_usd.toFixed(2)} / $${snap.ai_spend_limit_usd} AI (${snap.ai_spend_pct}%)`;
    return `${DIRECTOR_USAGE_RING_COPY.title}\n${voice}\n${ai}`;
  }, [snap]);

  if (loading) {
    return (
      <div
        className={cn(
          "pointer-events-none flex h-5 w-5 items-center justify-center opacity-40",
          className,
        )}
        aria-hidden
      >
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!snap?.plan_id) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto cursor-default select-none rounded-full p-0.5",
        "bg-card/50 backdrop-blur-sm border border-border/40 shadow-sm",
        "hover:border-brand/25 transition-colors",
        className,
      )}
      title={title}
      role="img"
      aria-label={`Workspace usage ${pct} percent`}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="block" aria-hidden>
        <circle cx="10" cy="10" r={R} fill="none" className="stroke-muted/25" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r={R}
          fill="none"
          className={cn(ringColor(pct), "transition-[stroke-dashoffset] duration-500")}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 10 10)"
        />
      </svg>
    </div>
  );
}
