import { useEffect, useState } from "react";
import { Gauge, Activity, AlertTriangle } from "lucide-react";
import {
  MAX_VAPI_PARALLEL_TOOL_CALLS,
  MAX_VAPI_TOOL_RESULT_CHARS,
  VAPI_TOOL_TIMEOUT_MS,
} from "../../lib/vapi-tool-results";
import { cn } from "../../lib/utils";
import type { AuditSummary, VoiceLatencyInsightsResponse } from "../../types/api-insights";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";

export default function VoiceLatencyView({ days }: { days: number }) {
  const [actionData, setActionData] = useState<AuditSummary | null>(null);
  const [voiceData, setVoiceData] = useState<VoiceLatencyInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);

    // Fetch both action latency (existing) and voice observability (new)
    Promise.all([
      fetchInsight<AuditSummary>(`/api/audit/summary?days=${days}`).catch(() => null),
      fetchInsight<VoiceLatencyInsightsResponse>(`/api/insights/latency?days=${days}`).catch(
        () => null,
      ),
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
  }, [days, reloadKey]);

  if (loading) return <InsightSkeleton />;
  if (err) return <ErrCard error={err} onRetry={() => setReloadKey((k) => k + 1)} />;

  const latency = actionData?.latency ?? { p50_ms: 0, p95_ms: 0, sample_count: 0 };
  const slowest = [...(actionData?.by_action ?? [])]
    .sort((a, b) => b.avg_latency_ms - a.avg_latency_ms)
    .slice(0, 8);

  // Compute voice observability summary from trends
  const voiceTrends = voiceData?.trends ?? [];
  const latestTrend = voiceTrends[voiceTrends.length - 1];
  const hasVoiceMetrics = voiceTrends.length > 0 && latestTrend?.avgTtftMs != null;

  // Voice health indicators
  const ttftHealthy = latestTrend?.p95TtftMs == null || latestTrend.p95TtftMs <= 1200;
  const errorRateHealthy = latestTrend == null || latestTrend.errorRate <= 5;

  if (latency.sample_count === 0 && !hasVoiceMetrics) {
    return <InsightEmpty configKey="latency" icon={Gauge} />;
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
        <div className="rounded-md wl-panel border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-brand" />
            <p className="wl-insight-label text-brand/70">Voice Pipeline Metrics</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {[
              {
                icon: Gauge,
                label: "TTFT p50",
                value: latestTrend?.avgTtftMs ? `${latestTrend.avgTtftMs}ms` : "—",
                healthy: ttftHealthy,
              },
              {
                icon: Gauge,
                label: "TTFT p95",
                value: latestTrend?.p95TtftMs ? `${latestTrend.p95TtftMs}ms` : "—",
                healthy: ttftHealthy,
              },
              {
                icon: Activity,
                label: "Pipeline errors",
                value:
                  latestTrend?.errorRate != null ? `${latestTrend.errorRate.toFixed(1)}%` : "—",
                healthy: errorRateHealthy,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className={cn(
                  "rounded-md border p-4",
                  tile.healthy
                    ? "bg-brand/8 border-brand/20"
                    : "bg-amber-50/50 border-amber-200/50",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <tile.icon
                    className={cn("w-3 h-3", tile.healthy ? "text-brand" : "text-brand-deep")}
                  />
                  <p className="font-mono wl-label text-muted">{tile.label}</p>
                </div>
                <p
                  className={cn(
                    "font-display italic text-2xl",
                    tile.healthy ? "text-brand" : "text-brand-deep",
                  )}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          {/* Trend mini-chart */}
          {voiceTrends.length > 1 && (
            <div className="mt-4">
              <p className="wl-insight-label mb-3">{days}-day TTFT trend</p>
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
            <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">TTFT p95 &gt; 1.2s</p>
            </div>
          )}
        </div>
      )}

      {/* AI Action Latency Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "p50 latency", value: `${latency.p50_ms}ms` },
          { label: "p95 latency", value: `${latency.p95_ms}ms` },
          {
            label: "Avg latency",
            value: `${actionData?.totals?.avg_latency ?? 0}ms`,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="stat-tile-mobile rounded-md wl-panel border border-border p-5"
          >
            <p className="wl-insight-label mb-2">{tile.label}</p>
            <p className="metric-value font-display italic text-3xl text-foreground">
              {tile.value}
            </p>
            {tile.label === "Avg latency" && (
              <p className="wl-insight-label mt-2 tabular-nums">{latency.sample_count} samples</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md wl-panel border border-border p-5">
          <p className="wl-insight-label text-brand/70 mb-4">
            Live-call guards (Wireline defaults)
          </p>
          <ul className="space-y-3">
            {guards.map((g) => (
              <li key={g.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/80">{g.label}</span>
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
        </div>

        <div className="rounded-md wl-panel border border-border p-5">
          <p className="wl-insight-label text-brand/70 mb-4">Slowest actions</p>
          <div className="space-y-2">
            {slowest.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              slowest.map((a) => (
                <div
                  key={a.action}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm text-foreground/85 truncate">{a.action}</span>
                  <span className="font-mono text-[length:var(--wireline-typography-overline-size)] text-muted shrink-0">
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
