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
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || "");

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
      const res = await authFetch("/api/fleet/tasks");
      const data = await res.json();
      const high = (data.tasks || []).filter((t: any) => t.priority === 'high' && t.status === 'pending');
      setHighPriorityTasks(high);
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
      toastError("Carrier connection failed", "Ensure at least one agent is configured and Vapi key is valid.");
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
              background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)",
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

  const Pulse = (
    <div className="h-full grid grid-cols-12 gap-3">
      {/* Mission Control — 3 columns side by side */}
      <div className="col-span-12 lg:col-span-4">
        <Panel title="What Agents Did" hint="Recent outcomes" icon={HistoryIcon} scroll>
          <div className="space-y-1">
            {/* Summary row */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1 rounded-lg bg-brand/8 border border-brand/20 p-2.5 text-center">
                <div className="font-display italic text-2xl text-ink leading-none">{stats?.totalCalls ?? 0}</div>
                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mt-0.5">Calls</div>
              </div>
              <div className="flex-1 rounded-lg bg-brand-2/8 border border-brand-2/20 p-2.5 text-center">
                <div className="font-display italic text-2xl text-ink leading-none">{hotLeads.length}</div>
                <div className="text-[8px] uppercase tracking-[0.3em] text-brand-2 mt-0.5">Hot Leads</div>
              </div>
              <div className="flex-1 rounded-lg bg-brand-3/8 border border-brand-3/20 p-2.5 text-center">
                <div className="font-display italic text-2xl text-ink leading-none">{stats?.conversionRate ?? 0}%</div>
                <div className="text-[8px] uppercase tracking-[0.3em] text-brand-3 mt-0.5">Converts</div>
              </div>
            </div>
            {/* Recent log entries */}
            {recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted/40">
                <Radio className="w-6 h-6 opacity-30 animate-pulse" />
                <p className="text-[9px] uppercase tracking-[0.5em]">No calls yet</p>
                <p className="text-[10px] text-center text-muted/50 max-w-[200px] leading-snug">Run a test call above to start collecting outcomes</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {recentLogs.slice(0, 5).map((call: any, idx: number) => (
                  <Link key={call.id || idx} to="/logs" className="group flex items-start gap-3 py-2.5 hover:bg-white/2 rounded-lg px-1 -mx-1 transition-all">
                    <div className={cn(
                      "mt-0.5 w-7 h-7 rounded-lg glass border flex items-center justify-center shrink-0",
                      call.direction === 'inbound' ? "border-brand/30 text-brand" : "border-brand-2/30 text-brand-2"
                    )}>
                      <PhoneCall className={cn("w-3.5 h-3.5", call.direction === 'outbound' ? "-rotate-90" : "")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-display italic text-sm text-ink truncate">{call.customer_number || "Simulator"}</span>
                        <span className="text-[8px] font-mono text-muted shrink-0">{Math.ceil((call.duration_seconds || 0) / 60)}m</span>
                      </div>
                      <p className="text-[10px] text-muted/80 truncate leading-tight">{call.summary || "No summary"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Link to="/logs" className="mt-2 flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors py-1">
              View all archives <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <Panel title="What Agents Are Doing" hint="Live status" icon={Signal}>
          <div className="space-y-3">
            {/* Live call indicator */}
            <div className={cn(
              "flex items-center gap-3 rounded-xl p-3 border transition-all",
              activeSignals.length > 0
                ? "bg-emerald-500/8 border-emerald-500/30"
                : "bg-white/3 border-white/8"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                activeSignals.length > 0 ? "bg-emerald-500/20" : "bg-white/5"
              )}>
                <span className={cn(
                  "w-3 h-3 rounded-full",
                  activeSignals.length > 0 ? "bg-emerald-500 indicator-glow" : "bg-white/20"
                )} />
              </div>
              <div>
                <div className="text-[11px] font-medium text-ink">
                  {activeSignals.length > 0
                    ? `${activeSignals.length} live call${activeSignals.length > 1 ? "s" : ""} in progress`
                    : "No live calls right now"}
                </div>
                <div className="text-[9px] uppercase tracking-[0.28em] text-muted">
                  {stats?.inboundCount ?? 0} inbound · {stats?.outboundCount ?? 0} outbound total
                </div>
              </div>
            </div>
            {/* Browser test status */}
            <div className={cn(
              "flex items-center gap-3 rounded-xl p-3 border transition-all",
              isConnected ? "bg-rose-500/8 border-rose-500/30" :
              isConnecting ? "bg-amber-500/8 border-amber-500/30" :
              "bg-white/3 border-white/8"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                isConnected ? "bg-rose-500/20" : isConnecting ? "bg-amber-500/20" : "bg-white/5"
              )}>
                {isConnecting
                  ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  : <Mic className={cn("w-4 h-4", isConnected ? "text-rose-500" : "text-white/30")} />
                }
              </div>
              <div>
                <div className="text-[11px] font-medium text-ink">
                  {isConnected ? "Browser test call active" : isConnecting ? "Establishing connection…" : "Test call idle"}
                </div>
                <div className="text-[9px] uppercase tracking-[0.28em] text-muted">Browser → Agent</div>
              </div>
            </div>
            {/* Per-agent roster */}
            {(stats?.agents || []).length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[8px] uppercase tracking-[0.36em] text-muted px-1">Agent Roster</div>
                {(stats?.agents || []).slice(0, 4).map((a: any, i: number) => {
                  const busy = activeSignals.some((s: any) => s.agent_id === a.id);
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/2 border border-white/6">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", busy ? "bg-rose-500 indicator-glow" : "bg-emerald-500/70")} />
                      <span className="text-[11px] text-ink truncate flex-1">{a.name}</span>
                      <span className="text-[8px] uppercase tracking-[0.22em] text-muted">{busy ? "On call" : "Ready"}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {!(stats?.agents?.length) && (
              <div className="text-[10px] text-muted/50 text-center py-3">No agents configured yet</div>
            )}
          </div>
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <Panel title="Do Something Now" hint="One-click actions" icon={Zap}>
          <div className="space-y-3">
            {/* Primary CTA — make a call */}
            <div className="rounded-xl p-3 border border-brand/25 bg-brand/5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-brand">
                <Mic className="w-3 h-3" /> Test Call
              </div>
              {voiceAgents.length > 0 ? (
                <>
                  <select
                    aria-label="Select agent to dial"
                    value={selectedDialAgentId}
                    onChange={(e) => setSelectedDialAgentId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-black/40 border border-white/12 text-[11px] text-ink outline-none focus:border-brand/60"
                  >
                    {voiceAgents.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={toggleCall}
                    disabled={isConnecting}
                    className="w-full h-10 rounded-xl brutal-btn !py-0 !px-3 !text-[11px] !tracking-[0.22em]"
                  >
                    {isConnecting
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                      : isConnected
                      ? <><Square className="w-3.5 h-3.5 fill-current" /> End Call</>
                      : <><Mic className="w-3.5 h-3.5" /> Make Test Call</>}
                  </button>
                </>
              ) : (
                <Link to="/agents" className="w-full h-10 rounded-xl glass border border-brand/40 text-brand text-[10px] uppercase tracking-[0.26em] flex items-center justify-center gap-1.5 hover:bg-brand/10 transition-all">
                  <Users className="w-3.5 h-3.5" /> Add an Agent First
                </Link>
              )}
            </div>

            {/* Secondary actions grid */}
            <div className="grid grid-cols-1 gap-2">
              <Link to="/outbound" className="group flex items-center gap-3 h-11 rounded-xl glass border border-white/10 px-3.5 hover:border-brand-2/50 hover:bg-brand-2/5 transition-all">
                <PhoneCall className="w-4 h-4 text-brand-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ink group-hover:text-brand-2 transition-colors">Outbound Dial Campaign</div>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-muted">Upload list → auto dial</div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted group-hover:text-brand-2 transition-colors shrink-0" />
              </Link>
              <Link to="/inbox" className="group flex items-center gap-3 h-11 rounded-xl glass border border-white/10 px-3.5 hover:border-brand-3/50 hover:bg-brand-3/5 transition-all">
                <Mail className="w-4 h-4 text-brand-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ink group-hover:text-brand-3 transition-colors">Email Inbox</div>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-muted">Respond to queued emails</div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted group-hover:text-brand-3 transition-colors shrink-0" />
              </Link>
              <Link to="/triage" className="group flex items-center gap-3 h-11 rounded-xl glass border border-white/10 px-3.5 hover:border-brand/50 hover:bg-brand/5 transition-all">
                <Inbox className="w-4 h-4 text-brand shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ink group-hover:text-brand transition-colors">Triage Inbox</div>
                  <div className="text-[8px] uppercase tracking-[0.24em] text-muted">
                    {hotLeads.length > 0 ? `${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} waiting` : 'Review hot leads'}
                  </div>
                </div>
                {hotLeads.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-[8px] text-rose-500 font-mono shrink-0">{hotLeads.length}</span>
                )}
                {!hotLeads.length && <ArrowUpRight className="w-3.5 h-3.5 text-muted group-hover:text-brand transition-colors shrink-0" />}
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* 4 stat tiles — full width */}
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total Calls"      value={stats?.totalCalls ?? 0}              sub="All time"           icon={PhoneCall}  accent="#7DF9FF" />
        <StatTile label="Conversion Rate"  value={`${stats?.conversionRate ?? 0}%`}    sub="Intent match"       icon={TrendingUp} accent="#C58BFF" />
        <StatTile label="Outbound Leads"   value={stats?.totalLeads ?? 0}              sub="Queue depth"        icon={Bot}        accent="#FF6BD9" />
        <StatTile label="Total Cost"       value={`$${stats?.totalCost ?? "0.00"}`}    sub="Current period"     icon={DollarSign} accent="#4DFFC4" />
      </div>

      {/* Chart + Sentiment */}
      <div className="col-span-12 lg:col-span-8">
        <Panel title="Call Volume" hint="7-day trend" icon={BarChart3}>
          <div className="h-full w-full min-h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <defs>
                  <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#7DF9FF" stopOpacity={0.6}/>
                    <stop offset="50%"  stopColor="#C58BFF" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#FF6BD9" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#7DF9FF"/>
                    <stop offset="50%"  stopColor="#C58BFF"/>
                    <stop offset="100%" stopColor="#FF6BD9"/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#FFFFFF" strokeOpacity={0.05} />
                <XAxis dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fill: '#8B89B8', fontWeight: 500, fontSize: 9, letterSpacing: '0.15em' }} dy={6} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15,14,45,0.95)', border: '1px solid rgba(125,249,255,0.3)', borderRadius: '12px', color: '#F2F1FF', fontSize: '11px', backdropFilter: 'blur(20px)' }}
                  cursor={{ stroke: '#7DF9FF', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="signals" stroke="url(#strokeGrad)" strokeWidth={2.5}
                  fillOpacity={1} fill="url(#colorSignals)" animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <Panel title="Sentiment Health" hint="Call quality" icon={ShieldCheck}>
          <div className="h-full flex flex-col gap-4">
            {(() => {
              const s = stats?.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 };
              const total = (s.positive + s.neutral + s.negative) || 1;
              const positivePct = Math.round((s.positive / total) * 100);
              const neutralPct  = Math.round((s.neutral  / total) * 100);
              const negativePct = 100 - positivePct - neutralPct;
              return (
                <>
                  <div className="text-center">
                    <div className="font-display italic text-5xl text-ink leading-none">{positivePct}<span className="text-2xl">%</span></div>
                    <div className="text-[9px] uppercase tracking-[0.4em] text-brand mt-1">Positive</div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: "Positive", pct: positivePct, color: "#7DF9FF" },
                      { label: "Neutral",  pct: neutralPct,  color: "#C58BFF" },
                      { label: "Negative", pct: negativePct, color: "#FF6BD9" },
                    ].map(({ label, pct, color }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-[0.24em] text-muted w-14 shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, delay: 0.2 }}
                            className="h-full rounded-full" style={{ background: color }} />
                        </div>
                        <span className="font-mono text-[9px] text-muted/80 w-7 text-right shrink-0">{pct}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted/60 text-center leading-snug mt-auto">
                    {total > 1 ? `Across ${total} recorded calls` : 'No call data yet — run a test call'}
                  </p>
                </>
              );
            })()}
          </div>
        </Panel>
      </div>
    </div>
  );

  const Brief = (
    <div className="h-full grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-7 h-full overflow-hidden">
        <Panel title="Daily Brief" hint="AI Summary" icon={Sparkles} scroll>
          <DailyBrief />
        </Panel>
      </div>
      <div className="col-span-12 lg:col-span-5 h-full overflow-hidden">
        <Panel title="Quickstart" hint="First-run" icon={Activity} scroll>
          <OnboardingQuickstart />
        </Panel>
      </div>
      <div className="col-span-12 h-full overflow-hidden">
        <Panel title="How am I doing?" hint="Performance · 30-day window" icon={TrendingUp} scroll>
          <PerformanceBenchmarks />
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
              {hotLeads.map((lead: any) => (
                <li key={lead.id}>
                  <Link to={lead.type === 'call' ? "/logs" : "/inbox"}
                    className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/2 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl glass border border-white/10 flex items-center justify-center text-brand shrink-0">
                        {lead.type === 'call' ? <PhoneCall className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-display italic text-base text-ink truncate">{lead.contact}</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-brand/15 border border-brand/30 text-[8px] uppercase tracking-[0.22em] text-brand">{lead.score}%</span>
                        </div>
                        <p className="text-[11px] text-muted truncate max-w-md leading-tight">{lead.summary}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink/40 group-hover:text-ink transition-colors shrink-0" />
                  </Link>
                </li>
              ))}
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
          <FleetTaskBridge />
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
                      <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-0.5">{new Date(call.created_at).toLocaleDateString()}</div>
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
          <TriggerIntelligenceFeed activity={systemActivity} />
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
