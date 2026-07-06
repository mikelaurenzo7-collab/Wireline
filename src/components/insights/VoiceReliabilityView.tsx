import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  DollarSign,
  Gauge,
  PhoneOff,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../../lib/utils";
import { VOICE_VARIABLE_COST_PER_MIN_USD } from "../../lib/plan-catalog";
import type {
  VoiceLatencyRecentCallRow,
  VoiceReliabilityResponse,
} from "../../types/api";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";

function formatPct(value: number | null, fallback = "—"): string {
  return value == null ? fallback : `${value.toFixed(1)}%`;
}

function formatUsd(value: number | null, digits = 3): string {
  return value == null ? "—" : `$${value.toFixed(digits)}`;
}

export default function VoiceReliabilityView({ days }: { days: number }) {
  const [data, setData] = useState<VoiceReliabilityResponse | null>(null);
  const [recent, setRecent] = useState<VoiceLatencyRecentCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);

    Promise.all([
      fetchInsight<VoiceReliabilityResponse>(`/api/insights/voice-reliability?days=${days}`),
      fetchInsight<{ calls: VoiceLatencyRecentCallRow[] }>(`/api/insights/latency/recent?limit=25`).catch(
        () => ({ calls: [] }),
      ),
    ])
      .then(([reliability, recentData]) => {
        if (!active) return;
        setData(reliability);
        setRecent(recentData.calls ?? []);
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
  if (!data || data.summary.totalCalls === 0) {
    return <InsightEmpty configKey="reliability" icon={ShieldAlert} />;
  }

  const { summary, trends } = data;
  const topHangups = Object.entries(summary.hangups.byReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const tiles = [
    {
      icon: Gauge,
      label: "TTFT p95",
      value: summary.latency.ttftP95Ms != null ? `${summary.latency.ttftP95Ms}ms` : "—",
      sub: "target <1.2s",
      healthy: summary.latency.healthy,
    },
    {
      icon: PhoneOff,
      label: "Abnormal hangups",
      value: formatPct(summary.hangups.abnormalRatePct, "0.0%"),
      sub: `${summary.hangups.abnormalCount} calls`,
      healthy: summary.hangups.abnormalRatePct <= 10,
    },
    {
      icon: Wrench,
      label: "Tool-call success",
      value: formatPct(summary.toolCalls.successRatePct),
      sub:
        summary.toolCalls.total > 0
          ? `${summary.toolCalls.total - summary.toolCalls.failed}/${summary.toolCalls.total}`
          : "no tool calls yet",
      healthy: summary.toolCalls.successRatePct == null || summary.toolCalls.successRatePct >= 95,
    },
    {
      icon: ShieldAlert,
      label: "Escalation success",
      value: formatPct(summary.escalations.successRatePct),
      sub:
        summary.escalations.attempted > 0
          ? `${summary.escalations.succeeded}/${summary.escalations.attempted}`
          : "no escalations yet",
      healthy:
        summary.escalations.successRatePct == null || summary.escalations.successRatePct >= 90,
    },
    {
      icon: Activity,
      label: "Webhook failures",
      value: formatPct(summary.webhooks.failureRatePct),
      sub: `${summary.webhooks.failures}/${summary.webhooks.total || 0} events`,
      healthy: summary.webhooks.failureRatePct == null || summary.webhooks.failureRatePct <= 5,
    },
    {
      icon: DollarSign,
      label: "COGS / min",
      value: formatUsd(summary.economics.cogsPerMinUsd),
      sub: `est. $${VOICE_VARIABLE_COST_PER_MIN_USD}/min · margin ${formatPct(summary.economics.grossMarginPct)}`,
      healthy:
        summary.economics.cogsPerMinUsd == null ||
        summary.economics.cogsPerMinUsd <= VOICE_VARIABLE_COST_PER_MIN_USD * 1.15,
    },
  ];

  return (
    <div className="space-y-4">
      {!summary.healthy && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-[var(--wireline-color-status-warning)]">
            Voice reliability is below operating thresholds in the last {summary.windowDays} days.
            Review latency, hangups, tool calls, escalations, and webhook health below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={cn(
              "rounded-md border p-4 wl-panel",
              tile.healthy ? "border-brand/20 bg-brand/5" : "border-amber-200/70 bg-amber-500/10",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <tile.icon
                className={cn("w-3.5 h-3.5", tile.healthy ? "text-brand" : "text-amber-600")}
              />
              <p className="font-mono wl-label text-muted">{tile.label}</p>
            </div>
            <p
              className={cn(
                "font-display italic text-2xl",
                tile.healthy ? "text-foreground" : "text-amber-600",
              )}
            >
              {tile.value}
            </p>
            <p className="wl-director-meta mt-1">{tile.sub}</p>
          </div>
        ))}
      </div>

      {trends.length > 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-md wl-panel border border-border p-5">
            <p className="wl-insight-label text-brand/70 mb-4">TTFT trend</p>
            <div className="h-52 min-h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--wireline-color-border-soft)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="ms" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="avgTtftMs"
                    name="Avg TTFT"
                    stroke="var(--wireline-color-action-primary-default)"
                    strokeWidth={2}
                    fill="var(--wireline-color-action-primary-default)"
                    fillOpacity={0.08}
                  />
                  <Area
                    type="monotone"
                    dataKey="p95TtftMs"
                    name="p95 TTFT"
                    stroke="var(--muted-foreground)"
                    strokeWidth={2}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.08}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-md wl-panel border border-border p-5">
            <p className="wl-insight-label text-brand/70 mb-4">Failure rates</p>
            <div className="h-52 min-h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--wireline-color-border-soft)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="abnormalHangupRate"
                    name="Hangups"
                    stackId="1"
                    stroke="var(--muted-foreground)"
                    fill="var(--muted-foreground)"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="toolCallFailureRate"
                    name="Tool failures"
                    stackId="1"
                    stroke="var(--foreground)"
                    fill="var(--foreground)"
                    fillOpacity={0.08}
                  />
                  <Area
                    type="monotone"
                    dataKey="webhookFailureRate"
                    name="Webhook failures"
                    stackId="1"
                    stroke="var(--destructive)"
                    fill="var(--destructive)"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md wl-panel border border-border p-5">
          <p className="wl-insight-label text-brand/70 mb-4">Hangup reasons</p>
          <div className="space-y-2">
            {topHangups.length === 0 ? (
              <p className="text-sm text-muted">No hangup reasons recorded yet.</p>
            ) : (
              topHangups.map(([reason, count]) => (
                <div
                  key={reason}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm text-foreground/85 truncate">{reason}</span>
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] text-muted shrink-0">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-md wl-panel border border-border p-5">
          <p className="wl-insight-label text-brand/70 mb-4">Recent calls</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {recent.length === 0 ? (
              <p className="text-sm text-muted">No recent calls with metrics.</p>
            ) : (
              recent.map((call) => (
                <div
                  key={String(call.id)}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground/85 truncate">
                      {call.outcomeTag || call.sentiment || "call"}
                    </p>
                    <p className="text-[var(--wireline-typography-overline-size)] text-muted font-mono">
                      {call.ttftMs != null ? `${call.ttftMs}ms TTFT` : "no TTFT"}
                      {call.pipelineError ? ` · ${call.pipelineError}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] text-muted shrink-0">
                    {call.durationSeconds ?? 0}s
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
