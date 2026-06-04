/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
// AgentScorecard — outcome-aligned per-agent reporting card.
//
// Hits GET /api/agents/:id/scorecard?days=N which returns the metric
// definition that matches the agent's kpi_focus (set in
// AgentBusinessProfile). One render path handles every focus by
// branching on the response's `format` ('percent' | 'number' |
// 'seconds' | 'score').

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Loader2, Target, Sparkles, AlertTriangle } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatPercent, safeFixed, formatInt } from "../lib/safe-number";

type MetricFormat = "percent" | "number" | "seconds" | "score";

interface PrimaryMetric {
  label: string;
  value: number;
  format: MetricFormat;
  delta_pct: number;
  trend: number[];
}
interface SecondaryMetric {
  label: string;
  value: number;
  format: MetricFormat;
}
interface ScorecardResponse {
  kpi_focus: string;
  window_days: number;
  primary: PrimaryMetric;
  secondary: SecondaryMetric[];
  sample_size: number;
}

interface Props {
  agentId: string;
  /** Window length in days; default 30. */
  days?: number;
  /** Optional title override; defaults to "Performance · {N}d". */
  title?: string;
}

export default function AgentScorecard({ agentId, days = 30, title }: Props) {
  const [data, setData] = useState<ScorecardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch(`/api/agents/${agentId}/scorecard?days=${days}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ScorecardResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, days]);

  if (loading && !data) {
    return (
      <section className="rounded-md wl-panel border border-white/10 p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-brand" />
        <span className="app-section-title/70">Loading scorecard</span>
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-md bg-rose-500/8 border border-rose-500/30 p-4 flex items-start gap-2.5"
      >
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <span className="text-xs text-rose-500">Couldn't load scorecard. {error}</span>
      </section>
    );
  }

  if (!data) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-md wl-panel-elevated card-interactive-premium p-5 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
      />

      <header className="relative flex items-start gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border border-white/10 shadow-lg shadow-brand/10"
          style={{
            background:
              "linear-gradient(135deg, rgba(107, 43, 153 ,0.20), rgba(107, 43, 153 ,0.05))",
            color: "#8B3FD6",
          }}
        >
          <Target className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display italic text-lg text-ink leading-tight">
            {title ?? `Performance · ${data.window_days}d`}
          </h3>
          <p className="text-[10px] text-ink/40 leading-relaxed mt-0.5 inline-flex items-center gap-1.5">
            <Sparkles className="w-2.5 h-2.5 text-brand" />
            Optimizing for <span className="text-ink/80 font-medium">{data.kpi_focus}</span>
            {" · "}
            <span className="text-brand font-semibold">{formatInt(data.sample_size)}</span>{" "}
            {data.sample_size === 1 ? "call" : "calls"} sampled
          </p>
        </div>
      </header>

      <div className="relative grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:items-end">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.4em] text-brand mb-1 font-semibold">
            {data.primary.label}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-display italic text-3.5xl md:text-4xl text-ink leading-none tabular-nums font-bold">
              {formatMetricValue(data.primary.value, data.primary.format)}
            </span>
            <DeltaPill pct={data.primary.delta_pct} />
          </div>
        </div>
        <Sparkline values={data.primary.trend ?? []} />
      </div>

      {/* Secondary row */}
      {data.secondary?.length > 0 && (
        <div className="relative mt-5 pt-4 border-t border-brand/10 grid grid-cols-3 gap-2 sm:gap-4">
          {data.secondary.map((s, i) => (
            <div key={`${s.label}-${i}`} className="min-w-0 flex flex-col gap-1">
              <div className="text-[9px] uppercase tracking-[0.25em] font-semibold text-ink/40 truncate">
                {s.label}
              </div>
              <div className="font-display italic text-xl font-bold text-ink leading-none tabular-nums truncate">
                {formatMetricValue(s.value, s.format)}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  if (!Number.isFinite(pct) || pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-mono font-medium bg-white/5 border border-white/10 text-ink/40">
        flat
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-mono font-medium shadow-sm",
        up
          ? "bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 shadow-emerald-500/5"
          : "bg-rose-500/12 border border-rose-500/25 text-rose-400 shadow-rose-500/5",
      )}
    >
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const safe = Array.isArray(values) ? values.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  if (safe.length < 2) {
    return (
      <div className="text-[9px] uppercase tracking-[0.3em] text-ink/40 text-right">
        no trend yet
      </div>
    );
  }
  const max = Math.max(1, ...safe);
  const min = 0;
  const w = 220;
  const h = 44;
  const dx = w / (safe.length - 1);
  const points = safe
    .map((v, i) => {
      const x = i * dx;
      const yScale = max === min ? 0.5 : (v - min) / (max - min);
      const y = h - yScale * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="relative ml-auto h-11 w-full max-w-[220px]">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8B3FD6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8B3FD6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sparkstroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#8B3FD6" />
            <stop offset="100%" stopColor="#8B3FD6" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#sparkstroke)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          className="drop-shadow-[0_2px_8px_rgba(107, 43, 153 ,0.4)]"
        />
        <polygon fill="url(#sparkfill)" points={`0,${h} ${points} ${w},${h}`} />
      </svg>
    </div>
  );
}

function formatMetricValue(v: number, format: MetricFormat): string {
  if (!Number.isFinite(v)) return "—";
  switch (format) {
    case "percent":
      // Inputs are 0..1 fractions from computeScorecard.
      return formatPercent(v, v < 0.01 && v > 0 ? 1 : 0);
    case "seconds": {
      const s = Math.max(0, Math.round(v));
      const m = Math.floor(s / 60);
      const ss = s % 60;
      if (m === 0) return `${ss}s`;
      return `${m}m ${ss.toString().padStart(2, "0")}s`;
    }
    case "score":
      return safeFixed(v, 0);
    case "number":
    default:
      return formatInt(v);
  }
}
