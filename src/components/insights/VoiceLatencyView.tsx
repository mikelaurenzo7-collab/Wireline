/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Gauge, Mic, Volume2, Activity, AlertTriangle } from "lucide-react";
import {
  MAX_VAPI_PARALLEL_TOOL_CALLS,
  MAX_VAPI_TOOL_RESULT_CHARS,
  VAPI_TOOL_TIMEOUT_MS,
} from "../../lib/vapi-tool-results";
import { fetchInsight, Spinner, ErrCard } from "./shared";

interface VoiceTrend {
  date: string;
  avgTtftMs: number | null;
  p95TtftMs: number | null;
  errorRate: number;
}

interface VoiceLatencyData {
  days: number;
  trends: VoiceTrend[];
  generated_at: string;
}

export default function VoiceLatencyView({ days }: { days: number }) {
  const [actionData, setActionData] = useState<any>(null);
  const [voiceData, setVoiceData] = useState<VoiceLatencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);

    // Fetch both action latency (existing) and voice observability (new)
    Promise.all([
      fetchInsight(`/api/audit/summary?days=${days}`).catch(() => null),
      fetchInsight<VoiceLatencyData>(`/api/insights/latency?days=${days}`).catch(() => null),
    ])
      .then(([actionD, voiceD]) => {
        if (!active) return;
        setActionData(actionD);
        setVoiceData(voiceD);
      })
      .catch((e) => {
        if (active) setErr(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;

  const latency = actionData?.latency ?? { p50_ms: 0, p95_ms: 0, sample_count: 0 };
  const slowest = [...(actionData?.by_action ?? [])]
    .sort((a: any, b: any) => b.avg_latency_ms - a.avg_latency_ms)
    .slice(0, 8);

  // Compute voice observability summary from trends
  const voiceTrends = voiceData?.trends ?? [];
  const latestTrend = voiceTrends[voiceTrends.length - 1];
  const hasVoiceMetrics = voiceTrends.length > 0 && latestTrend?.avgTtftMs != null;

  // Voice health indicators
  const ttftHealthy = latestTrend?.p95TtftMs == null || latestTrend.p95TtftMs <= 1200;
  const errorRateHealthy = latestTrend == null || latestTrend.errorRate <= 5;

  if (latency.sample_count === 0 && !hasVoiceMetrics) {
    return (
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong border border-black/8 p-10 md:p-14 text-center flex flex-col items-center gap-5">
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
            />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
              <Gauge className="w-6 h-6" />
            </div>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
            Voice Latency
          </p>
          <h3 className="font-display italic text-2xl text-ink text-balance">
            No latency samples yet
          </h3>
          <p className="text-sm text-muted/80 max-w-md text-pretty leading-relaxed">
            Run live calls and AI actions — p50/p95 response times appear here from your audit log
            and voice provider telemetry.
          </p>
        </div>
      </div>
    );
  }

  const guards = [
    { label: "Parallel tools cap", value: String(MAX_VAPI_PARALLEL_TOOL_CALLS) },
    { label: "Tool timeout", value: `${VAPI_TOOL_TIMEOUT_MS / 1000}s` },
    { label: "Tool result cap", value: `${MAX_VAPI_TOOL_RESULT_CHARS} chars` },
    { label: "TTFT target", value: "<900ms", healthy: true },
    { label: "TTFT alert", value: ">1.2s", healthy: false },
  ];

  return (
    <div className="space-y-4">
      {/* Voice Observability Section */}
      {hasVoiceMetrics && (
        <div className="rounded-2xl glass border border-black/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-brand" />
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
              Voice Pipeline Telemetry
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              {
                icon: Gauge,
                label: "TTFT p50",
                value: latestTrend?.avgTtftMs ? `${latestTrend.avgTtftMs}ms` : "—",
                sub: "median time-to-first-token",
                healthy: ttftHealthy,
              },
              {
                icon: Gauge,
                label: "TTFT p95",
                value: latestTrend?.p95TtftMs ? `${latestTrend.p95TtftMs}ms` : "—",
                sub: "tail latency",
                healthy: ttftHealthy,
              },
              {
                icon: Mic,
                label: "STT health",
                value:
                  latestTrend?.errorRate != null ? `${latestTrend.errorRate.toFixed(1)}%` : "—",
                sub: "error rate",
                healthy: errorRateHealthy,
              },
              {
                icon: Volume2,
                label: "TTS health",
                value:
                  latestTrend?.errorRate != null ? `${latestTrend.errorRate.toFixed(1)}%` : "—",
                sub: "error rate",
                healthy: errorRateHealthy,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className={cn(
                  "rounded-xl border p-4",
                  tile.healthy
                    ? "bg-emerald-50/50 border-emerald-200/50"
                    : "bg-amber-50/50 border-amber-200/50",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <tile.icon
                    className={cn("w-3 h-3", tile.healthy ? "text-emerald-600" : "text-amber-600")}
                  />
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted">
                    {tile.label}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-display italic text-2xl",
                    tile.healthy ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  {tile.value}
                </p>
                <p className="text-[10px] text-muted/70 mt-1">{tile.sub}</p>
              </div>
            ))}
          </div>

          {/* Trend mini-chart */}
          {voiceTrends.length > 1 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-3">
                {days}-day TTFT trend
              </p>
              <div className="flex items-end gap-1 h-20">
                {voiceTrends.map((t) => {
                  const height = t.avgTtftMs
                    ? Math.min(100, Math.max(10, (t.avgTtftMs / 1500) * 100))
                    : 10;
                  const isAlert = t.p95TtftMs != null && t.p95TtftMs > 1200;
                  return (
                    <div
                      key={t.date}
                      className={cn("flex-1 rounded-t", isAlert ? "bg-amber-400" : "bg-brand/60")}
                      style={{ height: `${height}%` }}
                      title={`${t.date}: avg ${t.avgTtftMs ?? "—"}ms, p95 ${t.p95TtftMs ?? "—"}ms`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {!ttftHealthy && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                TTFT p95 exceeds 1.2s alert threshold. Voice pipeline may be degraded — check
                provider status.
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Action Latency Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "p50 latency", value: `${latency.p50_ms}ms`, sub: "median AI + tool RTT" },
          {
            label: "p95 latency",
            value: `${latency.p95_ms}ms`,
            sub: "tail — watch for regressions",
          },
          {
            label: "Avg latency",
            value: `${actionData?.totals?.avg_latency ?? 0}ms`,
            sub: `${latency.sample_count} samples`,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="stat-tile-mobile rounded-2xl glass border border-black/8 p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
              {tile.label}
            </p>
            <p className="metric-value font-display italic text-3xl text-ink">{tile.value}</p>
            <p className="text-[10px] text-muted/70 mt-2">{tile.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl glass border border-black/8 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-4">
            Live-call guards (Wireline defaults)
          </p>
          <ul className="space-y-3">
            {guards.map((g: any) => (
              <li key={g.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink/80">{g.label}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    g.healthy === false ? "text-amber-600" : "text-brand",
                  )}
                >
                  {g.value}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted/70 mt-4 leading-relaxed text-pretty">
            These limits keep voice tool fan-out and assistant payloads bounded so callers hear
            answers faster — the same caps described on the Compare page vs DIY voice stacks.
          </p>
        </div>

        <div className="rounded-2xl glass border border-black/8 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-4">
            Slowest actions
          </p>
          <div className="space-y-2">
            {slowest.length === 0 ? (
              <p className="text-sm text-muted">No slow actions recorded.</p>
            ) : (
              slowest.map((a: any) => (
                <div
                  key={a.action}
                  className="flex items-center justify-between gap-3 py-2 border-b border-black/5 last:border-0"
                >
                  <span className="text-sm text-ink/85 truncate">{a.action}</span>
                  <span className="font-mono text-[11px] text-muted shrink-0">
                    {a.avg_latency_ms}ms · {a.calls}×
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Utility for cleaner tailwind classes
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
