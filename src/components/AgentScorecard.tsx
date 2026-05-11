// AgentScorecard — outcome-aligned per-agent reporting card.
//
// Hits GET /api/agents/:id/scorecard?days=N which returns the metric
// definition that matches the agent's kpi_focus (set in
// AgentBusinessProfile). One render path handles every focus by
// branching on the response's `format` ('percent' | 'number' |
// 'seconds' | 'score').

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  TrendingUp, TrendingDown, Loader2, Target, Sparkles, AlertTriangle,
} from "lucide-react";
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
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ScorecardResponse) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agentId, days]);

  if (loading && !data) {
    return (
      <section className="rounded-2xl glass border border-white/10 p-5 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-brand" />
        <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading scorecard</span>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl bg-rose-500/8 border border-rose-500/30 p-4 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <span className="text-xs text-rose-500">Couldn't load scorecard. {error}</span>
      </section>
    );
  }

  if (!data) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl glass border border-white/10 p-4 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #0AC8D4, transparent)" }}
      />

      <header className="relative flex items-start gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
          style={{
            background: "linear-gradient(135deg, rgba(10,200,212,0.20), rgba(10,200,212,0.05))",
            color: "#0AC8D4",
          }}
        >
          <Target className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display italic text-lg text-ink leading-tight">
            {title ?? `Performance · ${data.window_days}d`}
          </h3>
          <p className="text-[10px] text-muted/70 leading-relaxed mt-0.5 inline-flex items-center gap-1.5">
            <Sparkles className="w-2.5 h-2.5" />
            Optimizing for <span className="text-ink/80 font-medium">{data.kpi_focus}</span>
            {" · "}
            {formatInt(data.sample_size)} {data.sample_size === 1 ? "call" : "calls"} sampled
          </p>
        </div>
      </header>

      <div className="relative grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:items-end">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.4em] text-brand mb-1">{data.primary.label}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-display italic text-3xl md:text-4xl text-ink leading-none tabular-nums">
              {formatMetricValue(data.primary.value, data.primary.format)}
            </span>
            <DeltaPill pct={data.primary.delta_pct} />
          </div>
        </div>
        <Sparkline values={data.primary.trend ?? []} />
      </div>

      {/* Secondary row */}
      {data.secondary?.length > 0 && (
        <div className="relative mt-5 pt-4 border-t border-white/8 grid grid-cols-3 gap-3">
          {data.secondary.map((s, i) => (
            <div key={`${s.label}-${i}`} className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.32em] text-muted/65 mb-1 truncate">{s.label}</div>
              <div className="font-display italic text-lg text-ink/85 leading-none tabular-nums truncate">
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
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted/55">
        flat
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em]",
      up ? "text-emerald-600" : "text-rose-500",
    )}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const safe = Array.isArray(values) ? values.map(v => Number.isFinite(v) ? v : 0) : [];
  if (safe.length < 2) {
    return <div className="text-[9px] uppercase tracking-[0.3em] text-muted/40 text-right">no trend yet</div>;
  }
  const max = Math.max(1, ...safe);
  const min = 0;
  const w = 220;
  const h = 44;
  const dx = w / (safe.length - 1);
  const points = safe.map((v, i) => {
    const x = i * dx;
    const yScale = max === min ? 0.5 : (v - min) / (max - min);
    const y = h - yScale * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="relative ml-auto h-11 w-full max-w-[220px]">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0AC8D4" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0AC8D4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="#0AC8D4"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <polygon
          fill="url(#sparkfill)"
          points={`0,${h} ${points} ${w},${h}`}
        />
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
