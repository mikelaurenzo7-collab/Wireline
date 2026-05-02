import React, { useState, useEffect } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, User, FileText, Play, Pause, Download, Search, Filter, Loader2, MessageCircle, ChevronRight, X, Database, Terminal, Shield, Target, Zap, Activity, Signal, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";

export default function CallLogs() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, inbound, outbound

  const fetchCalls = async (currentOffset: number = 0, append: boolean = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const res = await authFetch(`/api/calls?offset=${currentOffset}&limit=${LIMIT}`);
      const data = await res.json();
      
      if (append) {
         setCalls(prev => [...prev, ...(data.calls || [])]);
      } else {
         setCalls(data.calls || []);
      }
      setHasMore(data.hasMore);
      setOffset(currentOffset + (data.calls?.length || 0));
    } catch (e) {
      console.error("Failed to fetch calls:", e);
    } finally {
      if (!append) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCalls(0, false);
  }, []);

  const loadMore = () => {
     if (!loadingMore && hasMore) {
        fetchCalls(offset, true);
     }
  };

  const filteredCalls = calls.filter(call => {
    const matchesSearch = call.customer_number?.includes(search) || call.summary?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || call.direction === filter;
    return matchesSearch && matchesFilter;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex flex-col space-y-12 md:space-y-20 pb-40 max-w-[1600px] mx-auto w-full p-8 md:p-12 lg:p-16">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <Terminal className="w-3 h-3" /> RELAY_STATUS: SYNCED
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Database className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">TEMPORAL_LOCK: ACTIVE</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            OPERATIONAL<br />ARCHIVE
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Comprehensive intelligence repository of individual carrier signal threads and tactical fleet responses.
          </p>
        </div>
        
        <div className="flex flex-col lg:flex-row items-center gap-6 w-full lg:w-auto">
          <div className="relative w-full lg:w-96 group">
            <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-ink transition-colors" />
            <input 
              type="text" 
              placeholder="SEARCH_SIGNALS..." 
              className="w-full pl-14 pr-6 h-16 bg-white border-4 border-ink font-black text-ink outline-none hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 focus:bg-brand transition-all uppercase tracking-widest text-xs italic"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <div className="relative w-full lg:w-64">
            <select 
              className="w-full h-16 bg-white border-4 border-ink font-black text-ink outline-none hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 focus:bg-brand transition-all uppercase tracking-widest text-xs px-8 italic cursor-pointer appearance-none"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">ALL_SIGNALS</option>
              <option value="inbound">INBOUND_RELAY</option>
              <option value="outbound">OUTBOUND_DISPATCH</option>
            </select>
            <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink pointer-events-none rotate-90" />
          </div>

          <CsvExportButton type="calls" label="Export CSV" />
        </div>
      </header>

      <div className="bg-white brutal-border border-4 !p-0 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-700">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-zinc-950 text-white border-b-8 border-ink">
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic border-r border-white/10">DIRECTIONAL_VECTOR</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic border-r border-white/10">CARRIER_ORIGIN</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic text-center border-r border-white/10">INTENT</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic border-r border-white/10">SIGNAL_PAYLOAD</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic border-r border-white/10">TEMPORAL_STAMP</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.4em] italic text-right">EXAMINE</th>
              </tr>
            </thead>
            <tbody className="divide-y-4 divide-ink">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-40">
                     <div className="flex flex-col items-center gap-6">
                        <Loader2 className="w-16 h-16 animate-spin text-brand" />
                        <span className="text-[10px] font-black uppercase tracking-[0.6em] text-ink italic animate-pulse">EXTRACTING_ARCHIVE_DATA...</span>
                     </div>
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-40 text-muted font-black uppercase text-xs tracking-[1em] italic">ARCHIVE_SILENCE: NO_SIGNALS_RECORDED</td>
                </tr>
              ) : filteredCalls.map(call => (
                <tr 
                  key={call.id} 
                  className={cn("hover:bg-brand/5 cursor-pointer transition-all group", selectedCall?.id === call.id && "bg-brand/10")}
                  onClick={() => setSelectedCall(call)}
                >
                  <td className="px-10 py-8 border-r border-ink/5">
                    <div className={cn(
                      "flex items-center gap-3 font-black text-[9px] uppercase tracking-widest px-4 py-2 brutal-border border-4 shadow-none w-fit leading-none italic",
                      call.direction === "inbound" ? "bg-white text-ink" : "bg-brand text-ink"
                    )}>
                      {call.direction === "inbound" ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                      {call.direction === "inbound" ? "INBOUND" : "OUTBOUND"}
                    </div>
                  </td>
                  <td className="px-10 py-8 border-r border-ink/5">
                    <div className="font-black text-ink text-2xl md:text-3xl font-display uppercase italic tracking-tighter leading-none group-hover:drop-shadow-sm transition-all">{call.customer_number || "SIM_TEST"}</div>
                  </td>
                  <td className="px-10 py-8 text-center border-r border-ink/5">
                    <div className={cn(
                      "inline-flex items-center justify-center w-12 h-12 brutal-border border-4 font-black text-sm italic  group-hover:shadow-none transition-all",
                      (call.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                      (call.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                      "bg-white text-muted"
                    )}>
                      {call.lead_score || 0}
                    </div>
                  </td>
                  <td className="px-10 py-8 max-w-sm border-r border-ink/5">
                    <p className="text-[11px] font-bold text-ink uppercase tracking-tight truncate leading-none mb-3 italic">"{call.summary || 'SIGNAL_DECODING_IN_PROGRESS'}"</p>
                    <div className="flex items-center gap-3">
                       <span className="text-[8px] font-black text-muted uppercase tracking-[0.3em] font-mono opacity-40">#{call.vapi_call_id?.substring(0,8)}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8 border-r border-ink/5">
                    <div className="text-[10px] font-black text-ink uppercase tracking-widest leading-none mb-2 italic">
                      {new Date(call.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[9px] font-bold text-muted uppercase tracking-[0.4em] leading-none">
                      {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="w-12 h-12 brutal-border border-4 bg-white flex items-center justify-center group-hover:bg-zinc-950 group-hover:text-brand transition-all ml-auto group-hover:shadow-none">
                      <ChevronRight className="w-6 h-6" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
           <div className="p-10 border-t-8 border-ink flex justify-center bg-zinc-50 relative overflow-hidden group">
             <div className="absolute inset-0 bg-brand/5 -skew-x-12 translate-x-full group-hover:translate-x-[-150%] transition-transform duration-1000" />
             <button 
                onClick={loadMore} 
                disabled={loadingMore}
                className="brutal-btn !bg-ink !text-brand !py-5 !px-12 flex items-center justify-center gap-6 text-[11px] italic font-black uppercase tracking-[0.3em] hover:shadow-none transition-all relative z-10"
             >
                {loadingMore ? <Loader2 className="w-5 h-5 animate-spin" /> : <Signal className="w-5 h-5 animate-pulse" />}
                {loadingMore ? 'SYNCING_SIGNALS...' : 'LOAD_MORE_ARCHIVES'}
             </button>
           </div>
        )}
      </div>

      <AnimatePresence>
        {selectedCall && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full lg:w-[700px] bg-white border-l-8 border-ink shadow-2xl z-50 flex flex-col"
          >
            <div className="p-10 md:p-14 border-b-8 border-ink flex items-center justify-between bg-brand relative overflow-hidden group">
              <div className="absolute top-0 right-10 bottom-0 w-32 bg-ink/5 -skew-x-12 translate-x-10" />
              <div className="flex items-center gap-8 relative z-10">
                <div className="w-16 h-16 md:w-24 md:h-24 brutal-border border-4 flex items-center justify-center bg-white group-hover:rotate-3 transition-transform">
                  {selectedCall.direction === "inbound" ? <PhoneIncoming className="w-8 h-8 md:w-12 md:h-12 text-ink" /> : <PhoneOutgoing className="w-8 h-8 md:w-12 md:h-12 text-ink" />}
                </div>
                <div>
                  <Link
                    to={`/contact/${encodeURIComponent(selectedCall.customer_number || "unknown")}`}
                    className="group/link inline-flex items-center gap-3 hover:text-brand transition-colors"
                  >
                    <h2 className="text-3xl md:text-5xl font-black font-display text-ink uppercase italic leading-[0.8] tracking-tighter group-hover/link:text-brand transition-colors">{selectedCall.customer_number}</h2>
                    <ExternalLink className="w-5 h-5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                  </Link>
                  <div className="flex items-center gap-4 mt-4">
                     <span className="text-ink/40 text-[9px] font-black uppercase tracking-[0.4em] italic font-mono">TRACE_ID: {selectedCall.vapi_call_id.substring(0,16)}</span>
                     <div className="w-2 h-2 bg-ink rounded-full animate-ping" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 relative z-10 flex-wrap">
                <ClaudeRecipeButton
                  recipe="coach"
                  callId={selectedCall.id}
                  label="Live Coach"
                />
                <ClaudeRecipeButton
                  recipe="qualify"
                  callId={selectedCall.id}
                  label="Qualify · BANT"
                />
                <button
                  onClick={() => setSelectedCall(null)}
                  className="w-12 h-12 rounded-full glass border border-white/10 flex items-center justify-center text-ink/70 hover:text-rose-500 hover:border-rose-500/40 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 md:p-14 space-y-16 scrollbar-hide">
              {/* Record Player */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-black text-ink uppercase tracking-tighter font-display italic flex items-center gap-4">
                     <Activity className="w-6 h-6 text-brand fill-ink" />
                     SIGNAL_RECORD
                   </h3>
                   <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em] italic">Carrier Layer Rec.</span>
                </div>
                {selectedCall.recording_url ? (
                  <div className="bg-zinc-950 brutal-border border-4 !p-10 text-white space-y-8 relative overflow-hidden group">
                    <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
                       <Signal className="w-48 h-48 text-brand" />
                    </div>
                    <div className="flex items-center justify-between gap-6 relative z-10">
                      <div className="flex-1">
                         <div className="text-[10px] font-black uppercase tracking-[0.5em] text-brand mb-4 italic flex items-center gap-3">
                            <div className="w-2 h-2 bg-brand rounded-full animate-pulse" /> DECRYPTED_SIGNAL_BUFFER
                         </div>
                         <audio controls className="w-full h-14 invert brightness-150 grayscale border-2 border-brand/20 p-1">
                           <source src={selectedCall.recording_url} type="audio/mpeg" />
                         </audio>
                      </div>
                      <a href={selectedCall.recording_url} download target="_blank" rel="noreferrer" className="w-20 h-20 brutal-btn !bg-white !text-ink !p-0 flex items-center justify-center transition-all shrink-0">
                         <Download className="w-8 h-8 group-hover:scale-110 transition-transform" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="bg-paper brutal-border border-4 border-dashed p-16 text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-zinc-100 mx-auto mb-6" />
                    <p className="font-black text-muted uppercase text-xs tracking-[0.5em] italic">SIGNAL_RECONSTRUCTION_IN_PROGRESS...</p>
                  </div>
                )}
              </div>

              {/* AI Summary */}
              <div className="space-y-8">
                <header className="flex items-center justify-between border-b-4 border-ink pb-4">
                   <h3 className="text-2xl font-black text-ink uppercase tracking-tighter font-display italic flex items-center gap-4">
                     <FileText className="w-6 h-6 text-brand" />
                     MISSION_SUMMARY
                   </h3>
                   <div className="w-16 h-1 bg-brand" />
                </header>
                <div className="bg-white brutal-border border-4 p-8 md:p-12 text-ink font-black leading-tight text-xl md:text-3xl uppercase tracking-tighter italic font-display">
                  {selectedCall.summary || "PENDING_INFERENCE..."}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-8">
                <div className="brutal-border border-4 bg-zinc-50 p-8 group hover:bg-white transition-all">
                  <div className="text-[10px] text-muted uppercase font-black tracking-[0.4em] mb-4 italic flex items-center gap-3">
                     <Clock className="w-3.5 h-3.5" /> DURATION
                  </div>
                  <div className="text-3xl md:text-5xl font-black text-ink font-display italic leading-none tracking-tighter">{formatDuration(selectedCall.duration_seconds || 0)}</div>
                </div>
                <div className="brutal-border border-4 bg-zinc-50 p-8 group hover:bg-white transition-all">
                  <div className="text-[10px] text-muted uppercase font-black tracking-[0.4em] mb-4 italic flex items-center gap-3">
                     <Zap className="w-3.5 h-3.5" /> OPERATIONAL_BURN
                  </div>
                  <div className="text-3xl md:text-5xl font-black text-rose-500 font-display italic leading-none tracking-tighter">${selectedCall.cost.toFixed(4)}</div>
                </div>
              </div>

              {/* Transcript */}
              <div className="space-y-10">
                <header className="flex items-center justify-between border-b-4 border-ink pb-4">
                   <h3 className="text-2xl font-black text-ink uppercase tracking-tighter font-display italic flex items-center gap-4">
                     <MessageCircle className="w-6 h-6 text-brand fill-ink" />
                     SYNAPSE_LOG
                   </h3>
                   <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-muted uppercase tracking-[0.3em] italic">Full Decryption</span>
                      <Shield className="w-4 h-4 text-emerald-500" />
                   </div>
                </header>
                <div className="bg-paper brutal-border border-4 p-8 md:p-12 space-y-10 max-h-[1000px] overflow-y-auto scrollbar-hide relative">
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                     <Target className="w-48 h-48 text-ink" />
                  </div>
                  {selectedCall.transcript ? (
                    selectedCall.transcript.split('\n').filter((line: string) => line.trim() !== '').map((line: string, i: number) => {
                      const isAI = line.startsWith('AI:') || line.startsWith('Agent:');
                      const isUser = line.startsWith('User:') || line.startsWith('Human:');
                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          key={i} 
                          className={cn(
                            "p-6 brutal-border border-2 shadow-none w-full max-w-[90%]",
                            isAI ? "bg-white border-zinc-200 mr-auto" : 
                            isUser ? "bg-ink border-ink text-white ml-auto italic" : 
                            "bg-brand border-ink w-full text-ink text-center"
                          )}
                        >
                          <div className={cn(
                            "text-[9px] font-black uppercase tracking-[0.4em] block mb-4 italic",
                            isAI ? "text-muted" : isUser ? "text-brand" : "text-ink"
                          )}>
                            {isAI ? 'TACTICAL_UNIT_01' : isUser ? 'CARRIER_SUBJECT' : 'SYSTEM_MARKER'}
                          </div>
                          <p className="text-lg md:text-xl font-bold font-display tracking-tight leading-tight uppercase font-sans">
                            {line.replace(/^(AI|Agent|User|Human|System):\s*/i, '')}
                          </p>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="p-32 text-center text-muted font-black uppercase text-xs tracking-[1em] italic">NO_TRANSCRIPT_DATA_AVAILABLE</div>
                  )}
                </div>
                <div className="p-6 bg-zinc-950 text-white text-center brutal-border border-4">
                   <p className="text-[9px] font-black uppercase tracking-[1em] italic opacity-40">-- END OF DECRYPTED LOG --</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {selectedCall && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-ink/80 backdrop-blur-md z-40 transition-all" 
          onClick={() => setSelectedCall(null)}
        />
      )}
    </div>
  );
}
