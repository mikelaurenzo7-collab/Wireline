/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import {
  MAX_VAPI_PARALLEL_TOOL_CALLS,
  MAX_VAPI_TOOL_RESULT_CHARS,
  VAPI_TOOL_TIMEOUT_MS,
} from "../../lib/vapi-tool-results";
import { fetchInsight, Spinner, ErrCard } from "./shared";

export default function VoiceLatencyView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/audit/summary?days=${days}`)
      .then((d) => {
        if (active) setData(d);
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
  if (!data) return null;

  const latency = data.latency ?? { p50_ms: 0, p95_ms: 0, sample_count: 0 };
  const slowest = [...(data.by_action ?? [])]
    .sort((a: any, b: any) => b.avg_latency_ms - a.avg_latency_ms)
    .slice(0, 8);

  if (latency.sample_count === 0) {
    return (
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong p-10 md:p-14 text-center flex flex-col items-center gap-4">
          <Gauge className="w-10 h-10 text-brand" />
          <h3 className="font-display italic text-2xl text-ink text-balance">
            No latency samples yet
          </h3>
          <p className="text-sm text-muted/80 max-w-md text-pretty leading-relaxed">
            Run live calls and AI actions — p50/p95 response times appear here from your audit log.
          </p>
        </div>
      </div>
    );
  }

  const guards = [
    { label: "Parallel tools cap", value: String(MAX_VAPI_PARALLEL_TOOL_CALLS) },
    { label: "Tool timeout", value: `${VAPI_TOOL_TIMEOUT_MS / 1000}s` },
    { label: "Tool result cap", value: `${MAX_VAPI_TOOL_RESULT_CHARS} chars` },
  ];

  return (
    <div className="space-y-4">
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
            value: `${data.totals?.avg_latency ?? 0}ms`,
            sub: `${latency.sample_count} samples`,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="stat-tile-mobile rounded-2xl glass border border-black/8 p-5"
          >
            <p className="text-[9px] uppercase tracking-[0.32em] text-muted mb-2">{tile.label}</p>
            <p className="metric-value font-display italic text-3xl text-ink">{tile.value}</p>
            <p className="text-[10px] text-muted/70 mt-2">{tile.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl glass border border-black/8 p-5">
          <p className="text-[10px] uppercase tracking-[0.38em] text-brand mb-4">
            Live-call guards (Wireline defaults)
          </p>
          <ul className="space-y-3">
            {guards.map((g) => (
              <li key={g.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink/80">{g.label}</span>
                <span className="font-mono text-brand tabular-nums">{g.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted/65 mt-4 leading-relaxed text-pretty">
            These limits keep voice tool fan-out and assistant payloads bounded so callers hear
            answers faster — the same caps described on the Compare page vs DIY voice stacks.
          </p>
        </div>

        <div className="rounded-2xl glass border border-black/8 p-5">
          <p className="text-[10px] uppercase tracking-[0.38em] text-brand mb-4">Slowest actions</p>
          <div className="space-y-2">
            {slowest.map((a: any) => (
              <div
                key={a.action}
                className="flex items-center justify-between gap-3 py-2 border-b border-black/5 last:border-0"
              >
                <span className="text-sm text-ink/85 truncate">{a.action}</span>
                <span className="font-mono text-[11px] text-muted shrink-0">
                  {a.avg_latency_ms}ms · {a.calls}×
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
