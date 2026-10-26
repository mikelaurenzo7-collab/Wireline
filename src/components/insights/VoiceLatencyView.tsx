import { useEffect, useState } from "react";
import { Gauge, Activity, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { AuditSummary, VoiceLatencyInsightsResponse } from "../../types/api-insights";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";
import { insightActionLabel } from "./insight-action-labels";

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

    Promise.all([
      fetchInsight<AuditSummary>(`/api/audit/summary?days=${days}`),
      fetchInsight<VoiceLatencyInsightsResponse>(`/api/insights/latency?days=${days}`),
    ])
      .then(([actionD, voiceD]) => {
        if (!active) return;
        if (
          !actionD?.latency ||
          !Number.isFinite(actionD.latency.sample_count) ||
          !Number.isFinite(actionD.latency.p50_ms) ||
          !Number.isFinite(actionD.latency.p95_ms) ||
          !Array.isArray(voiceD?.trends)
        ) {
          throw new Error("Latency response is incomplete");
        }
        setActionData(actionD);
        setVoiceData(voiceD);
      })
      .catch(() => {
        if (active) setErr("Latency data is unavailable. Try again.");
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

  const voiceTrends = voiceData?.trends ?? [];
  const latestTrend = voiceTrends[voiceTrends.length - 1];
  const hasVoiceMetrics = voiceTrends.length > 0 && latestTrend?.avgTtftMs != null;
  const maxAverageTtftMs = Math.max(1, ...voiceTrends.map((trend) => trend.avgTtftMs ?? 0));

  const ttftHealthy = latestTrend?.p95TtftMs == null || latestTrend.p95TtftMs <= 1200;
  const errorRateHealthy = latestTrend == null || latestTrend.errorRate <= 5;

  if (latency.sample_count === 0 && !hasVoiceMetrics) {
    return <InsightEmpty configKey="latency" icon={Gauge} />;
  }

  const maxCallSeconds = voiceData?.max_call_seconds;
  const maxCallLength =
    typeof maxCallSeconds === "number" && Number.isFinite(maxCallSeconds) && maxCallSeconds > 0
      ? [
          Math.floor(maxCallSeconds / 60) ? `${Math.floor(maxCallSeconds / 60)} min` : "",
          maxCallSeconds % 60 ? `${maxCallSeconds % 60}s` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : null;
  const guards = [
    { label: "Tool Confirmation Timeout", value: "20s" },
    ...(maxCallLength ? [{ label: "Max Call Length", value: maxCallLength }] : []),
    { label: "TTFT Target", value: "<900ms", healthy: true },
    { label: "TTFT Alert", value: ">1.2s", healthy: false },
  ];

  return (
    <div className="space-y-4">
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
                label: "Average TTFT",
                value: latestTrend?.avgTtftMs != null ? `${latestTrend.avgTtftMs}ms` : "N/A",
                healthy: ttftHealthy,
              },
              {
                icon: Gauge,
                label: "TTFT p95",
                value: latestTrend?.p95TtftMs != null ? `${latestTrend.p95TtftMs}ms` : "N/A",
                healthy: ttftHealthy,
              },
              {
                icon: Activity,
                label: "Pipeline Errors",
                value:
                  latestTrend?.errorRate != null ? `${latestTrend.errorRate.toFixed(1)}%` : "N/A",
                healthy: errorRateHealthy,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className={cn(
                  "rounded-md border p-4",
                  tile.healthy
                    ? "bg-brand/8 border-brand/20"
                    : "bg-[var(--wireline-color-feedback-warning-surface)] border-[var(--wireline-color-feedback-warning-border)]",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <tile.icon
                    className={cn("w-3 h-3", tile.healthy ? "text-brand" : "text-warning")}
                  />
                  <p className="font-mono wl-label text-muted">{tile.label}</p>
                </div>
                <p
                  className={cn(
                    "font-display text-2xl",
                    tile.healthy ? "text-brand" : "text-warning",
                  )}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          {voiceTrends.length > 1 && (
            <div className="mt-4">
              <p className="wl-insight-label mb-1">TTFT trend over {days} days</p>
              <p className="mb-3 text-xs text-muted">Average TTFT · Milliseconds</p>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2">
                <div className="flex h-20 flex-col justify-between text-right text-xs tabular-nums text-muted">
                  <span>{maxAverageTtftMs}ms</span>
                  <span>0</span>
                </div>
                <div className="flex items-end gap-1 h-20">
                  {voiceTrends.map((t) => {
                    const height = (Math.max(0, t.avgTtftMs ?? 0) / maxAverageTtftMs) * 100;
                    const isAlert = t.p95TtftMs != null && t.p95TtftMs > 1200;
                    return (
                      <div
                        key={t.date}
                        className={cn("flex-1 rounded-t", isAlert ? "bg-amber-400" : "bg-brand/60")}
                        style={{ height: `${height}%` }}
                        title={`${t.date}: avg ${t.avgTtftMs ?? "N/A"}ms, p95 ${t.p95TtftMs ?? "N/A"}ms`}
                      />
                    );
                  })}
                </div>
                <span />
                <div className="flex justify-between gap-3 text-xs tabular-nums text-muted">
                  <time dateTime={voiceTrends[0].date}>{voiceTrends[0].date}</time>
                  <time dateTime={latestTrend.date}>{latestTrend.date}</time>
                </div>
              </div>
            </div>
          )}

          {!ttftHealthy && (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-[var(--wireline-color-feedback-warning-surface)] border border-[var(--wireline-color-feedback-warning-border)]">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-[var(--wireline-color-status-warning)]">
                TTFT p95 &gt; 1.2s
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Median Action Time", value: `${latency.p50_ms}ms` },
          { label: "95th Percentile Action Time", value: `${latency.p95_ms}ms` },
          {
            label: "Average Action Time",
            value: `${actionData?.totals?.avg_latency ?? 0}ms`,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="stat-tile-mobile rounded-md wl-panel border border-border p-5"
          >
            <p className="wl-insight-label mb-2">{tile.label}</p>
            <p className="metric-value font-display text-3xl text-foreground">{tile.value}</p>
            {tile.label === "Average Action Time" && (
              <p className="wl-insight-label mt-2 tabular-nums">{latency.sample_count} samples</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md wl-panel border border-border p-5">
          <p className="wl-insight-label text-brand/70 mb-4">Live Call Limits</p>
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
          <p className="wl-insight-label text-brand/70 mb-4">Slowest Actions</p>
          <div className="space-y-2">
            {slowest.length === 0 ? (
              <p className="text-sm text-muted">N/A</p>
            ) : (
              slowest.map((a) => (
                <div
                  key={a.action}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm text-foreground/85 truncate">
                    {insightActionLabel(a.action)}
                  </span>
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
