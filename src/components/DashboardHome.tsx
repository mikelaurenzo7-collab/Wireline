import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, PhoneCall, ShieldCheck, Zap, Mic, Square, Loader2, PlayCircle, Clock, Calendar, Users, TrendingUp, DollarSign, ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Signal, Target, Radio } from "lucide-react";
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
    <div className="min-h-full bg-paper w-full p-6 md:p-12 lg:p-16 max-w-[1700px] mx-auto space-y-12 pb-40">
      {/* Tactical Header Overlay */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12"
      >
        <div className="space-y-6 flex-1">
          {highPriorityTasks.length > 0 && (
            <Link to="/fleet" className="flex items-center gap-4 bg-rose-500 text-white px-6 py-3 brutal-border shadow-none mb-6 animate-pulse hover:bg-zinc-950 transition-all group">
              <Zap className="w-5 h-5 fill-white group-hover:fill-brand" />
              <span className="text-xs font-black uppercase tracking-[0.2em] italic">CRITICAL MISSION QUEUE: {highPriorityTasks.length} NODES REQUIRE IMMEDIATE RESOLUTION</span>
              <ChevronRight className="w-6 h-6 ml-auto" />
            </Link>
          )}

          <div className="flex flex-wrap items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display flex items-center gap-2">
                <span className="w-2 h-2 bg-ink rounded-full animate-ping" />
                RELAY STATUS: OPTIMAL
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Radio className="w-3 h-3 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">Fleet Latency: 42ms</span>
             </div>
             {activeSignals.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 text-white brutal-border border-zinc-900 shadow-none">
                   <Signal className="w-3 h-3 text-brand animate-pulse" />
                   <span className="text-[9px] font-black uppercase tracking-tighter italic">{activeSignals.length} Active Carrier Threads</span>
                </div>
             )}
          </div>

          <div className="space-y-2">
            <motion.h1 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-5xl md:text-7xl lg:text-8xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8] mb-4"
            >
              COMMAND<br />CENTER
            </motion.h1>
            <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed">
              Real-time tactical oversight of autonomous agent dispersion and signal processing throughput.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="text-[9px] font-black text-ink/30 uppercase tracking-[0.3em] italic text-right px-4">Relay Control Interface v2.4</div>
          <button 
            onClick={toggleCall}
            disabled={isConnecting}
            className={cn(
               "lg:min-w-[400px] brutal-btn h-20 text-sm font-black flex items-center justify-center gap-4 hover:shadow-[12px_12px_0px_0px_rgba(10,10,10,1)] uppercase tracking-[0.3em] italic px-10 transition-all",
               isConnected ? 'bg-rose-500 text-white shadow-[8px_8px_0px_0px_rgba(244,63,94,1)]' : 'bg-brand'
            )}
          >
            {isConnecting ? (
               <><Loader2 className="w-6 h-6 animate-spin" /> SYNCHRONIZING...</>
            ) : isConnected ? (
               <><Square className="w-6 h-6 fill-current" /> TERMINATE SIGNAL</>
            ) : (
               <><Mic className="w-6 h-6 text-ink" /> INITIATE TEST RELAY</>
            )}
          </button>
        </div>
      </motion.header>

      {isLoading && !stats ? (
        <div className="flex-1 flex flex-col items-center justify-center p-40 space-y-12">
           <div className="relative">
              <Loader2 className="w-24 h-24 animate-spin text-brand" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <Target className="w-10 h-10 text-ink animate-pulse" />
              </div>
           </div>
           <div className="text-center space-y-4">
             <p className="text-ink font-black uppercase tracking-[0.6em] text-sm italic animate-pulse">Syncing with Carrier Nodes...</p>
             <div className="w-64 h-1 bg-ink/5 mx-auto rounded-full overflow-hidden">
                <motion.div 
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-1/2 h-full bg-brand"
                />
             </div>
           </div>
        </div>
      ) : (
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
          className="space-y-16 lg:space-y-24"
        >
          {/* Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-brand transition-all !p-8 md:!p-10 border-4">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                 <PhoneCall className="w-32 h-32" />
              </div>
              <div className="flex justify-between items-start mb-8">
                 <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] group-hover:text-ink transition-colors italic">Carrier Signals</p>
                 <PhoneCall className="w-5 h-5 text-ink group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-5xl md:text-[6.5rem] font-black text-ink font-display italic leading-none tracking-tighter mb-4">{stats?.totalCalls || 0}</h3>
              <div className="h-1 w-full bg-ink/5 mt-4 group-hover:bg-ink/20 transition-colors" />
              <p className="text-[9px] font-black text-muted mt-5 group-hover:text-ink/60 uppercase tracking-[0.4em] italic mb-0">Live Dispatch Total</p>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card bg-zinc-950 text-white border-brand !p-8 md:!p-10 shadow-[12px_12px_0px_0px_#D4FF4D]">
              <div className="flex justify-between items-start mb-8">
                 <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] italic">Routing Precision</p>
                 <TrendingUp className="w-5 h-5 text-brand animate-bounce" />
              </div>
              <h3 className="text-5xl md:text-[6.5rem] font-black text-brand font-display italic leading-none tracking-tighter mb-4">{stats?.conversionRate || 0}%</h3>
              <div className="h-1 w-full bg-brand/10 mt-4" />
              <p className="text-[9px] font-black text-zinc-500 mt-5 uppercase tracking-[0.4em] leading-none italic">Intent Fulfillment</p>
            </motion.div>
            
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-ink hover:text-white transition-all !p-8 md:!p-10">
              <div className="flex justify-between items-start mb-8">
                 <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] group-hover:text-white/40 italic">Active Nodes</p>
                 <Bot className="w-5 h-5 text-ink group-hover:text-brand" />
              </div>
              <h3 className="text-5xl md:text-[6.5rem] font-black text-ink group-hover:text-white font-display leading-none italic tracking-tighter mb-4">{stats?.totalLeads || 0}</h3>
              <div className="h-1 w-full bg-ink/5 mt-4 group-hover:bg-white/10" />
              <p className="text-[9px] font-black text-muted mt-5 group-hover:text-white/40 uppercase tracking-[0.4em] italic">Operational Fleet</p>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-brand transition-all !p-8 md:!p-10">
              <div className="flex justify-between items-start mb-8">
                 <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] group-hover:text-ink italic">Operational Burn</p>
                 <DollarSign className="w-5 h-5 text-ink" />
              </div>
              <h3 className="text-5xl md:text-[6.5rem] font-black text-ink font-display leading-none italic tracking-tighter mb-4">${stats?.totalCost || "0.00"}</h3>
              <div className="h-1 w-full bg-ink/5 mt-4 group-hover:bg-ink/20" />
              <p className="text-[9px] font-black text-muted mt-5 group-hover:text-ink/60 uppercase tracking-[0.4em] italic">Carrier Expenditure</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-20">
              <section className="lg:col-span-2 space-y-12">
                 {/* Live Monitor */}
                 {activeSignals.length > 0 && (
                    <motion.div 
                      layout
                      className="brutal-card !p-0 overflow-hidden bg-zinc-950 text-white border-rose-500 shadow-[16px_16px_0px_0px_rgba(244,63,94,1)]"
                    >
                       <div className="p-6 border-b-4 border-white/10 flex justify-between items-center bg-rose-500/10">
                          <h2 className="text-sm font-black uppercase tracking-[0.4em] italic flex items-center gap-4">
                             <Signal className="w-5 h-5 animate-pulse text-rose-500" />
                             Tactical Signal Relay
                          </h2>
                          <div className="flex items-center gap-3">
                             <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                             <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest italic">Live Monitor Mode</span>
                          </div>
                       </div>
                       <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-8">
                          {activeSignals.map((sig, idx) => (
                             <div key={idx} className="p-6 bg-white/5 border-4 border-white/10 flex items-center justify-between hover:border-white/30 transition-colors">
                                <div>
                                   <div className="text-2xl font-black font-display text-white mb-3 italic tracking-tight">{sig.customer_number}</div>
                                   <div className="flex items-center gap-3">
                                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <span className="text-[10px] font-black uppercase text-white/60 tracking-widest leading-none">{sig.status}</span>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 italic leading-none">DEPLOYED</div>
                                   <div className="text-[8px] font-mono text-white/20 italic uppercase tracking-tighter">NODE_{sig.agent_id.substring(0,8)}</div>
                                </div>
                             </div>
                          ))}
                       </div>
                       <div className="p-4 bg-rose-500/5 text-center border-t-2 border-white/5">
                          <p className="text-[8px] font-black text-white/20 uppercase tracking-[1em] italic">Encryption Protocol: AES-256 Enabled</p>
                       </div>
                    </motion.div>
                 )}

                 <div className="brutal-card !p-0 overflow-hidden flex flex-col bg-white">
                    <div className="p-8 border-b-4 border-ink flex justify-between items-center bg-zinc-50 relative">
                       <div className="absolute top-0 right-10 bottom-0 w-24 bg-brand/5 -skew-x-12" />
                       <h2 className="text-2xl font-black text-ink flex items-center gap-4 uppercase font-display italic relative z-10">
                          <Target className="w-6 h-6 text-ink fill-brand" />
                          High-Intent Signals
                       </h2>
                       <div className="flex items-center gap-4 relative z-10">
                          <span className="text-[9px] font-black text-muted uppercase tracking-[0.3em] italic">Sector Archive</span>
                          <div className="w-12 h-1 bg-ink" />
                       </div>
                    </div>
                    <div className="divide-y-4 divide-ink flex-1 overflow-y-auto max-h-[700px] scrollbar-hide">
                       {stats?.hotLeads?.length > 0 ? (
                          stats.hotLeads.map((lead: any) => (
                            <div key={lead.id} className="p-8 md:p-12 flex items-center justify-between hover:bg-brand transition-all group cursor-pointer border-l-[12px] border-transparent hover:border-ink">
                               <div className="flex items-center gap-6 md:gap-10">
                                  <div className="w-16 h-16 md:w-24 md:h-24 brutal-border bg-ink text-brand flex items-center justify-center shadow-none group-hover:bg-white group-hover:text-ink transition-all">
                                     {lead.type === 'call' ? <PhoneCall className="w-6 h-6 md:w-10 md:h-10" /> : <Mail className="w-6 h-6 md:w-10 md:h-10" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                     <div className="flex flex-col md:flex-row md:items-center gap-4 mb-3">
                                        <span className="font-black text-xl md:text-3xl text-ink font-display uppercase tracking-tighter leading-none italic">{lead.contact}</span>
                                        <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand text-[9px] font-black uppercase tracking-widest italic w-fit shadow-[4px_4px_0px_0px_rgba(212,255,77,0.3)]">
                                           <Zap className="w-3 h-3 fill-current" />
                                           {lead.score}% INTENT
                                        </div>
                                     </div>
                                     <p className="text-xs md:text-sm text-muted font-bold group-hover:text-ink/60 uppercase tracking-[0.2em] italic max-w-xl leading-relaxed">{lead.summary}</p>
                                  </div>
                               </div>
                               <Link to={lead.type === 'call' ? "/logs" : "/inbox"} className="w-16 h-16 md:w-20 md:h-20 brutal-border bg-white flex items-center justify-center hover:bg-zinc-950 hover:text-brand transition-all shadow-none shrink-0 ml-4 group-hover:scale-110">
                                 <ChevronRight className="w-8 h-8 md:w-10 md:h-10" />
                               </Link>
                            </div>
                          ))
                       ) : (
                          <div className="p-40 text-center text-ink/10 flex flex-col items-center justify-center h-full space-y-6">
                            <Radio className="w-24 h-24 opacity-10 animate-pulse" />
                            <p className="font-black uppercase text-xs tracking-[1em] italic">Sector Silence: No Active Intelligence Detected</p>
                          </div>
                       )}
                    </div>
                    <div className="p-4 bg-zinc-50 border-t-2 border-ink text-center">
                       <button className="text-[9px] font-black uppercase tracking-[0.5em] text-ink/40 hover:text-ink transition-colors italic">LOAD ARCHIVED HISTOGRAMS</button>
                    </div>
                 </div>
              </section>

              <div className="space-y-10 lg:space-y-12">
                <section className="brutal-card !p-0 overflow-hidden bg-white hover:shadow-[16px_16px_0px_0px_rgba(10,10,10,1)] transition-all">
                  <div className="p-6 border-b-4 border-ink bg-brand">
                    <h3 className="text-lg font-black text-ink uppercase font-display italic leading-none flex items-center gap-4">
                      <BarChart3 className="w-6 h-6" />
                      Signal Metrics
                    </h3>
                  </div>
                  <div className="p-8 md:p-10 h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                           <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#D4FF4D" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#D4FF4D" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#0A0A0A" strokeOpacity={0.1} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={{ stroke: '#0A0A0A', strokeWidth: 2 }} 
                          tickLine={false} 
                          tick={{ fill: '#0A0A0A', fontWeight: 900, fontSize: 9, textTransform: 'uppercase' }} 
                          dy={10}
                        />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0A0A0A', border: '4px solid #D4FF4D', color: '#D4FF4D', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', fontStyle: 'italic' }}
                          cursor={{ stroke: '#0A0A0A', strokeWidth: 2, strokeDasharray: '4 4' }}
                        />
                        <Area 
                           type="monotone" 
                           dataKey="signals" 
                           stroke="#0A0A0A" 
                           strokeWidth={6} 
                           fillOpacity={1} 
                           fill="url(#colorSignals)" 
                           animationDuration={2000}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="p-6 border-t-4 border-ink bg-zinc-100 flex justify-between items-center">
                     <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mb-1 italic">Tactical Accuracy</div>
                        <div className="text-4xl font-black text-ink font-display italic tracking-tighter">82.4%</div>
                     </div>
                     <div className="w-12 h-12 brutal-border bg-white flex items-center justify-center shadow-none text-brand">
                        <TrendingUp className="w-6 h-6 text-ink" />
                     </div>
                  </div>
                </section>

                <TriggerIntelligenceFeed activity={systemActivity} />

                <FleetTaskBridge />

                <div className="brutal-card bg-zinc-900 border-rose-500 !p-10 space-y-6 relative overflow-hidden group">
                   <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:rotate-12 transition-transform duration-700">
                      <ShieldCheck className="w-48 h-48 text-rose-500" />
                   </div>
                   <h4 className="text-rose-500 font-black uppercase tracking-[0.4em] text-xs italic">System Criticality</h4>
                   <p className="text-white/60 text-xs font-bold leading-relaxed tracking-wider uppercase italic">
                      All carrier nodes are operating within thermal limits. No signal drops detected in the last 14,000 requests. Redundancy protocols active.
                   </p>
                   <div className="flex items-center gap-4">
                      <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden border-2 border-white/5">
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: "94%" }}
                           transition={{ duration: 2, ease: "easeOut" }}
                           className="h-full bg-rose-500"
                         />
                      </div>
                      <span className="text-white font-black italic font-mono text-xs">94%</span>
                   </div>
                </div>
              </div>
            </div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card !bg-zinc-950 text-white p-12 md:p-20 relative overflow-hidden border-4 border-brand">
             <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none -rotate-12 translate-x-12 translate-y-[-2rem] group-hover:rotate-0 transition-transform duration-1000">
                <Target className="w-[30rem] h-[30rem] text-brand" />
             </div>
             
             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-16 relative z-10">
                <div className="space-y-10">
                   <div className="flex items-center gap-6">
                      <div className="w-4 h-16 bg-brand shadow-[4px_4px_0px_0px_rgba(212,255,77,0.3)]" />
                      <h3 className="text-4xl md:text-7xl font-black uppercase font-display italic leading-none tracking-tighter">Mission Integrity</h3>
                   </div>
                   <p className="text-white/40 max-w-2xl text-xs md:text-base font-bold uppercase tracking-[0.3em] leading-relaxed italic">
                      PLATFORM PROTOCOLS REMAIN STABLE ACROSS ALL CARRIER GEOGRAPHIES. NEURAL ENGINES ARE OPERATING AT PEAK INFERENCE CAPACITY.
                   </p>
                   <div className="flex gap-4">
                      <div className="px-4 py-2 border-2 border-brand/40 text-brand text-[10px] font-black uppercase tracking-widest italic">Node: Global-Relay-1</div>
                      <div className="px-4 py-2 border-2 border-rose-500/40 text-rose-500 text-[10px] font-black uppercase tracking-widest italic">Core: Active</div>
                   </div>
                </div>
                
                <div className="flex flex-wrap gap-8 md:gap-12 w-full xl:w-auto">
                   <div className="flex-1 min-w-[220px] md:min-w-[280px] border-4 border-white/10 bg-white/5 p-8 md:p-14 hover:border-brand transition-all group overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-2 h-full bg-brand group-hover:scale-y-100 scale-y-0 origin-top transition-transform" />
                      <div className="text-brand text-[10px] md:text-sm font-black uppercase tracking-[0.5em] mb-10 italic">Dispersion Time</div>
                      <div className="text-6xl md:text-9xl font-black font-display text-white italic leading-none tracking-tighter">{stats?.totalMinutes || 0}<span className="text-xs md:text-3xl text-white/20 font-sans not-italic ml-4 tracking-tighter align-baseline font-black">MIN</span></div>
                   </div>
                   <div className="flex-1 min-w-[220px] md:min-w-[280px] border-4 border-white/10 bg-white/5 p-8 md:p-14 hover:border-brand transition-all group overflow-hidden relative">
                      <div className="absolute top-0 right-0 w-2 h-full bg-rose-500 group-hover:scale-y-100 scale-y-0 origin-top transition-transform" />
                      <div className="text-rose-500 text-[10px] md:text-sm font-black uppercase tracking-[0.5em] mb-10 italic">Target Capture</div>
                      <div className="text-6xl md:text-9xl font-black font-display text-white italic leading-none tracking-tighter">72.4<span className="text-xs md:text-3xl text-white/20 font-sans not-italic ml-4 tracking-tighter align-baseline font-black font-black">%</span></div>
                   </div>
                </div>
             </div>
          </motion.div>

          <motion.section variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card !p-0 overflow-hidden bg-white border-4">
            <div className="p-10 border-b-4 border-ink flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-50 gap-6">
              <h2 className="text-3xl font-black text-ink flex items-center gap-6 uppercase font-display italic">
                 <Mic className="w-10 h-10 text-ink fill-brand" /> Signal History
              </h2>
              <Link to="/logs" className="brutal-btn w-full md:w-auto !py-4 !px-8 text-xs flex items-center justify-center gap-4 group hover:shadow-[6px_6px_0px_0px_rgba(10,10,10,1)]">
                 VIEW ALL ARCHIVES
                 <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y-4 md:divide-y-0 md:divide-x-4 divide-ink">
              {recentLogs.length === 0 ? (
                <div className="p-40 text-center text-muted font-black uppercase text-xs tracking-[1em] col-span-2 italic">Idle signal state detected.</div>
              ) : (
                recentLogs.slice(0, 4).map((call: any, idx: number) => (
                  <Link to="/logs" key={call.id || idx} className="p-10 md:p-14 flex items-center justify-between hover:bg-zinc-50 transition-all group relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand/5 rotate-45 translate-x-12 translate-y-[-2rem] group-hover:opacity-20 transition-opacity" />
                    <div className="flex items-center gap-8 relative z-10">
                      <div className={cn(
                        "w-16 h-16 md:w-20 md:h-20 brutal-border flex items-center justify-center group-hover:scale-105 transition-transform",
                        call.direction === 'inbound' ? 'bg-cyan-50' : 'bg-brand'
                      )}>
                        {call.direction === 'inbound' ? <PhoneCall className="w-8 h-8 md:w-10 md:h-10 text-ink" /> : <PhoneCall className="w-8 h-8 md:w-10 md:h-10 text-ink -rotate-90" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-ink font-display text-2xl md:text-3xl leading-none mb-3 tracking-tighter uppercase italic">{call.customer_number || "SIMULATOR"}</div>
                        <div className="text-[10px] md:text-xs font-bold text-muted uppercase tracking-widest truncate w-48 md:w-64 italic">{call.summary}</div>
                      </div>
                    </div>
                    <div className="text-right relative z-10 shrink-0 ml-4">
                       <div className="text-lg md:text-2xl font-black text-ink font-mono uppercase tracking-tighter italic">{Math.ceil(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</div>
                       <div className="text-[9px] text-muted font-black uppercase tracking-widest mt-2 bg-ink/5 px-2 py-1 italic">{new Date(call.created_at).toLocaleDateString()}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="p-8 bg-zinc-950 text-center flex items-center justify-center gap-4">
               <span className="w-1.5 h-1.5 bg-brand rounded-full animate-ping" />
               <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.8em] italic">End of recent signal buffer</p>
            </div>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}
