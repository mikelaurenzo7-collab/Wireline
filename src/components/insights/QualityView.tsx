/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { BarChart3, TrendingUp, Loader2, Star, Play } from "lucide-react";
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
import { fetchInsight, Spinner, qaColor } from "./shared";

export default function QualityView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const fetchStats = useCallback(() => {
    setLoading(true);
    fetchInsight(`/api/qa/stats?days=${days}`)
      .then(setData)
      .catch((e: unknown) => {
        if ((e as any)?.name !== "AbortError")
          toastError("QA stats unavailable", "Could not load quality data. Please refresh.");
      })
      .finally(() => setLoading(false));
  }, [days, toastError]);

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

  if (loading) return <Spinner />;

  if (!data || data.count === 0) {
    return (
      <div className="space-y-4">
        <div className="relative aurora-ring rounded-3xl">
          <div className="relative rounded-3xl glass-strong overflow-hidden p-10 md:p-14 flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
              />
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
                <Star className="w-8 h-8" />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-2">
                Call Quality
              </p>
              <h3 className="font-display italic text-3xl text-ink mb-2">No QA scores yet</h3>
              <p className="text-sm text-ink/65 max-w-sm leading-relaxed">
                Score an individual call in Call Logs, or use{" "}
                <strong className="text-brand">Score All Unscored</strong> below to batch-evaluate
                up to 20 calls at once.
              </p>
            </div>
            <button
              onClick={handleScoreAll}
              disabled={scoring}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 text-[11px] uppercase tracking-[0.25em] active:scale-95 transition-all duration-200 disabled:opacity-50"
            >
              {scoring ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {scoring ? "Scoring…" : "Score All Unscored"}
            </button>
          </div>
        </div>
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

  const distribution: any[] = data.distribution || [];
  const maxDist = Math.max(1, ...distribution.map((b: any) => b.count));

  return (
    <div className="space-y-4 pb-6">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleScoreAll}
          disabled={scoring}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors disabled:opacity-50"
        >
          {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {scoring ? "Scoring…" : "Score All Unscored"}
        </button>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Scored Calls", value: data.count, accent: "#8B3FD6" },
          { label: "Average Score", value: `${data.avgScore}/100`, accent: qaColor(data.avgScore) },
          { label: "Opening", value: `${dims.greeting ?? 0}/20`, accent: "#8B3FD6" },
          { label: "Closing", value: `${dims.closing ?? 0}/20`, accent: "#8B3FD6" },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="relative rounded-2xl glass border border-black/8 p-4 overflow-hidden"
          >
            <div
              className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-25 blur-3xl pointer-events-none"
              style={{ background: `radial-gradient(circle,${accent},transparent)` }}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
              {label}
            </p>
            <p className="font-display italic text-2xl leading-none" style={{ color: accent }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Distribution + Radar */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl glass border border-black/8 p-5">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> Score Distribution
          </h4>
          <div className="space-y-2.5">
            {distribution.map((bucket: any) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="text-[9px] text-muted w-28 shrink-0">{bucket.label}</span>
                <div className="flex-1 h-2 rounded-full bg-black/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / maxDist) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: bucket.color || "#8B3FD6" }}
                  />
                </div>
                <span className="text-[9px] font-mono text-ink w-6 text-right shrink-0">
                  {bucket.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl glass border border-black/8 p-5">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted mb-2 flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Dimension Averages (% of max)
          </h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={70}>
                <PolarGrid stroke="rgba(0,0,0,0.06)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "#7C7469", fontSize: 9, fontFamily: "Geist" }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="score"
                  stroke="#8B3FD6"
                  fill="#8B3FD6"
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
        <div className="rounded-2xl glass border border-black/8 p-5">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> QA Score Trend
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="qaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B3FD6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B3FD6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#7C7469", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#7C7469", fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(28, 25, 23, 0.95)",
                    border: "1px solid rgba(107, 43, 153 , 0.3)",
                    borderRadius: 0,
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                    fontSize: "11px",
                  }}
                  labelStyle={{ color: "#7C7469", fontWeight: "bold" }}
                  itemStyle={{ color: "#8B3FD6" }}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="#8B3FD6"
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
      <div className="rounded-2xl glass border border-black/8 overflow-hidden">
        <div className="px-5 py-3 border-b border-black/8">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Rubric Dimensions
          </h4>
        </div>
        <div className="divide-y divide-white/5">
          {[
            {
              key: "greeting",
              label: "Opening & Greeting",
              desc: "Professional, warm, identified company/purpose clearly",
            },
            {
              key: "discovery",
              label: "Problem Discovery",
              desc: "Open-ended questions, understood customer's situation",
            },
            {
              key: "solution",
              label: "Solution Presentation",
              desc: "Clear, relevant, addressed actual customer needs",
            },
            {
              key: "objection",
              label: "Objection Handling",
              desc: "Handled pushback calmly, didn't oversell",
            },
            {
              key: "closing",
              label: "Closing & Next Steps",
              desc: "Strong close, set clear next steps or outcome",
            },
          ].map(({ key, label, desc }) => {
            const avg = (dims[key] ?? 0) as number;
            const pct = Math.round((avg / 20) * 100);
            return (
              <div key={key} className="px-5 py-3.5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-ink font-medium">{label}</p>
                  <p className="text-[9px] text-muted/70 mt-0.5">{desc}</p>
                </div>
                <div className="w-28 flex items-center gap-2 shrink-0">
                  <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{ background: qaColor(pct) }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-ink w-8 text-right">{avg}/20</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
