import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { cn } from "../lib/utils";

type CapabilityKey = "claude" | "vapi" | "supabase";

interface HealthData {
  status: "ok" | "degraded";
  db: { ok: boolean; latency_ms: number };
  capabilities: {
    claude: boolean;
    vapi: boolean;
    supabase: boolean;
  };
}

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  claude: "Claude",
  vapi: "Vapi",
  supabase: "DB",
};

/**
 * Compact status badge shown in the sidebar footer. Polls /api/health
 * every 60 s (lazy — starts on first mount). Shows green dot when all
 * systems are nominal, amber when degraded, red on error.
 */
export default function SystemStatusBadge() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  const poll = async () => {
    try {
      const r = await fetch("/api/health");
      if (!r.ok && r.status !== 503) { setError(true); return; }
      const d: HealthData = await r.json();
      setHealth(d);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  const overall =
    error ? "error"
    : !health ? "loading"
    : health.status === "ok" ? "ok"
    : "degraded";

  const dotCls =
    overall === "ok"       ? "bg-emerald-400"
    : overall === "degraded" ? "bg-amber-400"
    : overall === "error"    ? "bg-rose-500"
    : "bg-white/30";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/8 hover:border-white/20 transition-all w-full"
        title="System status"
      >
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotCls, overall === "ok" && "animate-pulse")} />
        <span className="text-[10px] uppercase tracking-[0.3em] text-ink/60 flex-1 text-left">
          {overall === "ok" ? "All Systems" : overall === "degraded" ? "Degraded" : overall === "error" ? "Unreachable" : "Checking…"}
        </span>
        <Activity className="w-3 h-3 text-ink/30" />
      </button>

      {open && health && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl glass-strong border border-white/10 p-4 space-y-3 z-50 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.4em] text-muted">System Health</span>
            <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink transition-colors text-xs">✕</button>
          </div>

          {/* DB row */}
          <StatusRow
            label="Database"
            ok={health.db.ok}
            detail={`${health.db.latency_ms} ms`}
          />

          {/* Capability rows */}
          {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((cap) => (
            <StatusRow
              key={cap}
              label={CAPABILITY_LABELS[cap]}
              ok={health.capabilities[cap]}
              detail={health.capabilities[cap] ? "configured" : "key missing"}
            />
          ))}

          <div className="pt-2 border-t border-white/8 flex items-center justify-between">
            <span className="text-[9px] text-ink/30 uppercase tracking-wider">
              {health.status === "ok" ? "Nominal" : "Degraded"}
            </span>
            <button
              onClick={() => { poll(); }}
              className="text-[9px] text-brand/70 hover:text-brand uppercase tracking-wider flex items-center gap-1"
            >
              <Wifi className="w-2.5 h-2.5" /> Refresh
            </button>
          </div>
        </div>
      )}

      {open && error && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl glass-strong border border-white/10 p-4 space-y-2 z-50">
          <div className="flex items-center gap-2 text-rose-400">
            <WifiOff className="w-4 h-4" />
            <span className="text-xs">Server unreachable</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {ok
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        }
        <span className="text-[11px] text-ink/80">{label}</span>
      </div>
      <span className={cn("text-[10px]", ok ? "text-ink/40" : "text-amber-400/80")}>{detail}</span>
    </div>
  );
}
