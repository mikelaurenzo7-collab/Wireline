import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import {
  BarChart3, TrendingUp, Layers, Calendar, Trophy, AlertOctagon, Loader2,
  RefreshCw, Sparkles, ChevronRight, Users, DollarSign, Brain, Zap,
  Receipt, Clock, Database, Shield, AlertTriangle, Lock, Save, CheckCircle2 as CheckCircle2Icon,
  Star, Play,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatMoney, safeFixed } from "../lib/safe-number";
import CsvExportButton from "./CsvExportButton";
import { AGENT_ROLES } from "./FleetSettings";
import PageShell from "./PageShell";
import { useToast } from "../contexts/ToastContext";

type View = "funnel" | "topics" | "heatmap" | "leaderboard" | "failures" | "spend" | "quality";

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;

function ScrollWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-y-auto scrollbar-hide pr-1">
      {children}
    </div>
  );
}

export default function InsightsView() {
  const [days, setDays] = useState(30);

  // Memoize tabs so PageShell doesn't re-render the tab strip on every
  // keystroke / state update that doesn't affect the day window.
  const tabs = useMemo(() => [
    { id: "funnel",      label: "Funnel",      icon: TrendingUp,   content: <ScrollWrap><FunnelView      days={days} /></ScrollWrap> },
    { id: "topics",      label: "Topics",      icon: Layers,       content: <ScrollWrap><TopicsView /></ScrollWrap> },
    { id: "heatmap",     label: "Heatmap",     icon: Calendar,     content: <ScrollWrap><HeatmapView     days={days} /></ScrollWrap> },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy,       content: <ScrollWrap><LeaderboardView days={days} /></ScrollWrap> },
    { id: "failures",    label: "Failures",    icon: AlertOctagon, content: <ScrollWrap><FailureModesView /></ScrollWrap> },
    { id: "spend",       label: "AI Spend",    icon: Receipt,      content: <ScrollWrap><AISpendView     days={days} /></ScrollWrap> },
    { id: "quality",     label: "Quality",     icon: Star,         content: <ScrollWrap><QualityView     days={days} /></ScrollWrap> },
  ], [days]);

  return (
    <PageShell
      eyebrow="Analytics · Business Intelligence"
      title="Insights"
      subtitle="Funnel analysis, topic clusters, heatmaps, leaderboards, and failure modes."
      actions={
        <>
          {/* Styled segmented control — matches the Aurora Cream design system */}
          <div className="flex items-center gap-px p-1 rounded-full glass border border-black/8">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "h-7 px-3 rounded-full text-[10px] font-medium tracking-wide transition-all",
                  days === d
                    ? "text-white"
                    : "text-muted hover:text-ink"
                )}
                style={days === d ? {
                  background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 55%, #E040C0 100%)",
                  boxShadow: "0 2px 8px -4px rgba(10,200,212,0.50)"
                } : undefined}
              >
                {d}d
              </button>
            ))}
          </div>
          <CsvExportButton type="calls" label="CSV" />
        </>
      }
      tabs={tabs}
    />
  );
}

/* ─────────────────────────  Funnel  ─────────────────────────── */

function FunnelView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(null);
    authFetch(`/api/insights/funnel?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setErr(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;

  const stages = data.stages || [];
  const max = Math.max(1, ...stages.map((s: any) => s.count));

  // No calls yet — give operators a clear nudge rather than a blank panel.
  if (stages.length === 0 || stages.every((s: any) => s.count === 0)) {
    return (
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong overflow-hidden p-10 md:p-14 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0AC8D422, #9B59F522)" }}>
            <TrendingUp className="w-8 h-8 text-brand" />
          </div>
          <div>
            <h3 className="font-display italic text-3xl text-ink mb-2">No calls yet</h3>
            <p className="text-sm text-ink/55 max-w-sm leading-relaxed">
              Your conversion funnel will populate once agents start handling calls. Run a test relay from the Command Atlas to see data here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong overflow-hidden p-8 md:p-10 space-y-4">
        <div className="text-[10px] uppercase tracking-[0.4em] text-brand mb-2">Conversion Funnel · {data.window_days}d</div>
        {stages.map((s: any, i: number) => {
          const pct = (s.count / max) * 100;
          const prev = i > 0 ? stages[i - 1].count : null;
          const drop = prev !== null && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
          return (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-display italic text-2xl text-ink">{s.name}</span>
                <span className="font-display italic text-3xl text-aurora tabular-nums">{s.count.toLocaleString()}</span>
              </div>
              <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #0AC8D4, #9B59F5, #E040C0)`,
                    backgroundSize: "200% 100%",
                  }}
                />
              </div>
              {drop !== null && drop > 0 && (
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted text-right">
                  ↓ {drop}% from previous stage
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────  Topics  ─────────────────────────── */

function TopicsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true); setErr(null);
    authFetch(`/api/insights/topics${refresh ? "?refresh=1" : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading && !data) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;
  if (data.message) return <Empty label={data.message} />;

  const topics = data.topics || [];
  const max = Math.max(1, ...topics.map((t: any) => t.count));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.4em] text-muted">
          {data.cached ? "Cached" : "Fresh"} · {data.total_analyzed} signals analyzed
        </div>
        <button
          onClick={() => load(true)}
          className="px-3 py-1.5 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topics.map((t: any, i: number) => {
          const pct = (t.count / max) * 100;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative aurora-ring rounded-2xl"
            >
              <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                  className="absolute inset-x-0 bottom-0 h-1"
                  style={{ background: "linear-gradient(90deg, #0AC8D4, #9B59F5)" }}
                />
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4 className="font-display italic text-2xl text-ink leading-tight">{t.name}</h4>
                    <span className="font-display italic text-3xl text-aurora tabular-nums">{t.count}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">{t.category}</span>
                    {t.trend && (
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em]",
                        t.trend === "growing"  && "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
                        t.trend === "new"      && "bg-brand-2/15 text-brand-2 border border-brand-2/30",
                        t.trend === "steady"   && "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                        t.trend === "declining" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                      )}>{t.trend}</span>
                    )}
                  </div>
                  {t.example_quote && (
                    <p className="text-xs text-ink/55 italic leading-relaxed mt-2">"{t.example_quote}"</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────  Heatmap  ─────────────────────────── */

function HeatmapView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(null);
    authFetch(`/api/insights/heatmap?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setErr(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;

  const grid = data.grid || [];
  const max = Math.max(1, ...grid.map((g: any) => g.count));
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong overflow-hidden p-7 md:p-10">
        <div className="text-[10px] uppercase tracking-[0.4em] text-brand mb-6">Calls by Hour × Weekday · {data.window_days}d</div>
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className="text-[9px] uppercase tracking-[0.3em] text-muted text-left pb-2 font-normal w-8"></th>
                {Array.from({ length: 24 }).map((_, h) => (
                  <th key={h} className="text-[9px] uppercase tracking-[0.3em] text-muted text-center pb-2 font-normal">
                    {h % 3 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekdays.map((wd, w) => (
                <tr key={w}>
                  <td className="text-[10px] uppercase tracking-[0.3em] text-muted pr-3 py-1">{wd}</td>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const cell = grid.find((g: any) => g.weekday === w && g.hour === h);
                    const intensity = cell ? cell.count / max : 0;
                    const opacity = 0.05 + intensity * 0.95;
                    return (
                      <td key={h} className="px-0.5 py-0.5">
                        <div
                          className="aspect-square rounded-md transition-all hover:scale-110 cursor-pointer"
                          style={{
                            background: cell && cell.count > 0
                              ? `linear-gradient(135deg, rgba(10,200,212,${opacity}), rgba(197,139,255,${opacity * 0.8}))`
                              : "rgba(0,0,0,0.03)",
                            border: cell && cell.count > 0 ? `1px solid rgba(10,200,212,${0.2 + intensity * 0.4})` : "1px solid rgba(0,0,0,0.04)",
                          }}
                          title={`${wd} ${h}:00 — ${cell?.count || 0} calls${cell?.avg_score ? `, avg score ${cell.avg_score}` : ""}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 mt-6 text-[9px] uppercase tracking-[0.3em] text-muted">
          <span>Less</span>
          <div className="flex gap-1">
            {[0.1, 0.3, 0.55, 0.8, 1].map((o, i) => (
              <div key={i} className="w-4 h-4 rounded" style={{ background: `linear-gradient(135deg, rgba(10,200,212,${o}), rgba(197,139,255,${o * 0.8}))` }} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Leaderboard  ─────────────────────────── */

function RolePill({ role }: { role?: string }) {
  const meta = AGENT_ROLES.find(r => r.value === role) ?? AGENT_ROLES.find(r => r.value === "customer_service") ?? AGENT_ROLES[0];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-black uppercase tracking-widest text-[8px] px-2 py-0.5 border-2",
      meta.tw.bg, meta.tw.text, meta.tw.border,
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", meta.tw.dot)} />
      {meta.label}
    </span>
  );
}

function LeaderboardView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(null);
    authFetch(`/api/insights/leaderboard?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setErr(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data || !data.agents?.length) return <Empty label="No agents have run calls in this window." />;

  const RANK_STYLES: Array<{ gradient?: string; ring: string; glow: string; textClass: string; iconBg: boolean }> = [
    {
      gradient: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 55%, #E040C0 100%)",
      ring: "border-brand/40",
      glow: "rgba(10,200,212,0.25)",
      textClass: "text-paper",
      iconBg: true,
    },
    {
      gradient: "linear-gradient(135deg, rgba(197,139,255,0.20), rgba(10,200,212,0.10))",
      ring: "border-brand-2/30",
      glow: "rgba(197,139,255,0.15)",
      textClass: "text-brand-2",
      iconBg: false,
    },
    {
      gradient: "linear-gradient(135deg, rgba(255,107,217,0.15), rgba(197,139,255,0.08))",
      ring: "border-brand-3/25",
      glow: "rgba(255,107,217,0.12)",
      textClass: "text-brand-3",
      iconBg: false,
    },
  ];

  // API contract returns agents: AgentRow[]; treat partial responses
  // (missing array) as the empty state rather than crashing the render.
  const agentRows = Array.isArray(data?.agents) ? data.agents : [];

  return (
    <div className="space-y-3">
      {agentRows.map((a: any, i: number) => {
        const rs = RANK_STYLES[i] ?? { ring: "border-white/8", glow: "transparent", textClass: "text-muted", iconBg: false };
        return (
          <motion.div
            key={a.agent_id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`relative rounded-2xl glass border ${rs.ring} p-5 flex items-center gap-5 overflow-hidden`}
            style={{ boxShadow: `0 0 40px -20px ${rs.glow}, 0 1px 0 rgba(255,255,255,0.80) inset` }}
          >
            {/* Background rank number */}
            <div className="absolute right-5 top-1/2 -translate-y-1/2 font-display italic text-[96px] leading-none opacity-[0.04] select-none pointer-events-none">
              {i + 1}
            </div>

            {/* Rank badge */}
            <div
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-display italic text-2xl border border-white/10"
              style={rs.gradient ? { background: rs.gradient } : undefined}
            >
              {i === 0
                ? <Trophy className={`w-5 h-5 ${rs.textClass}`} />
                : <span className={rs.textClass}>{i + 1}</span>}
            </div>

            <div className="flex-1 min-w-0 relative">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h4 className="font-display italic text-2xl text-ink leading-tight">{a.agent_name}</h4>
                <RolePill role={a.role} />
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <Stat label="Calls"     value={a.total_calls} />
                <Stat label="Qualified" value={a.qualified}    accent="#0AC8D4" />
                <Stat label="Avg Score" value={a.avg_lead_score} />
                <Stat label="Bookings"  value={a.bookings} />
                <Stat label="Minutes"   value={a.minutes} />
                <Stat label="$/Qual"    value={a.cost_per_qualified ? `$${a.cost_per_qualified}` : "—"} accent="#E040C0" />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted">{label}</div>
      <div className="font-display italic text-xl text-ink mt-0.5" style={accent ? { color: accent } : {}}>{value}</div>
    </div>
  );
}

/* ─────────────────────────  Failure modes  ─────────────────────────── */

function FailureModesView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true); setErr(null);
    authFetch(`/api/insights/failure-modes${refresh ? "?refresh=1" : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading && !data) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;
  if (data.message) return <Empty label={data.message} green />;

  const modes = data.modes || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.4em] text-muted">{data.cached ? "Cached" : "Fresh"} · {modes.length} clusters</div>
        <button
          onClick={() => load(true)}
          className="px-3 py-1.5 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {modes.map((m: any, i: number) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-2xl glass border border-white/10 p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-display italic text-2xl text-ink leading-tight">{m.failure_type}</h4>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em]",
                  m.severity === "critical" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  m.severity === "high"     && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  m.severity === "medium"   && "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  m.severity === "low"      && "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                )}>{m.severity}</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand-2/15 text-brand-2 border border-brand-2/30">{m.fix_target}</span>
              </div>
            </div>
            <div className="font-display italic text-3xl text-aurora">{m.count}</div>
          </div>
          <p className="text-sm text-ink/75 leading-relaxed">{m.description}</p>
          <div className="rounded-xl bg-brand/10 border border-brand/30 p-4 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-brand mb-1">Recommended fix</div>
              <p className="text-sm text-ink/90">{m.recommended_fix}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────────────────────  AI Spend  ─────────────────────────── */

function AISpendView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(null);
    authFetch(`/api/audit/summary?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; })
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setErr(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data || !data.totals) return null;

  const { totals, by_day = [], by_action = [], by_model = [] } = data;
  const callsHaveHappened = totals.calls > 0;

  // Find max for chart scaling
  const maxDay = Math.max(0.01, ...by_day.map((d: any) => Number(d.cost)));
  const maxAction = Math.max(0.01, ...by_action.map((a: any) => Number(a.cost)));

  return (
    <div className="space-y-5">
      {/* Monthly budget — always rendered so operators can set a cap
          before any calls happen. */}
      <SpendBudgetCard />

      {!callsHaveHappened && (
        <Empty label="No AI usage in this window — try a longer range or run a recipe." />
      )}

      {callsHaveHappened && <>
      {/* Headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SpendStat label="Total Spend" value={formatMoney(totals?.cost, 2)} icon={DollarSign} accent="#0AC8D4" />
        <SpendStat label="Claude Calls" value={String(totals.calls)} icon={Brain} accent="#9B59F5" />
        <SpendStat label="Avg / Call" value={formatMoney(totals?.avg_cost_per_call, 4)} icon={Receipt} accent="#E040C0" />
        <SpendStat label="Saved by Cache" value={formatMoney(totals?.cache_savings_usd, 2)} icon={Database} accent="#10B981" />
      </div>

      {/* Spend over time */}
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong overflow-hidden p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.4em] text-brand mb-5">Spend per Day · {data.window_days}d</div>
          <div className="space-y-2">
            {by_day.map((d: any, i: number) => {
              const pct = (Number(d.cost) / maxDay) * 100;
              return (
                <motion.div
                  key={d.day}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-muted w-20 font-mono">{d.day.slice(5)}</span>
                  <div className="flex-1 relative h-7 rounded-lg bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: i * 0.02 }}
                      className="absolute inset-y-0 left-0 rounded-lg flex items-center px-3"
                      style={{ background: "linear-gradient(90deg, #0AC8D4, #9B59F5)" }}
                    >
                      <span className="text-[10px] font-mono text-paper font-medium">${safeFixed(d.cost, 2)}</span>
                    </motion.div>
                    <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">{d.calls} calls</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* By action */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative aurora-ring rounded-2xl">
          <div className="relative rounded-2xl glass border border-white/10 p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Spend by Recipe</div>
            <div className="space-y-2">
              {by_action.slice(0, 12).map((a: any, i: number) => {
                const pct = (Number(a.cost) / maxAction) * 100;
                return (
                  <div key={a.action} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink/85 truncate">{a.action}</span>
                      <span className="font-display italic text-lg text-aurora tabular-nums shrink-0">${safeFixed(a.cost, 3)}</span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.03 }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: "linear-gradient(90deg, #9B59F5, #E040C0)" }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted">
                      <span>{a.calls} calls</span>
                      <span>avg {a.avg_latency_ms}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative aurora-ring rounded-2xl">
          <div className="relative rounded-2xl glass border border-white/10 p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Spend by Model</div>
            <div className="space-y-3">
              {by_model.map((m: any) => (
                <div key={m.model} className="flex items-baseline justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="text-sm font-mono text-ink/90">{m.model}</div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted mt-1">{m.calls} calls</div>
                  </div>
                  <div className="font-display italic text-2xl text-aurora">${safeFixed(m.cost, 2)}</div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-white/5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted mb-1">Tokens (window)</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Input <span className="text-ink/80 font-mono ml-1">{totals.input.toLocaleString()}</span></div>
                <div>Output <span className="text-ink/80 font-mono ml-1">{totals.output.toLocaleString()}</span></div>
                <div>Cache reads <span className="text-emerald-500 font-mono ml-1">{totals.cache_read.toLocaleString()}</span></div>
                <div>Cache writes <span className="text-brand-2 font-mono ml-1">{totals.cache_create.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

function SpendBudgetCard() {
  const [status, setStatus] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [draft, setDraft] = useState<{ monthly_limit_usd: string; warn_threshold_pct: number; hard_cap: boolean; enabled: boolean }>({
    monthly_limit_usd: "",
    warn_threshold_pct: 80,
    hard_cap: false,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        authFetch("/api/spend/status").then(r => r.json()),
        authFetch("/api/spend/budget").then(r => r.json()),
      ]);
      setStatus(s);
      setBudget(b.budget);
      setDraft({
        monthly_limit_usd: b.budget?.monthly_limit_usd ? String(b.budget.monthly_limit_usd) : "",
        warn_threshold_pct: b.budget?.warn_threshold_pct ?? 80,
        hard_cap: !!b.budget?.hard_cap,
        enabled: b.budget?.enabled !== false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const limit = parseFloat(draft.monthly_limit_usd || "0");
      const r = await authFetch("/api/spend/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_limit_usd: Number.isFinite(limit) ? limit : 0,
          warn_threshold_pct: draft.warn_threshold_pct,
          hard_cap: draft.hard_cap,
          enabled: draft.enabled,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      setSavedAt(Date.now());
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="rounded-3xl glass border border-white/10 p-6 flex items-center gap-3 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading budget…
      </div>
    );
  }

  const limit = Number(status?.monthly_limit_usd || 0);
  const used = Number(status?.month_to_date_usd || 0);
  const pct = limit > 0 ? Math.min(150, (used / limit) * 100) : 0;
  const warnPct = Number(status?.warn_threshold_pct || 80);
  const isOver = limit > 0 && used >= limit;
  const isWarn = limit > 0 && pct >= warnPct && !isOver;
  const barColor = isOver ? "#FF6B6B" : isWarn ? "#FFC07D" : "#10B981";
  const period = status?.period || "—";

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong border border-white/10 p-6 md:p-7 space-y-5 overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${barColor}22`, border: `1px solid ${barColor}55` }}>
              <Shield className="w-4 h-4" style={{ color: barColor }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em]" style={{ color: barColor }}>Monthly Budget</div>
              <div className="text-sm text-ink/70 mt-1">Period <span className="font-mono">{period}</span> · resets on the 1st (UTC)</div>
            </div>
          </div>
          {status?.hard_capped_now && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              <Lock className="w-3.5 h-3.5" /> Hard cap active — AI calls are blocked
            </div>
          )}
          {!status?.hard_capped_now && isWarn && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> Spend has crossed your warn threshold
            </div>
          )}
        </div>

        {/* Usage bar */}
        {limit > 0 ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="font-display italic text-3xl text-ink leading-none">
                ${safeFixed(used, 2)} <span className="text-ink/50 text-xl">/ ${safeFixed(limit, 2)}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted">{safeFixed(pct, 1)}% used</div>
            </div>
            <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
              {/* Warn-threshold tick */}
              <div className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${warnPct}%` }} title={`Warn threshold ${warnPct}%`} />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: `linear-gradient(90deg, ${barColor}aa, ${barColor})` }}
              />
            </div>
            {Array.isArray(status?.alerts_fired) && status.alerts_fired.length > 0 && (
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted pt-1">
                Alerts fired this period: {status.alerts_fired.map((a: any) => `${a.threshold_pct}%`).join(" · ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink/60">No monthly limit set. Configure one below to enable warnings and (optionally) a hard cap.</div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Monthly limit (USD)</span>
            <input
              type="number" min="0" step="1" inputMode="decimal"
              value={draft.monthly_limit_usd}
              onChange={(e) => setDraft({ ...draft, monthly_limit_usd: e.target.value })}
              placeholder="e.g. 200"
              className="w-full h-11 px-4 rounded-xl glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all font-mono"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Warn at (% of limit)</span>
            <input
              type="number" min="1" max="99" step="1"
              value={draft.warn_threshold_pct}
              onChange={(e) => setDraft({ ...draft, warn_threshold_pct: parseInt(e.target.value || "80") })}
              className="w-full h-11 px-4 rounded-xl glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all font-mono"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setDraft({ ...draft, hard_cap: !draft.hard_cap })}
              className={cn(
                "h-11 px-4 rounded-xl border flex items-center gap-2 text-xs uppercase tracking-[0.25em] transition-all",
                draft.hard_cap
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  : "glass border-white/10 text-ink/70 hover:border-white/30",
              )}
              title="When on, AI calls return HTTP 402 once you've reached the monthly limit."
            >
              <Lock className="w-3.5 h-3.5" /> Hard cap {draft.hard_cap ? "on" : "off"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-[11px] text-ink/50">
            Threshold crossings fire <span className="font-mono text-ink/75">spend.warning</span> and <span className="font-mono text-ink/75">spend.exceeded</span> webhook events — wire them to Slack/CRM in Admin.
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="h-11 px-5 rounded-xl bg-brand text-paper text-xs uppercase tracking-[0.25em] font-medium flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving" : "Save budget"}
          </button>
        </div>
        {error && <div className="text-xs text-rose-400">{error}</div>}
        {savedAt && !error && Date.now() - savedAt < 4000 && (
          <div className="text-xs text-emerald-400">Saved.</div>
        )}
      </div>
    </div>
  );
}

function SpendStat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <div className="relative aurora-ring rounded-2xl">
      <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${accent}, transparent)` }} />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{label}</p>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
          <p className="font-display italic text-3xl text-ink leading-none">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Helpers  ─────────────────────────── */

function Spinner() {
  return (
    <div className="py-16 flex flex-col items-center gap-4">
      <div className="relative w-12 h-12">
        <div
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
            filter: "blur(1px)",
            animation: "spin 2s linear infinite",
          }}
        />
        <div className="absolute inset-1.5 rounded-full bg-paper" />
        <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)", boxShadow: "0 0 10px #0AC8D4" }}
          />
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60 animate-pulse">Computing…</p>
    </div>
  );
}

function Empty({ label, green }: { label: string; green?: boolean }) {
  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass border border-white/10 p-12 text-center overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: green ? "radial-gradient(circle, #10B981, transparent)" : "radial-gradient(circle, #0AC8D4, transparent)" }} />
        <div className={cn(
          "inline-flex items-center justify-center w-12 h-12 rounded-2xl glass border mb-4",
          green ? "border-emerald-500/30 text-emerald-500" : "border-brand/30 text-brand"
        )}>
          {green
            ? <CheckCircle2Icon className="w-5 h-5" />
            : <BarChart3 className="w-5 h-5 opacity-60" />
          }
        </div>
        <p className={cn("text-[11px] uppercase tracking-[0.4em]", green ? "text-emerald-500/80" : "text-muted")}>{label}</p>
      </div>
    </div>
  );
}

function ErrCard({ error }: { error: string }) {
  return (
    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-6 text-rose-500 text-sm flex items-start gap-3">
      <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}

/* ─────────────────────────  Quality (QA Scorecard)  ─────────────────── */

function qaColor(score: number) {
  if (score >= 90) return "#0AC8D4";
  if (score >= 75) return "#10B981";
  if (score >= 60) return "#FFD166";
  if (score >= 40) return "#FF9A5C";
  return "#E040C0";
}

function QualityView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const fetchStats = useCallback(() => {
    setLoading(true);
    authFetch(`/api/qa/stats?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleScoreAll = async () => {
    setScoring(true);
    try {
      const res = await authFetch(`/api/qa/score-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, days }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Batch scoring failed");
      if (d.scored === 0 && d.total === 0) {
        toastSuccess("All caught up", "No unscored calls found in this period.");
      } else if (d.failed > 0) {
        toastWarning("Batch QA partial", `Scored ${d.scored} call${d.scored === 1 ? "" : "s"}, ${d.failed} failed. Check logs for details.`);
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0AC8D422,#9B59F522)" }}>
              <Star className="w-8 h-8 text-brand" />
            </div>
            <div>
              <h3 className="font-display italic text-3xl text-ink mb-2">No QA scores yet</h3>
              <p className="text-sm text-ink/55 max-w-sm leading-relaxed">
                Score an individual call in Call Logs, or use <strong className="text-brand">Score All Unscored</strong> below to batch-evaluate up to 20 calls at once.
              </p>
            </div>
            <button
              onClick={handleScoreAll}
              disabled={scoring}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[11px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors disabled:opacity-50"
            >
              {scoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {scoring ? "Scoring…" : "Score All Unscored"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dims = data.dimensions || {};
  const radarData = [
    { dimension: "Opening",   score: +(((dims.greeting  ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Discovery", score: +(((dims.discovery ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Solution",  score: +(((dims.solution  ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Objections",score: +(((dims.objection ?? 0) / 20) * 100).toFixed(0) },
    { dimension: "Closing",   score: +(((dims.closing   ?? 0) / 20) * 100).toFixed(0) },
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Scored Calls",  value: data.count,     accent: "#0AC8D4" },
          { label: "Average Score", value: `${data.avgScore}/100`, accent: qaColor(data.avgScore) },
          { label: "Opening",       value: `${dims.greeting ?? 0}/20`,  accent: "#9B59F5" },
          { label: "Closing",       value: `${dims.closing  ?? 0}/20`,  accent: "#10B981" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="relative rounded-xl glass border border-white/10 p-4 overflow-hidden">
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle,${accent},transparent)` }} />
            <p className="text-[9px] uppercase tracking-[0.32em] text-muted mb-2">{label}</p>
            <p className="font-display italic text-2xl leading-none" style={{ color: accent }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Distribution + Radar */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Score distribution */}
        <div className="rounded-2xl glass border border-white/10 p-5">
          <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> Score Distribution
          </h4>
          <div className="space-y-2.5">
            {distribution.map((bucket: any) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="text-[9px] text-muted w-28 shrink-0">{bucket.label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(bucket.count / maxDist) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: bucket.color || "#0AC8D4" }}
                  />
                </div>
                <span className="text-[9px] font-mono text-ink w-6 text-right shrink-0">{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Radar chart for dimension averages */}
        <div className="rounded-2xl glass border border-white/10 p-5">
          <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-2 flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Dimension Averages (% of max)
          </h4>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={70}>
                <PolarGrid stroke="rgba(0,0,0,0.06)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: "#7C7469", fontSize: 9, fontFamily: "Geist" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#0AC8D4" fill="#0AC8D4" fillOpacity={0.15} strokeWidth={1.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 7-day trend */}
      {data.trend && data.trend.length > 1 && (
        <div className="rounded-2xl glass border border-white/10 p-5">
          <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> QA Score Trend
          </h4>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="qaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0AC8D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0AC8D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="day" tick={{ fill: "#7C7469", fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#7C7469", fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#F5F0E8", border: "1px solid rgba(10,200,212,0.2)", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "#7C7469" }}
                  itemStyle={{ color: "#0AC8D4" }}
                />
                <Area type="monotone" dataKey="avg" stroke="#0AC8D4" strokeWidth={1.5} fill="url(#qaGrad)" name="Avg QA Score" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Dimension detail table */}
      <div className="rounded-2xl glass border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8">
          <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted flex items-center gap-1.5">
            <Star className="w-3 h-3" /> Rubric Dimensions
          </h4>
        </div>
        <div className="divide-y divide-white/5">
          {[
            { key: "greeting",  label: "Opening & Greeting",   desc: "Professional, warm, identified company/purpose clearly" },
            { key: "discovery", label: "Problem Discovery",     desc: "Open-ended questions, understood customer's situation" },
            { key: "solution",  label: "Solution Presentation", desc: "Clear, relevant, addressed actual customer needs" },
            { key: "objection", label: "Objection Handling",    desc: "Handled pushback calmly, didn't oversell" },
            { key: "closing",   label: "Closing & Next Steps",  desc: "Strong close, set clear next steps or outcome" },
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
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
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
