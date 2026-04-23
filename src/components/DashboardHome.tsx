import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PhoneCall, ShieldCheck, Zap, Mic, Square, Loader2, PlayCircle, Clock, Calendar, Users, TrendingUp, DollarSign, ArrowUpRight, BarChart3, Mail, ChevronRight, Bot, Sparkles, Activity as ActivityIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Vapi from "@vapi-ai/web";
import { cn } from "../lib/utils";
import FleetTaskBridge from "./FleetTaskBridge";
import NeuralVisualizer from "./NeuralVisualizer";

const vapi = new Vapi("604f664f-283f-4024-b950-4a4414dc69d5");

export default function DashboardHome() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTranscript, setActiveTranscript] = useState<string>("");

  useEffect(() => {
    fetchStats();

    vapi.on("call-start", () => {
      setIsConnecting(false);
      setIsConnected(true);
      setActiveTranscript("Waiting for signal...");
    });

    vapi.on("call-end", () => {
      setIsConnecting(false);
      setIsConnected(false);
      setActiveTranscript("");
      setTimeout(() => fetchStats(), 3000);
    });

    vapi.on("speech-start", () => {
      // Logic for when agent or user starts speaking if needed
    });

    vapi.on("message", (message) => {
       if (message.type === "transcript") {
          setActiveTranscript(message.transcript);
       }
    });

    return () => {
      vapi.removeAllListeners("call-start");
      vapi.removeAllListeners("call-end");
    };
  }, []);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats");
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
        const res = await fetch("/api/vapi-webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: { type: "assistant-request" }, agentId: "default-agent" }) // Falls back to first agent if default-agent doesn't exist
        });
        const data = await res.json();
        await vapi.start(data.assistant);
      } catch (e) {
        console.error("Failed to start call", e);
        setIsConnecting(false);
      }
    }
  };

  const chartData = [
    { name: "Inbound Calls", count: stats?.inboundCount || 0, color: "#3b82f6" },
    { name: "Outbound Dials", count: stats?.outboundCount || 0, color: "#10b981" }
  ];

  const recentLogs = stats?.recentLogs || [];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-12 bg-[#FBFBFB] space-y-8 md:space-y-12 pb-32 relative">
      <NeuralVisualizer />
      <header className="flex flex-col xl:flex-row xl:justify-between xl:items-end gap-8 border-b-4 border-ink pb-8 md:pb-12">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <span className="bg-brand text-ink text-[10px] md:text-[10px] font-black px-2 py-0.5 uppercase tracking-[0.2em] brutal-border shadow-none">Live Status</span>
             <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational</span>
          </div>
          <h1 className="text-3xl md:text-6xl font-black text-ink uppercase tracking-tight font-display italic leading-[0.9]">Operational Overview</h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[8px] md:text-xs max-w-2xl leading-relaxed">View real-time performance and insights for your automated agent fleet.</p>
        </div>
        
        {isConnected && activeTranscript && (
          <div className="flex-1 brutal-card !p-4 bg-ink text-brand border-brand animate-pulse overflow-hidden h-16 flex items-center gap-4">
             <ActivityIcon className="w-5 h-5 shrink-0" />
             <div className="text-[10px] font-black uppercase tracking-widest truncate">
               <span className="text-white opacity-40 mr-2">LIVE_TRANSCRIPT:</span>
               {activeTranscript}
             </div>
          </div>
        )}

        <button 
          onClick={toggleCall}
          disabled={isConnecting}
          className={cn(
             "md:min-w-[320px] brutal-btn h-16 text-sm flex items-center justify-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none",
             isConnected ? 'bg-red-500 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]' : 'bg-brand'
          )}
        >
          {isConnecting ? (
             <><Loader2 className="w-5 h-5 animate-spin" /> ESTABLISHING LINK...</>
          ) : isConnected ? (
             <><Square className="w-5 h-5 fill-current" /> DISCONNECT AGENT CALL</>
          ) : (
             <><Mic className="w-5 h-5 text-ink" /> INITIATE BROWSER TRAINING</>
          )}
        </button>
      </header>

      {isLoading && !stats ? (
        <div className="flex justify-center py-24 text-brand"><Loader2 className="w-16 h-16 animate-spin" /></div>
      ) : (
        <>
          {/* Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="brutal-card group hover:bg-brand transition-colors !p-4 md:!p-8">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-ink transition-colors">Total Volume</p>
                 <PhoneCall className="w-5 h-5 text-ink" />
              </div>
              <h3 className="text-2xl md:text-5xl font-black text-ink font-display">{stats?.totalCalls || 0}</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-500 mt-2 group-hover:text-ink/60 uppercase">Calls & Messages</p>
            </div>

            <div className="brutal-card bg-zinc-950 text-white border-brand !p-4 md:!p-8">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Conversion Rate</p>
                 <TrendingUp className="w-5 h-5 text-brand" />
              </div>
              <h3 className="text-2xl md:text-5xl font-black text-brand font-display italic">{stats?.conversionRate || 0}%</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-500 mt-2 uppercase">Success Rate</p>
            </div>
            
            <div className="brutal-card group hover:bg-pink-400 transition-colors !p-4 md:!p-8">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-ink">New Leads</p>
                 <Users className="w-5 h-5 text-ink" />
              </div>
              <h3 className="text-2xl md:text-5xl font-black text-ink font-display">{stats?.totalLeads || 0}</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-500 mt-2 group-hover:text-ink/60 uppercase">Identified Contacts</p>
            </div>

            <div className="brutal-card group hover:bg-cyan-400 transition-colors !p-4 md:!p-8">
              <div className="flex justify-between items-start mb-4">
                 <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-ink">Total Spend</p>
                 <DollarSign className="w-5 h-5 text-ink" />
              </div>
              <h3 className="text-2xl md:text-5xl font-black text-ink font-display">${stats?.totalCost || "0.00"}</h3>
              <p className="text-[8px] md:text-[10px] font-bold text-slate-500 mt-2 group-hover:text-ink/60 uppercase">Operational Cost</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
             <section className="brutal-card !p-0 overflow-hidden flex flex-col bg-white">
                <div className="p-6 border-b-2 border-ink flex justify-between items-center bg-brand shadow-[inset_0px_-4px_0px_rgba(0,0,0,0.1)]">
                   <h2 className="text-xl font-black text-ink flex items-center gap-3 uppercase font-display italic">
                      <Zap className="w-6 h-6 text-ink fill-ink" />
                      Intent Calibration (Hot Leads)
                   </h2>
                   <div className="px-3 py-1 bg-ink text-brand text-[10px] font-black uppercase tracking-widest leading-none">AI Scored</div>
                </div>
                <div className="divide-y-2 divide-ink flex-1 overflow-y-auto min-h-[400px]">
                   {stats?.hotLeads?.length > 0 ? (
                      stats.hotLeads.map((lead: any) => (
                        <div key={lead.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                           <div className="flex items-center gap-3 md:gap-5">
                              <div className={cn(
                                "w-10 h-10 md:w-14 md:h-14 border-2 border-ink flex items-center justify-center text-ink font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                                lead.type === 'call' ? "bg-white" : "bg-brand"
                              )}>
                                 {lead.type === 'call' ? <PhoneCall className="w-4 h-4 md:w-6 md:h-6" /> : <Mail className="w-4 h-4 md:w-6 md:h-6" />}
                              </div>
                              <div className="min-w-0">
                                 <div className="flex items-center gap-2 md:gap-3 mb-1">
                                    <span className="font-black text-sm md:text-lg text-ink font-display uppercase tracking-tight leading-none">{lead.contact}</span>
                                    <span className={cn(
                                      "px-2 py-0.5 text-[8px] md:text-[10px] font-black uppercase tracking-tighter shadow-none brutal-border",
                                      lead.score >= 90 ? "bg-rose-500 text-white" : "bg-ink text-brand"
                                    )}>{lead.score}% INTENT</span>
                                 </div>
                                 <div className="flex flex-col gap-1">
                                    <p className="text-[9px] md:text-xs text-slate-500 font-bold truncate max-w-[150px] md:max-w-[280px] uppercase tracking-wide italic">{lead.summary}</p>
                                    <div className="flex items-center gap-2 text-[8px] font-black text-brand bg-ink w-max px-1.5 py-0.5 brutal-border shadow-none">
                                       <Sparkles className="w-2.5 h-2.5" />
                                       NEXT ACTION: {lead.score >= 85 ? "URGENT FOLLOW-UP" : "MONITOR SIGNAL"}
                                    </div>
                                 </div>
                              </div>
                           </div>
                           <Link to={lead.type === 'call' ? "/logs" : "/inbox"} className="w-10 h-10 md:w-12 md:h-12 brutal-border bg-white flex items-center justify-center hover:bg-brand transition-all">
                             <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                           </Link>
                        </div>
                      ))
                   ) : (
                      <div className="p-24 text-center text-ink/20 flex flex-col items-center justify-center h-full">
                        <BarChart3 className="w-16 h-16 mb-4" />
                        <p className="font-black uppercase text-sm tracking-[0.2em]">Zero Leads Detected</p>
                      </div>
                   )}
                </div>
             </section>

             <FleetTaskBridge />
          </div>

          <div className="brutal-card !bg-ink text-white p-6 md:p-12 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none -rotate-12 translate-x-12">
                <Zap className="w-96 h-96 text-brand" />
             </div>
             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-10 relative z-10">
                <div>
                   <h3 className="text-xl md:text-4xl font-black mb-4 flex items-center gap-4 uppercase font-display italic leading-none">
                     <ShieldCheck className="w-8 h-8 md:w-10 md:h-10 text-brand" />
                     Service Summary
                   </h3>
                   <p className="text-slate-400 max-w-xl text-[8px] md:text-sm font-bold uppercase tracking-widest leading-loose">
                      Your automated fleet is running on the latest AI models. All interactions are synchronized for maximum efficiency.
                   </p>
                </div>
                <div className="flex flex-wrap gap-4 md:gap-6 w-full xl:w-auto">
                   <div className="flex-1 min-w-[140px] md:min-w-[180px] border-2 border-brand bg-white/5 p-4 md:p-8 shadow-[4px_4px_0px_0px_#FACC15] md:shadow-[6px_6px_0px_0px_#FACC15]">
                      <div className="text-brand text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-4">Fleet Signal Time</div>
                      <div className="text-3xl md:text-6xl font-black font-display text-white italic">{stats?.totalMinutes || 0}<span className="text-xs md:text-xl text-slate-500 font-sans not-italic ml-2 tracking-tighter">MIN</span></div>
                   </div>
                   <div className="flex-1 min-w-[140px] md:min-w-[180px] border-2 border-brand bg-white/5 p-4 md:p-8 shadow-[4px_4px_0px_0px_#FACC15] md:shadow-[6px_6px_0px_0px_#FACC15]">
                      <div className="text-brand text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-4">Avg Precision</div>
                      <div className="text-3xl md:text-6xl font-black font-display text-white italic">72.4<span className="text-xs md:text-xl text-slate-500 font-sans not-italic ml-2 tracking-tighter">%</span></div>
                   </div>
                </div>
             </div>
          </div>

          <section className="brutal-card !p-0 overflow-hidden bg-white">
            <div className="p-6 border-b-2 border-ink flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-ink flex items-center gap-3 uppercase font-display italic">
                 <Mic className="w-6 h-6 text-indigo-600" /> Recent Activity
              </h2>
              <Link to="/logs" className="brutal-btn !py-2 !px-4 text-[10px] flex items-center gap-2 group">
                 Open Archives
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
          </section>
        </>
      )}
    </div>
  );

}
