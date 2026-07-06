/* eslint-disable @typescript-eslint/no-explicit-any */
import { WL_BRAND } from "../../lib/wireline-design-system";
import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { BarChart3, TrendingUp, Loader2, Star, Play } from "lucide-react";
import { Button } from "../atoms";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { authFetch, readApiJson } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { OPS_INSIGHTS_EMPTY } from "../../lib/wireline-ops-design";
import type { InsightsQaStatsResponse } from "../../types/api-insights";
import { fetchInsight, InsightSkeleton, ErrCard, qaColor, InsightEmpty } from "./shared";

const QA_BRAND = WL_BRAND.accentHex;

export default function QualityView({ days }: { days: number }) {
  const [data, setData] = useState<InsightsQaStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const fetchStats = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsQaStatsResponse>(`/api/qa/stats?days=${days}`)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e: unknown) => {
        if ((e as any)?.name === "AbortError") return;
        const message = e instanceof Error ? e.message : "Request failed";
        setErr(message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleScoreAll = async () => {
    setScoring(true);
    try {
      const res = await authFetch(`/api/qa/score-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, days }),
      });
      const out = await readApiJson<{
        error?: string;
        scored?: number;
        total?: number;
        failed?: number;
      }>(res);
      if (out.ok === false) throw new Error(out.error);
      const d = out.data;
      if (d.scored === 0 && d.total === 0) {
        toastSuccess("All caught up", "No unscored calls found in this period.");
      } else if ((d.failed ?? 0) > 0) {
        toastWarning(
          "Batch QA partial",
          `Scored ${d.scored} call${d.scored === 1 ? "" : "s"}, ${d.failed} failed. Check logs for details.`,
        );
      } else {
        toastSuccess("Batch QA complete", `Scored ${d.scored} call${d.scored === 1 ? "" : "s"}.`);
      }
      fetchStats();
    } catch (e: any) {
      toastError("Batch scoring failed", e.message);
    } finally {
      setScoring(false);
    }
  };

  if (loading) return <InsightSkeleton />;
  if (err) return <ErrCard error={err} onRetry={fetchStats} />;

  if (!data || data.count === 0) {
    return (
      <div className="space-y-4">
        <InsightEmpty
          configKey="quality"
          icon={Star}
          actionsOverride={[
            {
              label: scoring ? "Scoring…" : "Score All Unscored",
              onClick: () => {
                if (!scoring) void handleScoreAll();
              },
              primary: true,
            },
            ...OPS_INSIGHTS_EMPTY.quality.actions,
          ]}
        />
      </div>
    );
  }

  const dims = data.dimensions || {};
  const radarData = [
    { dimension: "Opening", score: +(((dims.greeting ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Discovery", score: +(((dims.discovery ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Solution", score: +(((dims.solution ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Objections", score: +(((dims.objection ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Closing", score: +(((dims.closing ?? 0) / 20) * 100).toFixed(0) },
  ];

  const distribution = data.distribution || [];
  const maxDist = Math.max(1, ...distribution.map((b) => b.count));

  return (
    <div className="space-y-4 pb-6">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          disableAnimations
          variant="outline"
          size="sm"
          onClick={handleScoreAll}
          disabled={scoring}
          className="rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25 touch-press"
        >
          {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {scoring ? "Scoring…" : "Score All Unscored"}
        </Button>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Scored Calls", value: data.count, accent: QA_BRAND },
          { label: "Average Score", value: `${data.avgScore}/100`, accent: qaColor(data.avgScore) },
          { label: "Opening", value: `${dims.greeting ?? 0}/20`, accent: QA_BRAND },
          { label: "Closing", value: `${dims.closing ?? 0}/20`, accent: QA_BRAND },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="relative rounded-md wl-panel p-4 overflow-hidden"
            data-accent={accent}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-25 blur-3xl pointer-events-none wl-accent-halo" />
            <p className="wl-insight-label mb-2">{label}</p>
            <p className="font-display italic text-2xl leading-none wl-accent-text">{value}</p>
          </div>
        ))}
      </div>

      {/* Distribution + Radar */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-md wl-panel p-5">
          <h4 className="font-mono wl-label-muted mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> Score Distribution
          </h4>
          <div className="space-y-2.5">
            {distribution.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="wl-micro-meta--muted w-28 shrink-0">{bucket.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / maxDist) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full wl-qa-bg"
                    data-qa-color={bucket.color || QA_BRAND}
                  />
                </div>
                <span className="wl-micro-badge font-mono text-foreground w-6 text-right shrink-0">
                  {bucket.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md wl-panel p-5">
          <h4 className="font-mono wl-label-muted mb-2 flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Dimension Averages (% of max)
          </h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={70}>
                <PolarGrid stroke="var(--wireline-color-border-soft)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="score"
                  stroke={QA_BRAND}
                  fill={QA_BRAND}
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 7-day trend */}
      {data.trend && data.trend.length > 1 && (
        <div className="rounded-md wl-panel p-5">
          <h4 className="font-mono wl-label-muted mb-4 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> QA Score Trend
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="qaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={QA_BRAND} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={QA_BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--wireline-color-border-soft)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
                    fontSize: "12px",
                    padding: "8px 12px",
                  }}
                  labelStyle={{
                    color: "var(--muted-foreground)",
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                  itemStyle={{ color: "var(--foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke={QA_BRAND}
                  strokeWidth={1.5}
                  fill="url(#qaGrad)"
                  name="Avg QA Score"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Dimension detail table */}
      <div className="rounded-md wl-panel overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h4 className="font-mono wl-label-muted flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Rubric Dimensions
          </h4>
        </div>
        <div className="divide-y divide-border">
          {(
            [
              { key: "greeting" as const, label: "Opening & Greeting" },
              { key: "discovery" as const, label: "Problem Discovery" },
              { key: "solution" as const, label: "Solution Presentation" },
              { key: "objection" as const, label: "Objection Handling" },
              { key: "closing" as const, label: "Closing & Next Steps" },
            ] as const
          ).map(({ key, label }) => {
            const avg = dims[key] ?? 0;
            const pct = Math.round((avg / 20) * 100);
            return (
              <div key={key} className="px-5 py-3.5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[var(--wireline-typography-overline-size)] text-foreground font-medium">
                    {label}
                  </p>
                </div>
                <div className="w-28 flex items-center gap-2 shrink-0">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full wl-qa-bg"
                      data-qa-color={qaColor(pct)}
                    />
                  </div>
                  <span className="wl-micro-badge font-mono text-foreground w-8 text-right">
                    {avg}/20
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
