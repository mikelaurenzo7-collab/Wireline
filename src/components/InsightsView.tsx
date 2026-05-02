import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart3, TrendingUp, Layers, Calendar, Trophy, AlertOctagon, Loader2,
  RefreshCw, Sparkles, ChevronRight, Users, DollarSign, Brain, Zap
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

type View = "funnel" | "topics" | "heatmap" | "leaderboard" | "failures";

const VIEWS: { id: View; label: string; icon: any; accent: string; needsClaude: boolean }[] = [
  { id: "funnel",      label: "Funnel",         icon: TrendingUp,   accent: "#7DF9FF", needsClaude: false },
  { id: "topics",      label: "Topic Map",      icon: Layers,       accent: "#C58BFF", needsClaude: true  },
  { id: "heatmap",     label: "Time Heatmap",   icon: Calendar,     accent: "#FF6BD9", needsClaude: false },
  { id: "leaderboard", label: "Agent Leaderboard", icon: Trophy,    accent: "#4DFFC4", needsClaude: false },
  { id: "failures",    label: "Failure Modes",  icon: AlertOctagon, accent: "#FFC07D", needsClaude: true  },
];

export default function InsightsView() {
  const [view, setView] = useState<View>("funnel");
  const [days, setDays] = useState(30);

  return (
    <div className="min-h-full w-full max-w-[1700px] mx-auto space-y-10 pb-32">
      <motion.header
        initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Business Intelligence</span>
            </div>
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <Brain className="w-3 h-3 text-brand-2" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Claude-powered</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Deep Analytics</p>
            <h1 className="font-display italic text-6xl md:text-7xl lg:text-[7rem] leading-[0.9] tracking-tight">
              <span className="text-aurora">Insights</span>
            </h1>
            <p className="text-ink/55 max-w-2xl text-sm md:text-base leading-relaxed">
              Real BI on every signal — funnel, topic clusters, time heatmaps, per-agent leaderboards, and clustered failure modes with fix recommendations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days} onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-4 h-11 rounded-full glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
          >
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </motion.header>

      {/* View tabs */}
      <div className="flex flex-wrap gap-2.5">
        {VIEWS.map((v) => {
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "relative px-5 py-3 rounded-full transition-all flex items-center gap-2.5 overflow-hidden",
                isActive ? "border-transparent text-paper" : "glass border border-white/10 text-ink/70 hover:text-ink hover:border-white/30",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="insights-tab"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${v.accent}, ${v.accent}cc)`,
                    boxShadow: `0 8px 24px -8px ${v.accent}88, 0 0 0 1px rgba(255,255,255,0.2) inset`,
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <v.icon className="w-4 h-4 relative z-10" />
              <span className="text-[11px] uppercase tracking-[0.25em] relative z-10 font-medium">{v.label}</span>
              {v.needsClaude && (
                <Brain className={cn("w-3 h-3 relative z-10", isActive ? "text-paper/70" : "text-brand-2")} />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          {view === "funnel"      && <FunnelView      days={days} />}
          {view === "topics"      && <TopicsView />}
          {view === "heatmap"     && <HeatmapView     days={days} />}
          {view === "leaderboard" && <LeaderboardView days={days} />}
          {view === "failures"    && <FailureModesView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────  Funnel  ─────────────────────────── */

function FunnelView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/insights/funnel?days=${days}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Spinner />;
  if (!data) return null;

  const stages = data.stages || [];
  const max = Math.max(1, ...stages.map((s: any) => s.count));

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
                    background: `linear-gradient(90deg, #7DF9FF, #C58BFF, #FF6BD9)`,
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
                  style={{ background: "linear-gradient(90deg, #7DF9FF, #C58BFF)" }}
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

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/insights/heatmap?days=${days}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Spinner />;
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
                              ? `linear-gradient(135deg, rgba(125,249,255,${opacity}), rgba(197,139,255,${opacity * 0.8}))`
                              : "rgba(255,255,255,0.03)",
                            border: cell && cell.count > 0 ? `1px solid rgba(125,249,255,${0.2 + intensity * 0.4})` : "1px solid rgba(255,255,255,0.04)",
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
              <div key={i} className="w-4 h-4 rounded" style={{ background: `linear-gradient(135deg, rgba(125,249,255,${o}), rgba(197,139,255,${o * 0.8}))` }} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Leaderboard  ─────────────────────────── */

function LeaderboardView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/insights/leaderboard?days=${days}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Spinner />;
  if (!data || !data.agents?.length) return <Empty label="No agents have run calls in this window." />;

  return (
    <div className="space-y-3">
      {data.agents.map((a: any, i: number) => (
        <motion.div
          key={a.agent_id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="relative aurora-ring rounded-2xl"
        >
          <div className="relative rounded-2xl glass border border-white/10 p-5 flex items-center gap-5 overflow-hidden">
            <div className={cn(
              "shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-display italic text-2xl",
              i === 0 ? "text-paper" : "glass border border-white/10 text-ink/70",
            )} style={i === 0 ? { background: "linear-gradient(135deg, #7DF9FF, #C58BFF, #FF6BD9)" } : {}}>
              {i === 0 ? <Trophy className="w-5 h-5" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h4 className="font-display italic text-2xl text-ink leading-tight">{a.agent_name}</h4>
                <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">{a.archetype}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                <Stat label="Calls" value={a.total_calls} />
                <Stat label="Qualified" value={a.qualified} accent="#7DF9FF" />
                <Stat label="Avg Score" value={a.avg_lead_score} />
                <Stat label="Bookings" value={a.bookings} />
                <Stat label="Minutes" value={a.minutes} />
                <Stat label="$ / Qual" value={a.cost_per_qualified ? `$${a.cost_per_qualified}` : "—"} accent="#FF6BD9" />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
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

/* ─────────────────────────  Helpers  ─────────────────────────── */

function Spinner() {
  return (
    <div className="py-32 flex flex-col items-center gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-brand" />
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted">Computing</p>
    </div>
  );
}

function Empty({ label, green }: { label: string; green?: boolean }) {
  return (
    <div className="rounded-3xl glass border border-white/10 p-16 text-center">
      <p className={cn("text-[11px] uppercase tracking-[0.4em]", green ? "text-emerald-500/80" : "text-muted")}>{label}</p>
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
