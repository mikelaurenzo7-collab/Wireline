import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

type CapabilityKey = "claude" | "vapi" | "drizzle";

interface HealthData {
  status: "ok" | "degraded";
  db: { ok: boolean; latency_ms: number };
  capabilities: {
    claude: boolean;
    vapi: boolean;
    drizzle: boolean;
  };
}

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  claude: "Cognitive Layer",
  vapi: "Voice Bridge",
  drizzle: "Data Vault",
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
      const r = await fetch("/api/health/internal");
      if (!r.ok && r.status !== 503) {
        setError(true);
        return;
      }
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

  const overall = error
    ? "error"
    : !health
      ? "loading"
      : health.status === "ok"
        ? "ok"
        : "degraded";

  const dotCls =
    overall === "ok"
      ? "bg-brand"
      : overall === "degraded"
        ? "bg-rose-400"
        : overall === "error"
          ? "bg-rose-500"
          : "bg-white/30";

  return (
    <div className="relative">
      <ShadButton
        type="button"
        variant="outline"
        disableAnimations
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md wl-panel border border-border px-2.5 hover:border-brand/30"
        title={`System status: ${
          overall === "ok"
            ? "Live"
            : overall === "degraded"
              ? "Degraded"
              : overall === "error"
                ? "Offline"
                : "Loading"
        }`}
      >
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            dotCls,
            overall === "ok" && "animate-pulse",
          )}
        />
        {/* Hide the status text at narrow laptop widths — the colored
            dot alone communicates status, and the title attribute
            provides the full label on hover. Frees ~90px of TopBar
            width which Mike's ThinkPad needed back. */}
        <span className="hidden xl:inline wl-label text-foreground/70">
          {overall === "ok"
            ? "Live"
            : overall === "degraded"
              ? "Degraded"
              : overall === "error"
                ? "Offline"
                : "…"}
        </span>
      </ShadButton>

      {open && health && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 space-y-3 rounded-md wl-panel-elevated border border-border p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="app-section-title">System Health</span>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={() => setOpen(false)}
              className="h-auto px-1 py-0 text-xs text-foreground/65 hover:text-foreground"
              aria-label="Close system health panel"
            >
              ✕
            </ShadButton>
          </div>

          {/* DB row */}
          <StatusRow label="Database" ok={health.db.ok} detail={`${health.db.latency_ms} ms`} />

          {/* Capability rows */}
          {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((cap) => (
            <StatusRow
              key={cap}
              label={CAPABILITY_LABELS[cap]}
              ok={health.capabilities[cap]}
              detail={health.capabilities[cap] ? "Verified" : "Standby"}
            />
          ))}

          <div className="pt-2 border-t border-white/8 flex items-center justify-between">
            <span className="wl-micro-meta opacity-90 uppercase tracking-wider">
              {health.status === "ok" ? "Nominal" : "Degraded"}
            </span>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={() => {
                poll();
              }}
              className="h-auto gap-1 px-0 py-0 wl-label text-brand/70 hover:text-brand"
            >
              <Wifi className="w-2.5 h-2.5" /> Refresh
            </ShadButton>
          </div>
        </div>
      )}

      {open && error && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-md wl-panel-elevated border border-white/10 p-4 space-y-2 z-50">
          <div className="flex items-center gap-2 text-rose-500">
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
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-brand" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
        )}
        <span className="text-[var(--wireline-typography-overline-size)] text-foreground/80">
          {label}
        </span>
      </div>
      <span className={cn("wl-micro-meta", ok ? "text-foreground/65" : "text-rose-400/80")}>
        {detail}
      </span>
    </div>
  );
}
