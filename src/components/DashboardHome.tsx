import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, PhoneCall, ShieldCheck, Zap, Mic, Square, Loader2, PlayCircle, Clock, Calendar, Users, TrendingUp, DollarSign, ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Signal } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { motion } from "motion/react";
import Vapi from "@vapi-ai/web";
import { cn } from "../lib/utils";
import FleetTaskBridge from "./FleetTaskBridge";
import { authFetch } from "../lib/api";

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || "");

export default function DashboardHome() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const [stats, setStats] = useState<any>(null);
  const [activeSignals, setActiveSignals] = useState<any[]>([]);
  const [highPriorityTasks, setHighPriorityTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchActiveSignals();
    fetchHighPriorityTasks();

    const signalPulse = setInterval(() => {
      fetchActiveSignals();
      fetchHighPriorityTasks();
    }, 5000); // 5s pulse for live signals

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
        // Try to find the first voice agent to use for the test relay
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

  const chartData = [
    { name: "Mon", signals: 12, leads: 2 },
    { name: "Tue", signals: 19, leads: 5 },
    { name: "Wed", signals: 32, leads: 11 },
    { name: "Thu", signals: 24, leads: 6 },
    { name: "Fri", signals: 45, leads: 19 },
    { name: "Sat", signals: 28, leads: 7 },
    { name: "Sun", signals: 15, leads: 4 },
  ];

  const recentLogs = stats?.recentLogs || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col min-h-full bg-white space-y-8 md:space-y-12 pb-32 max-w-[1600px] mx-auto w-full p-4 md:p-10 lg:p-14"
    >
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6 border-b-8 border-ink pb-6 md:pb-10"
      >
        <div className="space-y-3">
          {highPriorityTasks.length > 0 && (
            <Link to="/fleet" className="flex items-center gap-3 bg-rose-500 text-white px-4 py-2 brutal-border shadow-none mb-4 animate-bounce hover:bg-rose-600 transition-colors">
              <Zap className="w-5 h-5 fill-white" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">CRITICAL MISSION QUEUE: {highPriorityTasks.length} HIGH PRIORITY TASKS DETECTED</span>
              <ChevronRight className="w-5 h-5 ml-auto" />
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-3">
             <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic animate-pulse font-display">Relay Status: Optimal</span>
             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                <Activity className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">Fleet Latency: 42ms</span>
             </div>
             {activeSignals.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 text-white brutal-border shadow-none">
                   <Signal className="w-3 h-3 text-rose-500 animate-pulse" />
                   <span className="text-[9px] font-black uppercase tracking-tighter italic">{activeSignals.length} Active Carrier Threads</span>
                </div>
             )}
          </div>
          <motion.h1 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none block"
          >
            Command Hub
          </motion.h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] md:text-xs max-w-lg leading-relaxed">Tactical monitoring of carrier signals and autonomous agent throughput.</p>
        </div>
        
         <button 
          onClick={toggleCall}
          disabled={isConnecting}
          className={cn(
             "lg:min-w-[320px] brutal-btn h-14 text-[10px] font-black flex items-center justify-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] uppercase tracking-[0.2em] italic",
             isConnected ? 'bg-red-500 text-white' : 'bg-brand'
          )}
        >
          {isConnecting ? (
             <><Loader2 className="w-4 h-4 animate-spin" /> SYNCHRONIZING...</>
          ) : isConnected ? (
             <><Square className="w-4 h-4 fill-current" /> TERMINATE SIGNAL</>
          ) : (
             <><Mic className="w-4 h-4 text-ink" /> INITIATE TEST RELAY</>
          )}
        </button>
      </motion.header>

      {isLoading && !stats ? (
        <div className="flex-1 flex flex-col items-center justify-center p-32 space-y-8">
           <div className="relative">
              <Loader2 className="w-20 h-20 animate-spin text-brand" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <ShieldCheck className="w-8 h-8 text-ink" />
              </div>
           </div>
           <p className="text-ink font-black uppercase tracking-[0.5em] text-[10px] italic animate-pulse">Syncing with Carrier Nodes...</p>
        </div>
      ) : (
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
          className="space-y-8 md:space-y-14"
        >
          {/* Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-brand transition-colors !p-5 md:!p-7">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-ink transition-colors">Carrier Signals</p>
                 <PhoneCall className="w-4 h-4 text-ink" />
              </div>
              <h3 className="text-3xl md:text-5xl font-black text-ink font-display italic leading-none">{stats?.totalCalls || 0}</h3>
              <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-ink/60 uppercase tracking-[0.2em]">Live Dispatch Total</p>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card bg-zinc-950 text-white border-brand !p-5 md:!p-7 shadow-[6px_6px_0px_0px_#FACC15]">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Routing Precision</p>
                 <TrendingUp className="w-4 h-4 text-brand" />
              </div>
              <h3 className="text-3xl md:text-5xl font-black text-brand font-display italic leading-none">{stats?.conversionRate || 0}%</h3>
              <p className="text-[8px] font-bold text-slate-500 mt-3 uppercase tracking-[0.2em] leading-none">Intent Fulfillment</p>
            </motion.div>
            
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-ink hover:text-white transition-colors !p-5 md:!p-7">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-white/40">Active Nodes</p>
                 <Bot className="w-4 h-4 text-ink group-hover:text-brand" />
              </div>
              <h3 className="text-3xl md:text-5xl font-black text-ink group-hover:text-white font-display leading-none italic">{stats?.totalLeads || 0}</h3>
              <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-white/40 uppercase tracking-[0.2em]">Operational Fleet</p>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card group hover:bg-brand transition-colors !p-5 md:!p-7">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-ink">Operational Burn</p>
                 <DollarSign className="w-4 h-4 text-ink" />
              </div>
              <h3 className="text-3xl md:text-5xl font-black text-ink font-display leading-none italic">${stats?.totalCost || "0.00"}</h3>
              <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-ink/60 uppercase tracking-[0.2em]">Carrier Expenditure</p>
            </motion.div>
          </div>

          <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
              <section className="lg:col-span-2 space-y-8">
                 {/* Live Monitor */}
                 {activeSignals.length > 0 && (
                    <div className="brutal-card !p-0 overflow-hidden bg-zinc-950 text-white border-rose-500 shadow-[8px_8px_0px_0px_rgba(244,63,94,1)] animate-in slide-in-from-top-4 duration-500">
                       <div className="p-4 border-b-2 border-white/10 flex justify-between items-center bg-rose-500/10">
                          <h2 className="text-xs font-black uppercase tracking-[0.3em] italic flex items-center gap-3">
                             <Signal className="w-4 h-4 animate-pulse text-rose-500" />
                             Tactical Signal Relay
                          </h2>
                          <span className="text-[9px] font-bold text-white/40 uppercase">Encrypted Connection</span>
                       </div>
                       <div className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                          {activeSignals.map((sig, idx) => (
                             <div key={idx} className="p-5 bg-white/5 brutal-border border-white/10 flex items-center justify-between">
                                <div>
                                   <div className="text-xl font-black font-display text-white mb-2 italic">{sig.customer_number}</div>
                                   <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                      <span className="text-[9px] font-black uppercase text-white/40">{sig.status}</span>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <div className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-1 italic">Agent Deployment</div>
                                   <div className="text-[7px] font-mono text-white/40 italic uppercase">UID_{sig.agent_id.substring(0,8)}</div>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                 )}

                 <div className="brutal-card !p-0 overflow-hidden flex flex-col bg-white">
                    <div className="p-5 border-b-4 border-ink flex justify-between items-center bg-zinc-50">
                       <h2 className="text-lg font-black text-ink flex items-center gap-3 uppercase font-display italic">
                          <Zap className="w-5 h-5 text-ink fill-brand" />
                          Priority Intelligence
                       </h2>
                       <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-brand animate-ping rounded-full" />
                          <div className="px-2 py-1 bg-ink text-brand text-[8px] font-black uppercase tracking-widest leading-none">Archives</div>
                       </div>
                    </div>
                    <div className="divide-y-2 divide-ink flex-1 overflow-y-auto max-h-[550px] scrollbar-hide">
                       {stats?.hotLeads?.length > 0 ? (
                          stats.hotLeads.map((lead: any) => (
                            <div key={lead.id} className="p-5 md:p-8 flex items-center justify-between hover:bg-brand transition-colors group">
                               <div className="flex items-center gap-4 md:gap-8">
                                  <div className="w-12 h-12 md:w-16 md:h-16 brutal-border bg-ink text-brand flex items-center justify-center shadow-none group-hover:bg-white group-hover:text-ink transition-colors">
                                     {lead.type === 'call' ? <PhoneCall className="w-5 h-5 md:w-8 md:h-8" /> : <Mail className="w-5 h-5 md:w-8 md:h-8" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                     <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                                        <span className="font-black text-sm md:text-2xl text-ink font-display uppercase tracking-tight leading-none italic">{lead.contact}</span>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand text-[8px] font-black uppercase tracking-tighter italic w-fit">
                                           <Activity className="w-2.5 h-2.5" />
                                           {lead.score}% INTENT
                                        </div>
                                     </div>
                                     <p className="text-[10px] md:text-xs text-slate-500 font-bold group-hover:text-ink/60 uppercase tracking-widest italic">{lead.summary}</p>
                                  </div>
                               </div>
                               <Link to={lead.type === 'call' ? "/logs" : "/inbox"} className="w-12 h-12 md:w-14 md:h-14 brutal-border bg-white flex items-center justify-center hover:bg-zinc-950 hover:text-brand transition-all shadow-none">
                                 <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
                               </Link>
                            </div>
                          ))
                       ) : (
                          <div className="p-32 text-center text-ink/10 flex flex-col items-center justify-center h-full">
                            <BarChart3 className="w-20 h-20 mb-6 opacity-20" />
                            <p className="font-black uppercase text-xs tracking-[0.4em] italic">Archive Idle: No Signals Detected</p>
                          </div>
                       )}
                    </div>
                 </div>
              </section>

              <div className="space-y-6">
                <section className="brutal-card !p-0 overflow-hidden bg-white">
                  <div className="p-5 border-b-4 border-ink bg-brand">
                    <h3 className="text-base font-black text-ink uppercase font-display italic leading-none flex items-center gap-3">
                      <TrendingUp className="w-5 h-5" />
                      Signal Metrics
                    </h3>
                  </div>
                  <div className="p-6 md:p-8 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                           <linearGradient id="colorSignals" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#facd15" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#facd15" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#000', fontWeight: 900, fontSize: 8, textTransform: 'uppercase' }} 
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#000', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                          cursor={{ stroke: '#000', strokeWidth: 2 }}
                        />
                        <Area 
                           type="monotone" 
                           dataKey="signals" 
                           stroke="#000" 
                           strokeWidth={4} 
                           fillOpacity={1} 
                           fill="url(#colorSignals)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="p-5 border-t-2 border-ink/5 bg-slate-50 flex justify-between">
                     <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tactical Accuracy</div>
                     <div className="text-sm font-black text-ink italic font-display">82.4%</div>
                  </div>
                </section>

                <FleetTaskBridge />
              </div>
          </motion.div>

          <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card !bg-ink text-white p-8 md:p-14 relative overflow-hidden shadow-[12px_12px_0px_0px_#FACC15]">
             <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none -rotate-45 translate-x-12">
                <ShieldCheck className="w-96 h-96 text-brand" />
             </div>
             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-12 relative z-10">
                <div>
                   <div className="flex items-center gap-3 mb-6">
                      <span className="w-3 h-3 bg-brand" />
                      <h3 className="text-2xl md:text-5xl font-black uppercase font-display italic leading-none">Platform Integrity</h3>
                   </div>
                   <p className="text-slate-400 max-w-2xl text-[9px] md:text-sm font-bold uppercase tracking-[0.2em] leading-relaxed italic">
                      Wireline fleet protocols remain at 99.9% uptime. Carrier routes are optimized for maximum fulfillment across voice and email channels.
                   </p>
                </div>
                <div className="flex flex-wrap gap-5 md:gap-8 w-full xl:w-auto">
                   <div className="flex-1 min-w-[160px] md:min-w-[200px] border-4 border-white/20 bg-white/5 p-6 md:p-10 hover:border-brand transition-colors">
                      <div className="text-brand text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] mb-6 italic">Relay Time</div>
                      <div className="text-4xl md:text-7xl font-black font-display text-white italic leading-none">{stats?.totalMinutes || 0}<span className="text-xs md:text-2xl text-slate-500 font-sans not-italic ml-3 tracking-tighter">MIN</span></div>
                   </div>
                   <div className="flex-1 min-w-[160px] md:min-w-[200px] border-4 border-white/20 bg-white/5 p-6 md:p-10 hover:border-brand transition-colors">
                      <div className="text-brand text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] mb-6 italic">Target Fill</div>
                      <div className="text-4xl md:text-7xl font-black font-display text-white italic leading-none">72.4<span className="text-xs md:text-2xl text-slate-500 font-sans not-italic ml-3 tracking-tighter">%</span></div>
                   </div>
                </div>
             </div>
          </motion.div>

          <motion.section variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="brutal-card !p-0 overflow-hidden bg-white">
            <div className="p-6 border-b-2 border-ink flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-ink flex items-center gap-3 uppercase font-display italic">
                 <Mic className="w-6 h-6 text-indigo-600" /> Recent Activity
              </h2>
              <Link to="/logs" className="brutal-btn !py-2 !px-4 text-[10px] flex items-center gap-2 group">
                 Call History
                 <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y-2 md:divide-y-0 md:divide-x-2 divide-ink">
              {recentLogs.length === 0 ? (
                <div className="p-24 text-center text-slate-400 font-bold uppercase tracking-widest text-xs col-span-2 italic">No activity detected.</div>
              ) : (
                recentLogs.slice(0, 4).map((call: any, idx: number) => (
                  <Link to="/logs" key={call.id || idx} className="p-8 flex items-center justify-between hover:bg-slate-50 transition-all border-b-2 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 border-ink">
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "w-12 h-12 brutal-border flex items-center justify-center",
                        call.direction === 'inbound' ? 'bg-cyan-100' : 'bg-brand'
                      )}>
                        {call.direction === 'inbound' ? <PhoneCall className="w-6 h-6 text-ink" /> : <PhoneCall className="w-6 h-6 text-ink -rotate-90" />}
                      </div>
                      <div>
                        <div className="font-black text-ink font-display text-xl leading-none mb-1">{call.customer_number || "WEB SIMULATOR"}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate w-48">{call.summary}</div>
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xs font-black text-ink font-mono uppercase">{Math.ceil(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</div>
                       <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">{new Date(call.created_at).toLocaleDateString()}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </motion.div>
  );
}
