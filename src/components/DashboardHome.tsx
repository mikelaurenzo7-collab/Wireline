import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Activity, PhoneCall, Mic, Square, Loader2, TrendingUp, DollarSign,
  ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Signal, Target,
  Radio, Sparkles, Inbox, History as HistoryIcon, ShieldCheck,
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
      if (stats?.agents?.length > 0) {
        const voiceAgent = stats.agents.find((a: any) => a.channel === 'voice' || a.channel === 'omnichannel');
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
    <div className="h-full grid grid-cols-12 grid-rows-6 gap-3">
      {/* 4 stat tiles */}
      <div className="col-span-12 lg:col-span-8 row-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total Calls"      value={stats?.totalCalls ?? 0}              sub="All time"           icon={PhoneCall}  accent="#7DF9FF" />
        <StatTile label="Conversion Rate"  value={`${stats?.conversionRate ?? 0}%`}    sub="Intent match"       icon={TrendingUp} accent="#C58BFF" />
        <StatTile label="Outbound Leads"   value={stats?.totalLeads ?? 0}              sub="Queue depth"        icon={Bot}        accent="#FF6BD9" />
        <StatTile label="Total Cost"       value={`$${stats?.totalCost ?? "0.00"}`}    sub="Current period"     icon={DollarSign} accent="#4DFFC4" />
      </div>

      {/* Mission integrity */}
      <div className="col-span-12 lg:col-span-4 row-span-2 lg:row-span-6">
        <Panel title="System Health" hint="Status" icon={ShieldCheck}>
          <div className="h-full flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(stats?.agents || []).slice(0, 3).map((a: any, i: number) => (
                <span key={i} className="px-2 py-0.5 rounded-full glass border border-brand/30 text-brand text-[8px] uppercase tracking-[0.28em]">{a.name}</span>
              ))}
              {!(stats?.agents?.length) && (
                <span className="px-2 py-0.5 rounded-full glass border border-rose-500/30 text-rose-500 text-[8px] uppercase tracking-[0.28em]">No agents</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg glass border border-white/8">
                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">Call Minutes</div>
                <div className="font-display italic text-2xl text-ink leading-none">{stats?.totalMinutes || 0}<span className="text-xs text-muted/60 ml-1 not-italic">min</span></div>
              </div>
              <div className="p-3 rounded-lg glass border border-white/8">
                <div className="text-[8px] uppercase tracking-[0.3em] text-brand-3 mb-1">Avg Score</div>
                <div className="font-display italic text-2xl text-ink leading-none">{stats?.avgLeadScore ?? 0}<span className="text-xs text-muted/60 ml-1 not-italic">pts</span></div>
              </div>
            </div>
            <div className="rounded-lg glass border border-white/8 p-3">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-3 h-3 text-rose-500" />
                <span className="text-[9px] uppercase tracking-[0.3em] text-rose-500">Sentiment Health</span>
              </div>
              {(() => {
                const s = stats?.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 };
                const total = (s.positive + s.neutral + s.negative) || 1;
                const positivePct = Math.round((s.positive / total) * 100);
                return (
                  <>
                    <p className="text-[11px] text-ink/55 leading-snug">
                      {positivePct > 0 ? `${positivePct}% positive sentiment across ${total} call${total === 1 ? '' : 's'}.` : 'No call data yet.'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${positivePct}%` }} transition={{ duration: 1.4 }}
                          className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#7DF9FF,#C58BFF,#FF6BD9)" }} />
                      </div>
                      <span className="font-mono text-[10px] text-ink">{positivePct}%</span>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5">
              <div className="px-2 py-1 rounded-full glass border border-white/8 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500 indicator-glow" />
                <span className="text-[8px] uppercase tracking-[0.3em] text-ink/80">
                  {stats?.agents?.length ? `${stats.agents.length} agent${stats.agents.length > 1 ? 's' : ''}` : 'No agents'}
                </span>
              </div>
              <div className="px-2 py-1 rounded-full glass border border-white/8 flex items-center gap-1.5">
                <Signal className="w-2.5 h-2.5 text-brand" />
                <span className="text-[8px] uppercase tracking-[0.3em] text-ink/80">{stats?.inboundCount ?? 0}↓ {stats?.outboundCount ?? 0}↑</span>
              </div>
              {activeSignals.length > 0 && (
                <div className="px-2 py-1 rounded-full glass border border-white/8 flex items-center gap-1.5">
                  <Signal className="w-2.5 h-2.5 text-brand-2" />
                  <span className="text-[8px] uppercase tracking-[0.3em] text-ink/80">{activeSignals.length} live</span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* Chart */}
      <div className="col-span-12 lg:col-span-8 row-span-4">
        <Panel title="Call Volume" hint="7-day trend" icon={BarChart3}>
          <div className="h-full w-full">
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
