import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Activity, PhoneCall, Mic, Square, Loader2, TrendingUp, DollarSign,
  ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Signal, Target,
  Radio, Sparkles, Inbox, History as HistoryIcon, ShieldCheck, Zap, Users,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { motion } from "motion/react";
import Vapi from "@vapi-ai/web";
import { cn } from "../lib/utils";
import FleetTaskBridge from "./FleetTaskBridge";
import TriggerIntelligenceFeed from "./TriggerIntelligenceFeed";
import DailyBrief from "./DailyBrief";
import PerformanceBenchmarks from "./PerformanceBenchmarks";
import OnboardingQuickstart from "./OnboardingQuickstart";
import PageShell, { Panel, StatTile } from "./PageShell";
import WidgetBoundary from "./WidgetBoundary";
import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";
import { useToast } from "../contexts/ToastContext";

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || "");

/** Lead score thresholds for color-coding hot leads in the Fleet tab. */
const HOT_LEAD_THRESHOLD = 80;
const WARM_LEAD_THRESHOLD = 60;

export default function DashboardHome() {
  const { error: toastError } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDialAgentId, setSelectedDialAgentId] = useState<string>("");
  const [stats, setStats] = useState<any>(null);
  const [activeSignals, setActiveSignals] = useState<any[]>([]);
  const [highPriorityTasks, setHighPriorityTasks] = useState<any[]>([]);
  const [systemActivity, setSystemActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchActiveSignals();
    fetchHighPriorityTasks();
    fetchSystemActivity();

    const signalPulse = setInterval(() => {
      fetchActiveSignals();
      fetchHighPriorityTasks();
      fetchSystemActivity();
    }, 30_000);

    vapi.on("call-start", () => { setIsConnecting(false); setIsConnected(true); });
    vapi.on("call-end", () => {
      setIsConnecting(false); setIsConnected(false);
      setTimeout(() => fetchStats(), 3000);
    });

    return () => {
      clearInterval(signalPulse);
      vapi.removeAllListeners("call-start");
      vapi.removeAllListeners("call-end");
    };
  }, []);

  const fetchActiveSignals = async () => {
    try {
      const res = await authFetch("/api/fleet/presence");
      const data = await res.json();
      setActiveSignals(data.signals || []);
    } catch (e) { console.error("Signal presence sync failed:", e); }
  };

  const fetchHighPriorityTasks = async () => {
    try {
      const res = await authFetch("/api/fleet/tasks?status=pending&priority=high");
      const data = await res.json();
      setHighPriorityTasks(data.tasks || []);
    } catch (e) { console.error("Failed to fetch high priority tasks:", e); }
  };

  const fetchSystemActivity = async () => {
    try {
      const res = await authFetch("/api/fleet/activity");
      const data = await res.json();
      setSystemActivity(data.activity || []);
    } catch (e) { console.error("Failed to fetch system activity:", e); }
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch("/api/dashboard/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const toggleCall = async () => {
    if (isConnected) { vapi.stop(); return; }
    setIsConnecting(true);
    try {
      let targetAgentId = "default-agent";
      if (selectedDialAgentId) {
        targetAgentId = selectedDialAgentId;
      } else if (stats?.agents?.length > 0) {
        const voiceAgent = stats.agents.find((a: any) => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel);
        if (voiceAgent) targetAgentId = voiceAgent.id;
      }
      const res = await authFetch(`/api/vapi-webhook?agentId=${targetAgentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { type: "assistant-request" } })
      });
      const data = await res.json();
      if (data.assistant) await vapi.start(data.assistant);
      else throw new Error("No assistant configuration returned");
    } catch (e) {
      console.error("Failed to start call", e);
      setIsConnecting(false);
      toastError("Carrier connection failed", "Ensure at least one agent is configured and try again.");
    }
  };

  const chartData = stats?.chartData || [
    { name: "MON", signals: 12, leads: 5 },
    { name: "TUE", signals: 18, leads: 8 },
    { name: "WED", signals: 15, leads: 12 },
    { name: "THU", signals: 25, leads: 15 },
    { name: "FRI", signals: 22, leads: 10 },
    { name: "SAT", signals: 10, leads: 4 },
    { name: "SUN", signals: 8,  leads: 2 },
  ];

  const recentLogs: any[] = stats?.recentLogs || [];
  const hotLeads: any[]   = stats?.hotLeads || [];
  const voiceAgents: any[] = (stats?.agents || []).filter((a: any) => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel);

  useEffect(() => {
    if (!selectedDialAgentId && voiceAgents.length > 0) {
      setSelectedDialAgentId(voiceAgents[0].id);
    }
  }, [selectedDialAgentId, voiceAgents]);

  const voiceButton = (
    <button
      onClick={toggleCall}
      disabled={isConnecting}
      className={cn(
        "h-9 px-4 rounded-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.28em] transition-all",
        isConnected
          ? "bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25"
          : "brutal-btn !py-0 !px-4 !h-9"
      )}
    >
      {isConnecting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting</>
        : isConnected ? <><Square className="w-3 h-3 fill-current" /> End Call</>
        : <><Mic className="w-3.5 h-3.5" /> Test Call</>}
    </button>
  );

  if (isLoading && !stats) {
    return (
      <PageShell title="Dashboard" eyebrow="Today" actions={voiceButton}>
        <div className="h-full w-full flex flex-col items-center justify-center gap-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full" style={{
              background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
              filter: "blur(2px)", animation: "spin 8s linear infinite"
            }} />
            <div className="absolute inset-1.5 rounded-full bg-paper" />
            <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
              <Target className="w-7 h-7 text-aurora" strokeWidth={1.5} />
            </div>
          </div>
          <p className="text-aurora text-[10px] uppercase tracking-[0.5em]">Loading…</p>
        </div>
      </PageShell>
    );
  }

  /* ─── Tab content builders ──────────────────────────────────────────── */

  const delta = stats?.week_delta ?? {};

  const Pulse = (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* ── Hero stat row ─────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total Calls"      value={stats?.totalCalls ?? 0}              sub="All time"           icon={PhoneCall}  accent="#0AC8D4"
          trend={delta.calls_pct != null ? { value: delta.calls_pct, label: "vs last 7d" } : undefined} />
        <StatTile label="Avg Lead Score"   value={stats?.avgLeadScore ? `${stats.avgLeadScore}/100` : "—"}  sub="BANT quality"       icon={TrendingUp} accent="#9B59F5"
          trend={delta.score_pct != null ? { value: delta.score_pct, label: "vs last 7d" } : undefined} />
        <StatTile label="Conversion Rate"  value={`${stats?.conversionRate ?? 0}%`}    sub="Appointments / calls" icon={Target}    accent="#E040C0" />
        <StatTile label="AI Spend"         value={`$${stats?.totalCost ?? "0.00"}`}    sub="Current period"     icon={DollarSign} accent="#10B981"
          trend={delta.cost_pct != null ? { value: -(delta.cost_pct), label: "vs last 7d" } : undefined} />
      </div>

      {/* ── Main grid ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        {/* Recent calls */}
        <div className="col-span-12 lg:col-span-4 h-full">
          <Panel
            title="Recent Calls"
            hint="latest outcomes"
            icon={HistoryIcon}
            accent="#0AC8D4"
            scroll
            actions={
              <Link to="/logs" className="text-[9px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors flex items-center gap-1">
                All <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
          >
            {recentLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="w-12 h-12 rounded-2xl glass border border-white/10 flex items-center justify-center">
                  <Radio className="w-6 h-6 text-muted/40 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-ink/60 mb-0.5">No calls yet</p>
                  <p className="text-[9px] text-muted/50 leading-snug max-w-[160px]">
                    Make a test call above to start collecting call data
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {recentLogs.slice(0, 6).map((call: any, idx: number) => (
                  <Link key={call.id || idx} to="/logs"
                    className="group flex items-center gap-3 py-3 px-1 -mx-1 hover:bg-white/3 rounded-lg transition-all"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                      call.direction === "inbound"
                        ? "bg-brand/10 border-brand/25 text-brand"
                        : "bg-brand-2/10 border-brand-2/25 text-brand-2"
                    )}>
                      <PhoneCall className={cn("w-3.5 h-3.5", call.direction === "outbound" ? "-rotate-90" : "")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-display italic text-sm text-ink truncate">
                          {call.customer_number || "Simulator"}
                        </span>
                        <span className="text-[8px] font-mono text-muted/70 shrink-0">
                          {Math.ceil((call.duration_seconds || 0) / 60)}m
                        </span>
                      </div>
                      <p className="text-[10px] text-muted/70 truncate leading-tight">
                        {call.summary || "No summary recorded"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Agent status */}
        <div className="col-span-12 lg:col-span-4 h-full">
          <Panel title="Agent Status" hint="fleet · live" icon={Signal} accent="#9B59F5">
            <div className="space-y-3 h-full">
              {/* Live call indicator */}
              <div className={cn(
                "flex items-center gap-3 rounded-xl p-3.5 border transition-all",
                activeSignals.length > 0
                  ? "bg-emerald-500/8 border-emerald-500/25"
                  : "bg-white/3 border-white/8"
              )}>
                <div className={cn(
                  "relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  activeSignals.length > 0 ? "bg-emerald-500/20" : "bg-white/5"
                )}>
                  <span className={cn(
                    "w-3 h-3 rounded-full",
                    activeSignals.length > 0 ? "bg-emerald-500 indicator-glow" : "bg-white/20"
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-ink">
                    {activeSignals.length > 0
                      ? `${activeSignals.length} live call${activeSignals.length > 1 ? "s" : ""}`
                      : "All agents idle"}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-muted mt-0.5">
                    {stats?.inboundCount ?? 0} in · {stats?.outboundCount ?? 0} out total
                  </div>
                </div>
                <Link to="/live" className="shrink-0 text-[8px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors">
                  Monitor
                </Link>
              </div>

              {/* Browser call status */}
              <div className={cn(
                "flex items-center gap-3 rounded-xl p-3.5 border transition-all",
                isConnected ? "bg-rose-500/8 border-rose-500/25" :
                isConnecting ? "bg-amber-500/8 border-amber-500/25" :
                "bg-white/3 border-white/8"
              )}>
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  isConnected ? "bg-rose-500/20" : isConnecting ? "bg-amber-500/20" : "bg-white/5"
                )}>
                  {isConnecting
                    ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    : <Mic className={cn("w-4 h-4", isConnected ? "text-rose-400" : "text-white/30")} />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-ink">
                    {isConnected ? "Browser call active" : isConnecting ? "Connecting…" : "Test call idle"}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-muted mt-0.5">Browser → Agent</div>
                </div>
              </div>

              {/* Per-agent roster */}
              {(stats?.agents || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[8px] uppercase tracking-[0.4em] text-muted/60 px-0.5">Roster</p>
                  {(stats?.agents || []).slice(0, 4).map((a: any, i: number) => {
                    const busy = activeSignals.some((s: any) => s.agent_id === a.id);
                    return (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/3 border border-white/6">
                        <span className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          busy ? "bg-rose-400" : "bg-emerald-400"
                        )}
                          style={{ boxShadow: busy ? "0 0 6px rgba(248,113,113,0.8)" : "0 0 6px rgba(52,211,153,0.8)" }}
                        />
                        <span className="text-[11px] text-ink truncate flex-1">{a.name}</span>
                        <span className={cn(
                          "text-[8px] uppercase tracking-[0.22em]",
                          busy ? "text-rose-400" : "text-emerald-400/80"
                        )}>
                          {busy ? "Active" : "Ready"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Today's volume strip */}
              {stats && (
                <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-black/5">
                  <div className="text-center flex-1">
                    <div className="font-mono text-sm font-medium text-ink leading-none">{stats.inboundCount ?? 0}</div>
                    <div className="text-[8px] uppercase tracking-[0.3em] text-muted mt-0.5">Inbound</div>
                  </div>
                  <div className="h-6 w-px bg-black/8" />
                  <div className="text-center flex-1">
                    <div className="font-mono text-sm font-medium text-ink leading-none">{stats.outboundCount ?? 0}</div>
                    <div className="text-[8px] uppercase tracking-[0.3em] text-muted mt-0.5">Outbound</div>
                  </div>
                  <div className="h-6 w-px bg-black/8" />
                  <div className="text-center flex-1">
                    <div className="font-mono text-sm font-medium text-ink leading-none">{stats.totalMinutes ?? 0}</div>
                    <div className="text-[8px] uppercase tracking-[0.3em] text-muted mt-0.5">Minutes</div>
                  </div>
                </div>
              )}

              {!(stats?.agents?.length) && (
                <div className="flex items-center justify-center py-4">
                  <Link to="/agents" className="text-[10px] text-brand/70 hover:text-brand transition-colors uppercase tracking-[0.28em]">
                    + Add your first agent
                  </Link>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Quick actions + chart */}
        <div className="col-span-12 lg:col-span-4 h-full flex flex-col gap-3">
          {/* Quick actions */}
          <Panel title="Quick Launch" hint="one-click" icon={Zap} accent="#E040C0">
            <div className="space-y-2.5">
              {/* Test call */}
              <div className="rounded-xl p-3.5 border border-brand/20 bg-brand/5">
                <p className="text-[9px] uppercase tracking-[0.3em] text-brand mb-2.5 flex items-center gap-1.5">
                  <Mic className="w-3 h-3" /> Browser Test Call
                </p>
                {voiceAgents.length > 0 ? (
                  <div className="space-y-2">
                    {/* Styled agent selector — pill buttons instead of a native <select> */}
                    {voiceAgents.length <= 4 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {voiceAgents.map((a: any) => (
                          <button
                            key={a.id}
                            onClick={() => setSelectedDialAgentId(a.id)}
                            className={cn(
                              "px-2.5 h-7 rounded-full text-[10px] font-medium transition-all border truncate max-w-[140px]",
                              selectedDialAgentId === a.id
                                ? "text-white border-transparent"
                                : "text-muted border-black/10 hover:text-ink hover:border-black/20 glass"
                            )}
                            style={selectedDialAgentId === a.id ? {
                              background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 100%)",
                              boxShadow: "0 2px 8px -4px rgba(10,200,212,0.50)"
                            } : undefined}
                            title={a.name}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <select
                        aria-label="Select agent to dial"
                        value={selectedDialAgentId}
                        onChange={e => setSelectedDialAgentId(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg glass border border-black/10 text-[11px] text-ink outline-none focus:border-brand/60"
                      >
                        {voiceAgents.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={toggleCall}
                      disabled={isConnecting}
                      className={cn(
                        "w-full h-10 rounded-xl font-medium text-[11px] uppercase tracking-[0.22em] flex items-center justify-center gap-2 transition-all",
                        isConnected
                          ? "bg-rose-500/15 border border-rose-500/40 text-rose-400 hover:bg-rose-500/25"
                          : "brutal-btn !py-0 !px-3 !text-[11px] !tracking-[0.22em]"
                      )}
                    >
                      {isConnecting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                        : isConnected
                        ? <><Square className="w-3.5 h-3.5 fill-current" /> End Call</>
                        : <><Mic className="w-3.5 h-3.5" /> Start Call</>}
                    </button>
                  </div>
                ) : (
                  <Link to="/agents" className="flex items-center justify-center gap-1.5 h-9 rounded-xl border border-brand/30 text-brand text-[10px] uppercase tracking-[0.26em] hover:bg-brand/10 transition-all">
                    <Users className="w-3.5 h-3.5" /> Add an Agent First
                  </Link>
                )}
              </div>

              {/* Action links */}
              {[
                { to: "/outbound", icon: PhoneCall, label: "Outbound Campaign", sub: "Upload & auto-dial", accent: "#9B59F5" },
                { to: "/inbox",    icon: Mail,      label: "Email Inbox",        sub: "Review queued emails", accent: "#E040C0" },
                { to: "/triage",   icon: Inbox,     label: "Triage Inbox",
                  sub: hotLeads.length > 0 ? `${hotLeads.length} hot lead${hotLeads.length > 1 ? "s" : ""} waiting` : "Review hot leads",
                  accent: "#0AC8D4", badge: hotLeads.length || undefined,
                },
              ].map(action => {
                const Icon = action.icon;
                return (
                  <Link key={action.to} to={action.to}
                    className="group flex items-center gap-3 h-11 rounded-xl glass border border-white/8 px-3.5 hover:border-white/20 hover:bg-white/4 transition-all"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-white/8"
                      style={{ background: `${action.accent}15`, color: action.accent }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-ink group-hover:text-brand transition-colors truncate">{action.label}</div>
                      <div className="text-[8px] uppercase tracking-[0.24em] text-muted">{action.sub}</div>
                    </div>
                    {action.badge ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[8px] text-rose-400 font-mono shrink-0">
                        {action.badge}
                      </span>
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted/40 group-hover:text-ink transition-colors shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </Panel>

          {/* Sentiment mini-panel */}
          <Panel title="Sentiment" hint="call health" icon={ShieldCheck} accent="#10B981">
            {(() => {
              const s = stats?.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 };
              const total = (s.positive + s.neutral + s.negative) || 1;
              const positivePct = Math.round((s.positive / total) * 100);
              const neutralPct  = Math.round((s.neutral  / total) * 100);
              const negativePct = 100 - positivePct - neutralPct;
              return (
                <div className="flex items-center gap-4 h-full">
                  <div className="text-center shrink-0">
                    <div className="font-display italic text-4xl text-ink leading-none">{positivePct}<span className="text-xl">%</span></div>
                    <div className="text-[8px] uppercase tracking-[0.4em] text-brand mt-1">Positive</div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[
                      { label: "Pos", pct: positivePct, color: "#0AC8D4" },
                      { label: "Neu", pct: neutralPct,  color: "#9B59F5" },
                      { label: "Neg", pct: negativePct, color: "#E040C0" },
                    ].map(({ label, pct, color }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[8px] uppercase tracking-[0.2em] text-muted w-6 shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 1.2, delay: 0.2 }}
                            className="h-full rounded-full"
                            style={{ background: color }}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-muted/70 w-7 text-right shrink-0">{pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </Panel>
        </div>
      </div>
    </div>
  );
  const Brief = (
    <div className="h-full grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-7 h-full overflow-hidden">
        <Panel title="Daily Brief" hint="AI Summary" icon={Sparkles} scroll>
          <WidgetBoundary label="Daily Brief">
            <DailyBrief />
          </WidgetBoundary>
        </Panel>
      </div>
      <div className="col-span-12 lg:col-span-5 h-full overflow-hidden">
        <Panel title="Quickstart" hint="First-run" icon={Activity} scroll>
          <WidgetBoundary label="Quickstart">
            <OnboardingQuickstart />
          </WidgetBoundary>
        </Panel>
      </div>
      <div className="col-span-12 h-full overflow-hidden">
        <Panel title="How am I doing?" hint="Performance · 30-day window" icon={TrendingUp} scroll>
          <WidgetBoundary label="Performance Benchmarks">
            <PerformanceBenchmarks />
          </WidgetBoundary>
        </Panel>
      </div>
    </div>
  );

  const Fleet = (
    <div className="h-full grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-7 h-full">
        <Panel
          title="Hot Leads"
          hint={`${hotLeads.length} pending`}
          icon={Target}
          scroll
          flush
          actions={
            <Link to="/triage" className="text-[9px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors flex items-center gap-1">
              Triage <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          {hotLeads.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {hotLeads.map((lead: any) => {
                const score = lead.score ?? 0;
                const isHot = score >= HOT_LEAD_THRESHOLD;
                const scoreColor = score >= HOT_LEAD_THRESHOLD ? "#10B981" : score >= WARM_LEAD_THRESHOLD ? "#0AC8D4" : "#9B59F5";
                return (
                  <li key={lead.id}>
                    <Link to={lead.type === 'call' ? "/logs" : "/inbox"}
                      className={cn(
                        "group flex items-center justify-between gap-3 px-4 py-3 transition-all",
                        isHot ? "hover:bg-emerald-500/5" : "hover:bg-white/2"
                      )}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl glass border flex items-center justify-center shrink-0 transition-all",
                          isHot
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-white/10 text-brand"
                        )}>
                          {isHot && (
                            <span className="absolute w-9 h-9 rounded-xl border border-emerald-500/30 animate-ping opacity-30" />
                          )}
                          {lead.type === 'call' ? <PhoneCall className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-display italic text-base text-ink truncate">{lead.contact}</span>
                            <span
                              className="px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-[0.22em] border shrink-0"
                              style={{
                                background: `${scoreColor}18`,
                                borderColor: `${scoreColor}40`,
                                color: scoreColor,
                              }}
                            >
                              {score}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted truncate max-w-md leading-tight mb-1.5">{lead.summary}</p>
                          {/* Score bar */}
                          <div className="w-full h-0.5 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${score}%` }}
                              transition={{ duration: 0.8, delay: 0.1 }}
                              className="h-full rounded-full"
                              style={{ background: scoreColor }}
                            />
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink/40 group-hover:text-ink transition-colors shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted/50">
              <Radio className="w-8 h-8 opacity-30 animate-pulse" />
              <p className="text-[9px] uppercase tracking-[0.5em]">No leads yet</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-5 h-full grid grid-rows-2 gap-3">
        <Panel title="Active Calls" hint="WebSocket" icon={Signal} scroll flush>
          {activeSignals.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {activeSignals.map((sig: any, idx: number) => (
                <li key={idx} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-display italic text-sm text-ink truncate">{sig.customer_number}</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 indicator-glow" />
                      <span className="text-[8px] uppercase tracking-[0.28em] text-muted">{sig.status}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[8px] uppercase tracking-[0.28em] text-rose-500">Deployed</div>
                    <div className="text-[8px] font-mono text-muted/60">{sig.agent_id?.substring(0,8)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-[9px] uppercase tracking-[0.5em] text-muted/50">No active calls</p>
            </div>
          )}
        </Panel>
        <Panel title="Fleet Tasks" hint="Bridge" icon={Inbox} scroll>
          <WidgetBoundary label="Fleet Tasks">
            <FleetTaskBridge />
          </WidgetBoundary>
        </Panel>
      </div>
    </div>
  );

  const HistoryView = (
    <div className="h-full grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-8 h-full">
        <Panel
          title="Recent Calls"
          hint={`${recentLogs.length} captured`}
          icon={Mic}
          scroll
          flush
          actions={
            <Link to="/logs" className="text-[9px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors flex items-center gap-1">
              Archives <ArrowUpRight className="w-3 h-3" />
            </Link>
          }
        >
          {recentLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-[9px] uppercase tracking-[0.5em] text-muted/40">No calls yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentLogs.map((call: any, idx: number) => (
                <li key={call.id || idx}>
                  <Link to="/logs" className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/2 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-9 h-9 rounded-xl glass border flex items-center justify-center transition-all shrink-0",
                        call.direction === 'inbound' ? "border-brand/30 text-brand" : "border-brand-2/30 text-brand-2"
                      )}>
                        <PhoneCall className={cn("w-4 h-4", call.direction === 'inbound' ? "" : "-rotate-90")} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display italic text-base text-ink truncate">{call.customer_number || "Simulator"}</div>
                        <div className="text-[10px] text-muted truncate max-w-md">{call.summary}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-ink/90">{Math.ceil((call.duration_seconds || 0) / 60)}m {(call.duration_seconds || 0) % 60}s</div>
                      <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-0.5">{formatDate(call.created_at)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="col-span-12 lg:col-span-4 h-full">
        <Panel title="Activity Feed" hint="Live activity" icon={Activity} scroll>
          <WidgetBoundary label="Activity Feed">
            <TriggerIntelligenceFeed activity={systemActivity} />
          </WidgetBoundary>
        </Panel>
      </div>
    </div>
  );

  return (
    <PageShell
      eyebrow={`Today · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
      title="Dashboard"
      subtitle="Live overview of your agents and activity"
      actions={
        <>
          {highPriorityTasks.length > 0 && (
            <Link to="/triage" className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/15 transition-all">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
              </span>
              <span className="text-[9px] uppercase tracking-[0.28em] text-rose-500">{highPriorityTasks.length} critical</span>
            </Link>
          )}
          {voiceButton}
        </>
      }
      tabs={[
        { id: "pulse",   label: "Pulse",     icon: Activity,   content: Pulse },
        { id: "brief",   label: "Brief",     icon: Sparkles,   content: Brief },
        { id: "fleet",   label: "Fleet",     icon: Target,     badge: hotLeads.length || undefined, content: Fleet },
        { id: "history", label: "History",   icon: HistoryIcon, content: HistoryView },
      ]}
    />
  );
}
