import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, PhoneCall, ShieldCheck, Zap, Mic, Square, Loader2, PlayCircle, Clock, Calendar, Users, TrendingUp, DollarSign, ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Signal, Target, Radio, Sparkles, Waves } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { motion } from "motion/react";
import Vapi from "@vapi-ai/web";
import { cn } from "../lib/utils";
import FleetTaskBridge from "./FleetTaskBridge";
import TriggerIntelligenceFeed from "./TriggerIntelligenceFeed";
import { authFetch } from "../lib/api";

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || "");

export default function DashboardHome() {
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
    }, 5000);

    vapi.on("call-start", () => {
      setIsConnecting(false);
      setIsConnected(true);
    });

    vapi.on("call-end", () => {
      setIsConnecting(false);
      setIsConnected(false);
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
    } catch (e) {
      console.error("Signal presence sync failed:", e);
    }
  };

  const fetchHighPriorityTasks = async () => {
    try {
      const res = await authFetch("/api/fleet/tasks");
      const data = await res.json();
      const high = (data.tasks || []).filter((t: any) => t.priority === 'high' && t.status === 'pending');
      setHighPriorityTasks(high);
    } catch (e) {}
  };

  const fetchSystemActivity = async () => {
    try {
      const res = await authFetch("/api/fleet/activity");
      const data = await res.json();
      setSystemActivity(data.activity || []);
    } catch (e) {}
  };

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch("/api/dashboard/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const toggleCall = async () => {
    if (isConnected) {
      vapi.stop();
    } else {
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
        if (data.assistant) {
          await vapi.start(data.assistant);
        } else {
           throw new Error("No assistant configuration returned");
        }
      } catch (e) {
        console.error("Failed to start call", e);
        setIsConnecting(false);
        alert("Carrier connection failed. Ensure at least one agent is configured and Vapi key is valid.");
      }
    }
  };

  const chartData = stats?.chartData || [
    { name: "MON", signals: 12, leads: 5 },
    { name: "TUE", signals: 18, leads: 8 },
    { name: "WED", signals: 15, leads: 12 },
    { name: "THU", signals: 25, leads: 15 },
    { name: "FRI", signals: 22, leads: 10 },
    { name: "SAT", signals: 10, leads: 4 },
    { name: "SUN", signals: 8, leads: 2 },
  ];

  const recentLogs = stats?.recentLogs || [];

  return (
    <div className="min-h-full w-full max-w-[1700px] mx-auto space-y-12 pb-32">
      {/* Hero */}
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10"
      >
        <div className="space-y-6 flex-1">
          {highPriorityTasks.length > 0 && (
            <Link to="/fleet" className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/15 transition-all group">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-rose-500 font-medium">{highPriorityTasks.length} critical missions await</span>
              <ChevronRight className="w-3.5 h-3.5 text-rose-500 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 indicator-glow" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Relay Optimal</span>
            </div>
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <Radio className="w-3 h-3 text-brand" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Latency 42ms</span>
            </div>
            {activeSignals.length > 0 && (
              <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
                <Signal className="w-3 h-3 text-brand-2" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">{activeSignals.length} threads live</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Today · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <motion.h1
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="font-display italic text-6xl md:text-7xl lg:text-[7.5rem] leading-[0.9] tracking-tight"
            >
              <span className="text-aurora">Command</span><br />
              <span className="text-ink/90">Atlas</span>
            </motion.h1>
            <p className="text-ink/50 max-w-xl text-sm leading-relaxed">
              Live tactical oversight of autonomous agent dispersion and signal throughput across the Aurora Relay.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[10px] uppercase tracking-[0.45em] text-muted text-right">Voice Console</span>
          <button
            onClick={toggleCall}
            disabled={isConnecting}
            className={cn(
              "lg:min-w-[360px] h-16 px-8 rounded-full flex items-center justify-center gap-3 text-[12px] uppercase tracking-[0.32em] transition-all relative overflow-hidden group",
              isConnected
                ? "bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25"
                : "brutal-btn"
            )}
          >
            {isConnecting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Synchronizing</>
            ) : isConnected ? (
              <><Square className="w-4 h-4 fill-current" /> Terminate Signal</>
            ) : (
              <><Mic className="w-5 h-5" /> Initiate Test Relay</>
            )}
          </button>
        </div>
      </motion.header>

      {isLoading && !stats ? (
        <div className="flex-1 flex flex-col items-center justify-center py-32 space-y-8">
          <div className="relative w-32 h-32">
            <div className="absolute inset-0 rounded-full" style={{
              background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)",
              filter: "blur(2px)",
              animation: "spin 8s linear infinite"
            }} />
            <div className="absolute inset-1.5 rounded-full bg-paper" />
            <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
              <Target className="w-12 h-12 text-aurora" strokeWidth={1.5} />
            </div>
          </div>
          <div className="text-center space-y-3">
            <p className="text-aurora text-sm uppercase tracking-[0.5em]">Syncing Carrier Nodes</p>
          </div>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="space-y-12"
        >
          {/* Metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { label: "Carrier Signals",    value: stats?.totalCalls ?? 0,            sub: "Live dispatch total",       icon: PhoneCall, accent: "#7DF9FF" },
              { label: "Routing Precision",  value: `${stats?.conversionRate ?? 0}%`,  sub: "Intent fulfillment",       icon: TrendingUp, accent: "#C58BFF" },
              { label: "Active Nodes",       value: stats?.totalLeads ?? 0,            sub: "Operational fleet",        icon: Bot, accent: "#FF6BD9" },
              { label: "Operational Burn",   value: `$${stats?.totalCost ?? "0.00"}`,  sub: "Carrier expenditure",      icon: DollarSign, accent: "#4DFFC4" },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.4 }}
                className="relative aurora-ring rounded-3xl"
              >
                <div className="relative p-7 rounded-3xl glass overflow-hidden h-full">
                  <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${c.accent}, transparent)` }} />
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{c.label}</p>
                      <div className="w-9 h-9 rounded-xl glass border border-white/10 flex items-center justify-center" style={{ color: c.accent }}>
                        <c.icon className="w-4 h-4" strokeWidth={2} />
                      </div>
                    </div>
                    <h3 className="font-display italic text-5xl md:text-6xl text-ink leading-none tracking-tight mb-3">{c.value}</h3>
                    <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent mt-auto mb-3" />
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{c.sub}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <section className="lg:col-span-2 space-y-8">
              {/* Live signal relay */}
              {activeSignals.length > 0 && (
                <motion.div layout className="relative aurora-ring rounded-3xl">
                  <div className="relative rounded-3xl glass-strong overflow-hidden">
                    <div className="px-7 py-5 border-b border-white/8 flex justify-between items-center">
                      <h2 className="font-display italic text-2xl flex items-center gap-3">
                        <Signal className="w-5 h-5 text-rose-500" />
                        Tactical Signal Relay
                      </h2>
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Live Monitor</span>
                      </div>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeSignals.map((sig, idx) => (
                        <div key={idx} className="relative group p-5 rounded-2xl glass border border-white/8 hover:border-brand/40 transition-all">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-display italic text-2xl text-ink mb-1.5 tracking-tight">{sig.customer_number}</div>
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 indicator-glow" />
                                <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{sig.status}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-[0.3em] text-rose-500 mb-1">Deployed</div>
                              <div className="text-[9px] font-mono text-muted/60">node·{sig.agent_id.substring(0,8)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-7 py-3 border-t border-white/8 text-center">
                      <p className="text-[9px] uppercase tracking-[0.7em] text-muted/60">AES-256 Encrypted Stream</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* High-intent signals */}
              <div className="relative aurora-ring rounded-3xl">
                <div className="relative rounded-3xl glass overflow-hidden">
                  <div className="px-7 py-5 border-b border-white/8 flex justify-between items-center">
                    <h2 className="font-display italic text-3xl flex items-center gap-3">
                      <Target className="w-5 h-5 text-brand" />
                      High-Intent Signals
                    </h2>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Sector Archive</span>
                  </div>
                  <div className="divide-y divide-white/5 flex-1 overflow-y-auto max-h-[700px] scrollbar-hide">
                    {stats?.hotLeads?.length > 0 ? (
                      stats.hotLeads.map((lead: any) => (
                        <div key={lead.id} className="group relative p-7 flex items-center justify-between hover:bg-white/2 transition-all cursor-pointer">
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-brand/0 to-transparent group-hover:via-brand/60 transition-all" />
                          <div className="flex items-center gap-5 md:gap-6 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl glass border border-white/10 flex items-center justify-center text-brand group-hover:text-paper transition-colors">
                                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }} />
                                {lead.type === 'call' ? <PhoneCall className="w-6 h-6 relative z-10" /> : <Mail className="w-6 h-6 relative z-10" />}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                                <span className="font-display italic text-2xl md:text-3xl text-ink leading-none tracking-tight truncate">{lead.contact}</span>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/15 border border-brand/30 w-fit">
                                  <Sparkles className="w-3 h-3 text-brand" />
                                  <span className="text-[9px] uppercase tracking-[0.25em] text-brand font-medium">{lead.score}% intent</span>
                                </div>
                              </div>
                              <p className="text-xs md:text-sm text-muted leading-relaxed truncate max-w-xl">{lead.summary}</p>
                            </div>
                          </div>
                          <Link to={lead.type === 'call' ? "/logs" : "/inbox"} className="ml-4 shrink-0 w-12 h-12 rounded-full glass border border-white/10 flex items-center justify-center text-ink/60 group-hover:text-paper group-hover:border-brand/0 transition-all relative overflow-hidden">
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }} />
                            <ChevronRight className="w-5 h-5 relative z-10" />
                          </Link>
                        </div>
                      ))
                    ) : (
                      <div className="p-24 text-center text-muted/40 flex flex-col items-center justify-center space-y-4">
                        <Radio className="w-16 h-16 opacity-30 animate-pulse" />
                        <p className="text-[10px] uppercase tracking-[0.6em]">Sector silence</p>
                      </div>
                    )}
                  </div>
                  <div className="px-7 py-4 border-t border-white/8 text-center">
                    <button className="text-[10px] uppercase tracking-[0.4em] text-muted/60 hover:text-ink transition-colors">Load Archived Histograms</button>
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-8">
              {/* Signal metrics chart */}
              <section className="relative aurora-ring rounded-3xl">
                <div className="relative rounded-3xl glass overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/8">
                    <h3 className="font-display italic text-2xl flex items-center gap-3">
                      <BarChart3 className="w-5 h-5 text-brand-2" />
                      Signal Metrics
                    </h3>
                  </div>
                  <div className="p-5 h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#7DF9FF" stopOpacity={0.6}/>
                            <stop offset="50%" stopColor="#C58BFF" stopOpacity={0.3}/>
                            <stop offset="100%" stopColor="#FF6BD9" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#7DF9FF"/>
                            <stop offset="50%" stopColor="#C58BFF"/>
                            <stop offset="100%" stopColor="#FF6BD9"/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#FFFFFF" strokeOpacity={0.05} />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#8B89B8', fontWeight: 500, fontSize: 10, letterSpacing: '0.15em' }}
                          dy={10}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(15,14,45,0.95)', border: '1px solid rgba(125,249,255,0.3)', borderRadius: '12px', color: '#F2F1FF', fontSize: '12px', backdropFilter: 'blur(20px)', boxShadow: '0 12px 36px -8px rgba(125,249,255,0.3)' }}
                          cursor={{ stroke: '#7DF9FF', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="signals"
                          stroke="url(#strokeGrad)"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorSignals)"
                          animationDuration={1800}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="px-6 py-4 border-t border-white/8 flex justify-between items-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-muted mb-1">Tactical Accuracy</div>
                      <div className="font-display italic text-3xl text-aurora tracking-tight">82.4%</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center text-brand">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </section>

              <TriggerIntelligenceFeed activity={systemActivity} />
              <FleetTaskBridge />

              {/* System criticality */}
              <div className="relative aurora-ring rounded-3xl">
                <div className="relative p-7 rounded-3xl glass-strong overflow-hidden space-y-5">
                  <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #FF6BD9, transparent)" }} />
                  <div className="relative z-10 flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-rose-500" />
                    <h4 className="text-[11px] uppercase tracking-[0.4em] text-rose-500">System Criticality</h4>
                  </div>
                  <p className="relative z-10 text-ink/60 text-xs leading-relaxed">
                    All carrier nodes operating within thermal limits. No signal drops detected in the last 14,000 requests. Redundancy protocols active.
                  </p>
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "94%" }}
                        transition={{ duration: 1.8, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, #7DF9FF, #C58BFF, #FF6BD9)" }}
                      />
                    </div>
                    <span className="font-mono text-xs text-ink">94%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mission integrity hero panel */}
          <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="relative aurora-ring rounded-3xl">
            <div className="relative rounded-3xl p-10 md:p-16 glass-strong overflow-hidden">
              <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #7DF9FF, transparent)" }} />
              <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #C58BFF, transparent)" }} />

              <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-12">
                <div className="space-y-6 max-w-2xl">
                  <div className="flex items-center gap-3 mb-2">
                    <Sparkles className="w-4 h-4 text-brand" />
                    <span className="text-[10px] uppercase tracking-[0.45em] text-brand">Aurora Health</span>
                  </div>
                  <h3 className="font-display italic text-5xl md:text-7xl text-aurora leading-[0.9] tracking-tight">Mission Integrity</h3>
                  <p className="text-ink/50 text-sm md:text-base leading-relaxed">
                    Platform protocols remain stable across all carrier geographies. Neural engines operate at peak inference capacity.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 rounded-full glass border border-brand/30 text-brand text-[10px] uppercase tracking-[0.3em]">Node Global-Relay-1</div>
                    <div className="px-3 py-1.5 rounded-full glass border border-rose-500/30 text-rose-500 text-[10px] uppercase tracking-[0.3em]">Core Active</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 w-full xl:w-auto">
                  <div className="flex-1 min-w-[200px] md:min-w-[260px] p-7 md:p-10 rounded-3xl glass border border-white/10 hover:border-brand/40 transition-all relative overflow-hidden group">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-60" />
                    <div className="text-[10px] uppercase tracking-[0.45em] text-brand mb-6">Dispersion Time</div>
                    <div className="font-display italic text-6xl md:text-8xl text-ink leading-none tracking-tight">
                      {stats?.totalMinutes || 0}
                      <span className="text-2xl md:text-3xl text-muted/60 ml-2 not-italic">min</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px] md:min-w-[260px] p-7 md:p-10 rounded-3xl glass border border-white/10 hover:border-brand-3/40 transition-all relative overflow-hidden group">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-3 to-transparent opacity-60" />
                    <div className="text-[10px] uppercase tracking-[0.45em] text-brand-3 mb-6">Target Capture</div>
                    <div className="font-display italic text-6xl md:text-8xl text-ink leading-none tracking-tight">
                      72.4
                      <span className="text-2xl md:text-3xl text-muted/60 ml-1 not-italic">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Signal history */}
          <motion.section variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="relative aurora-ring rounded-3xl">
            <div className="relative rounded-3xl glass overflow-hidden">
              <div className="px-7 py-5 border-b border-white/8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="font-display italic text-3xl flex items-center gap-3">
                  <Mic className="w-5 h-5 text-brand" />
                  Signal History
                </h2>
                <Link to="/logs" className="px-5 py-2.5 rounded-full glass border border-white/10 hover:border-brand/40 text-[11px] uppercase tracking-[0.3em] flex items-center gap-2 transition-all group">
                  View All Archives
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                {recentLogs.length === 0 ? (
                  <div className="p-24 text-center col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.6em] text-muted/40">Idle signal state</p>
                  </div>
                ) : (
                  recentLogs.slice(0, 4).map((call: any, idx: number) => (
                    <Link to="/logs" key={call.id || idx} className="group relative p-7 md:p-9 flex items-center justify-between hover:bg-white/2 transition-all overflow-hidden">
                      <div className="flex items-center gap-5 relative z-10 min-w-0">
                        <div className={cn(
                          "w-14 h-14 md:w-16 md:h-16 rounded-2xl glass border flex items-center justify-center transition-all shrink-0",
                          call.direction === 'inbound' ? "border-brand/30 text-brand" : "border-brand-2/30 text-brand-2"
                        )}>
                          <PhoneCall className={cn("w-6 h-6", call.direction === 'inbound' ? "" : "-rotate-90")} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-display italic text-2xl md:text-3xl text-ink leading-none mb-2 tracking-tight truncate">{call.customer_number || "Simulator"}</div>
                          <div className="text-[10px] uppercase tracking-[0.3em] text-muted truncate w-48 md:w-72">{call.summary}</div>
                        </div>
                      </div>
                      <div className="text-right relative z-10 shrink-0 ml-4">
                        <div className="font-mono text-base md:text-lg text-ink/90">{Math.ceil(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</div>
                        <div className="text-[9px] uppercase tracking-[0.3em] text-muted mt-1">{new Date(call.created_at).toLocaleDateString()}</div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <div className="px-7 py-4 border-t border-white/8 text-center flex items-center justify-center gap-2">
                <span className="w-1 h-1 rounded-full bg-brand indicator-glow" />
                <p className="text-[9px] uppercase tracking-[0.7em] text-muted/60">End of recent buffer</p>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}
