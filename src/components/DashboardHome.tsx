import Vapi from "@vapi-ai/web";
import {
  Activity,
  PhoneCall,
  ShieldCheck,
  Zap,
  Mic,
  Square,
  Loader2,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  BarChart3,
  Mail,
  ChevronRight,
  Bot,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

import FleetTaskBridge from "./FleetTaskBridge";
import { LoadingSpinner } from "./LoadingSpinner";
import { BrutalButton, BrutalCard } from "./ui";

const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY || "");

type RecommendedAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  priority: "critical" | "high" | "medium";
};

type NextAppointment = {
  id: string;
  customer_name?: string;
  service_type?: string;
  date?: string;
  time?: string;
  status?: string;
};

export default function DashboardHome() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();

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
      vapi.removeAllListeners("call-start");
      vapi.removeAllListeners("call-end");
    };
  }, []);

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
    { name: "Inbound", count: stats?.inboundCount || 0 },
    { name: "Outbound", count: stats?.outboundCount || 0 },
    { name: "High Intent", count: stats?.hotLeads?.length || 0 },
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
          <div className="flex items-center gap-3">
             <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic animate-pulse font-display">Relay Status: Optimal</span>
             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                <Activity className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">Fleet Latency: 42ms</span>
             </div>
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
        
         <BrutalButton
          onClick={toggleCall}
          disabled={isConnecting}
          variant={isConnected ? "danger" : "brand"}
          size="lg"
          shadow="md"
          className="lg:min-w-[320px] tracking-[0.2em]"
          leadingIcon={
            isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isConnected ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Mic className="w-4 h-4 text-ink" />
            )
          }
        >
          {isConnecting ? "SYNCHRONIZING..." : isConnected ? "TERMINATE SIGNAL" : "INITIATE TEST RELAY"}
        </BrutalButton>
      </motion.header>

      {isLoading && !stats ? (
        <LoadingSpinner message="Syncing with Carrier Nodes..." />
      ) : (
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
          className="space-y-8 md:space-y-14"
        >
          <motion.section
            variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
            className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-10"
          >
            <BrutalCard
              flush
              surface="ink"
              className="xl:col-span-2 overflow-hidden shadow-[10px_10px_0px_0px_#FACC15]"
            >
              <div className="p-6 md:p-8 border-b-4 border-brand flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="w-4 h-4 text-brand" />
                    <span className="text-[9px] font-black text-brand uppercase tracking-[0.3em] italic">
                      Mission Control Briefing
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-4xl font-black uppercase font-display italic leading-none">
                    Next Best Actions
                  </h2>
                </div>
                <div className="brutal-border border-brand bg-white text-ink px-5 py-4 shadow-none">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Fleet Health
                  </p>
                  <div className="text-4xl font-black font-display italic leading-none">
                    {stats?.fleetHealth || 0}
                    <span className="text-xs text-slate-400 font-sans not-italic ml-1">/100</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y-2 md:divide-y-0 md:divide-x-2 divide-white/10">
                <div className="p-6 md:p-8 space-y-4">
                  {(stats?.recommendedActions || []).length > 0 ? (
                    stats.recommendedActions.map((action: RecommendedAction) => (
                      <Link
                        key={action.id}
                        to={action.href}
                        className="block bg-white/5 border-2 border-white/10 p-4 hover:bg-brand hover:text-ink hover:border-brand transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle
                                className={cn(
                                  "w-4 h-4",
                                  action.priority === "critical"
                                    ? "text-rose-400 group-hover:text-ink"
                                    : "text-brand group-hover:text-ink"
                                )}
                              />
                              <p className="text-[10px] font-black uppercase tracking-widest">
                                {action.label}
                              </p>
                            </div>
                            <p className="text-[9px] font-bold uppercase tracking-widest leading-relaxed text-white/50 group-hover:text-ink/60">
                              {action.detail}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border-2 border-white/10 bg-white/5 p-8">
                      <CheckCircle2 className="w-12 h-12 text-brand mb-4" />
                      <p className="text-xs font-black uppercase tracking-[0.3em] italic">
                        No urgent actions
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-3 leading-loose">
                        Your active queue is clear and the fleet is ready for new traffic.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-6 md:p-8">
                  <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.3em] mb-5 italic">
                    Near-Term Commitments
                  </h3>
                  <div className="space-y-3">
                    {(stats?.nextAppointments || []).length > 0 ? (
                      stats.nextAppointments.map((appointment: NextAppointment) => (
                        <Link
                          key={appointment.id}
                          to="/appointments"
                          className="block bg-zinc-950 border-2 border-white/10 p-4 hover:border-brand transition-colors"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-black text-white uppercase font-display italic truncate">
                                {appointment.customer_name || "Unknown Contact"}
                              </p>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1 truncate">
                                {appointment.service_type || "Service"} • {appointment.status || "Scheduled"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-black text-brand uppercase">{appointment.date}</p>
                              <p className="text-[9px] font-bold text-white/40 uppercase">{appointment.time}</p>
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <Link
                        to="/appointments"
                        className="min-h-[220px] flex flex-col items-center justify-center text-center border-2 border-white/10 bg-white/5 p-8 hover:border-brand transition-colors"
                      >
                        <CheckCircle2 className="w-12 h-12 text-brand mb-4" />
                        <p className="text-xs font-black uppercase tracking-[0.3em] italic">
                          No commitments scheduled
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-3 leading-loose">
                          Confirmed appointments will appear here for rapid dispatch review.
                        </p>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </BrutalCard>

            <BrutalCard flush className="overflow-hidden">
              <div className="p-5 border-b-4 border-ink bg-brand">
                <h3 className="text-base font-black text-ink uppercase font-display italic leading-none">
                  Live Workload
                </h3>
              </div>
              <div className="divide-y-2 divide-ink">
                {[
                  ["Pending handoffs", stats?.pendingTasks || 0, "/"],
                  ["Queued outreach", stats?.queuedLeads || 0, "/outbound"],
                  ["Open inbox threads", stats?.openThreads || 0, "/inbox"],
                  ["7-day signals", stats?.recentSevenDaySignals || 0, "/logs"],
                ].map(([label, value, href]) => (
                  <Link
                    key={label}
                    to={href as string}
                    className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {label}
                    </span>
                    <span className="text-3xl font-black font-display italic text-ink">{value}</span>
                  </Link>
                ))}
              </div>
            </BrutalCard>
          </motion.section>

          {/* Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <BrutalCard flush className="group hover:bg-brand transition-colors p-5 md:p-7">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-ink transition-colors">Carrier Signals</p>
                  <PhoneCall className="w-4 h-4 text-ink" />
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-ink font-display italic leading-none">{stats?.totalCalls || 0}</h3>
                <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-ink/60 uppercase tracking-[0.2em]">Live Dispatch Total</p>
              </BrutalCard>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <BrutalCard
                flush
                className="bg-zinc-950 text-white border-brand p-5 md:p-7 shadow-[6px_6px_0px_0px_#FACC15]"
              >
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Routing Precision</p>
                  <TrendingUp className="w-4 h-4 text-brand" />
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-brand font-display italic leading-none">{stats?.conversionRate || 0}%</h3>
                <p className="text-[8px] font-bold text-slate-500 mt-3 uppercase tracking-[0.2em] leading-none">Intent Fulfillment</p>
              </BrutalCard>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <BrutalCard flush className="group hover:bg-ink hover:text-white transition-colors p-5 md:p-7">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-white/40">Active Nodes</p>
                  <Bot className="w-4 h-4 text-ink group-hover:text-brand" />
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-ink group-hover:text-white font-display leading-none italic">{stats?.activeAgents || 0}</h3>
                <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-white/40 uppercase tracking-[0.2em]">Operational Fleet</p>
              </BrutalCard>
            </motion.div>

            <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
              <BrutalCard flush className="group hover:bg-brand transition-colors p-5 md:p-7">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-ink">Operational Burn</p>
                  <DollarSign className="w-4 h-4 text-ink" />
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-ink font-display leading-none italic">${stats?.totalCost || "0.00"}</h3>
                <p className="text-[8px] font-bold text-slate-500 mt-3 group-hover:text-ink/60 uppercase tracking-[0.2em]">Carrier Expenditure</p>
              </BrutalCard>
            </motion.div>
          </div>

          <motion.div variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }} className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
              <section className="lg:col-span-2 brutal-card !p-0 overflow-hidden flex flex-col bg-white">
                <div className="p-5 border-b-4 border-ink flex justify-between items-center bg-zinc-50">
                   <h2 className="text-lg font-black text-ink flex items-center gap-3 uppercase font-display italic">
                      <Zap className="w-5 h-5 text-ink fill-brand" />
                      Priority Intelligence
                   </h2>
                   <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-brand animate-ping rounded-full" />
                      <div className="px-2 py-1 bg-ink text-brand text-[8px] font-black uppercase tracking-widest leading-none">Live Monitor</div>
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
              </section>

              <div className="space-y-6">
                <section className="brutal-card !p-0 overflow-hidden bg-white">
                  <div className="p-5 border-b-4 border-ink bg-brand">
                    <h3 className="text-base font-black text-ink uppercase font-display italic leading-none flex items-center gap-3">
                      <TrendingUp className="w-5 h-5" />
                      Signal Metrics
                    </h3>
                  </div>
                  <div className="p-6 md:p-8 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#000', fontWeight: 900, fontSize: 8, textTransform: 'uppercase' }} 
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-ink text-brand p-3 brutal-border shadow-none uppercase font-black text-[10px]">
                                  {payload[0].value} Signals
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill="#000" />
                          ))}
                        </Bar>
                      </BarChart>
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
              <Link
                to="/logs"
                className="brutal-btn !py-2 !px-4 text-[10px] flex items-center gap-2 group"
              >
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
