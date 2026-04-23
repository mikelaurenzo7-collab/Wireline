import React, { useState, useEffect } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, User, FileText, Play, Pause, Download, Search, Filter, Loader2, MessageCircle, ChevronRight, X } from "lucide-react";
import { cn } from "../lib/utils";

export default function CallLogs() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all, inbound, outbound

  const fetchCalls = async () => {
    try {
      const res = await fetch("/api/calls");
      const data = await res.json();
      setCalls(data.calls || []);
    } catch (e) {
      console.error("Failed to fetch calls:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

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
    <div className="h-full flex flex-col space-y-8 md:space-y-12 pb-24 relative overflow-hidden p-4 md:p-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 border-b-4 border-ink pb-8 md:pb-12">
        <div>
          <div className="flex items-center gap-2 mb-4">
             <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic">History</span>
          </div>
          <h1 className="text-3xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
            Call Logs
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[8px] md:text-xs mt-3 leading-relaxed">A complete record of every call handled by your agents.</p>
        </div>
        
        <div className="flex flex-col lg:flex-row items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full lg:w-80 group">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-ink transition-colors" />
            <input 
              type="text" 
              placeholder="SEARCH SIGNAL..." 
              className="w-full pl-12 pr-6 py-4 bg-white border-4 border-ink font-black text-ink outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:bg-brand transition-colors uppercase tracking-widest text-xs"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <select 
            className="w-full lg:w-auto p-4 bg-white border-4 border-ink font-black text-ink outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:bg-brand transition-colors uppercase tracking-widest text-xs cursor-pointer appearance-none px-8 italic"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">ALL FREQUENCIES</option>
            <option value="inbound">INBOUND ONLY</option>
            <option value="outbound">OUTBOUND ONLY</option>
          </select>
          
          <button onClick={fetchCalls} className="hidden lg:flex w-14 h-14 brutal-border bg-white items-center justify-center text-ink hover:bg-brand transition-all">
            <Clock className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white brutal-border !p-0 overflow-hidden flex flex-col shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 text-white border-b-4 border-ink">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em]">Direction</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em]">Number</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-center">Score</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em]">Summary</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em]">Time</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ink">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-24"><Loader2 className="w-12 h-12 animate-spin text-brand mx-auto" /></td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-24 text-slate-400 font-bold uppercase text-xs italic">Call history is currently empty.</td>
                </tr>
              ) : filteredCalls.map(call => (
                <tr 
                  key={call.id} 
                  className={cn("hover:bg-brand/5 cursor-pointer transition-all group", selectedCall?.id === call.id && "bg-brand/10")}
                  onClick={() => setSelectedCall(call)}
                >
                  <td className="px-8 py-6">
                    <div className={cn(
                      "flex items-center gap-2 font-black text-[9px] uppercase tracking-widest px-3 py-1.5 brutal-border shadow-none w-fit leading-none italic",
                      call.direction === "inbound" ? "bg-cyan-100 text-ink" : "bg-brand text-ink"
                    )}>
                      {call.direction === "inbound" ? <PhoneIncoming className="w-3 h-3" /> : <PhoneOutgoing className="w-3 h-3" />}
                      {call.direction}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="font-black text-ink text-lg font-display uppercase italic leading-none">{call.customer_number || "WEB SIM"}</div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className={cn(
                      "inline-flex items-center justify-center w-12 h-12 brutal-border font-black text-sm italic shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                      (call.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                      (call.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                      "bg-white text-slate-400"
                    )}>
                      {call.lead_score || 0}
                    </div>
                  </td>
                  <td className="px-8 py-6 max-w-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{call.summary}</p>
                  </td>
                  <td className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {new Date(call.created_at).toLocaleDateString()}<br/>
                    {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="w-10 h-10 brutal-border bg-white flex items-center justify-center group-hover:bg-brand transition-all ml-auto">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Detail Panel */}
      <div className={cn(
        "fixed top-0 right-0 h-full w-full md:w-[600px] bg-white border-l-0 md:border-l-4 border-ink shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
        selectedCall ? "translate-x-0" : "translate-x-full"
      )}>
        {selectedCall && (
          <>
            <div className="p-6 md:p-10 border-b-4 border-ink flex items-center justify-between bg-brand">
              <div className="flex items-center gap-6">
                <div className={cn("w-12 h-12 md:w-16 md:h-16 brutal-border flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]", selectedCall.direction === "inbound" ? "bg-white" : "bg-white")}>
                  {selectedCall.direction === "inbound" ? <PhoneIncoming className="w-6 h-6 md:w-8 md:h-8 text-ink" /> : <PhoneOutgoing className="w-6 h-6 md:w-8 md:h-8 text-ink" />}
                </div>
                <div>
                  <h2 className="text-xl md:text-3xl font-black font-display text-ink uppercase italic leading-tight">{selectedCall.customer_number}</h2>
                  <p className="text-ink/60 text-[9px] font-black uppercase tracking-[0.2em] mt-1">ID: {selectedCall.vapi_call_id.split('-')[0]}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCall(null)}
                className="w-10 h-10 md:w-12 md:h-12 brutal-border bg-white flex items-center justify-center text-ink hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 md:space-y-12">
              {/* Record Player */}
              {selectedCall.recording_url ? (
                <div className="bg-zinc-950 brutal-border !p-8 text-white space-y-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand italic">Call Recording</span>
                    <a href={selectedCall.recording_url} download target="_blank" rel="noreferrer" className="brutal-btn !bg-white !text-ink !py-1 !px-4 text-[10px] flex items-center gap-2">
                       <Download className="w-4 h-4" /> EXPORT MP3
                    </a>
                  </div>
                  <audio controls className="w-full h-12 invert brightness-150 grayscale">
                    <source src={selectedCall.recording_url} type="audio/mpeg" />
                  </audio>
                </div>
              ) : (
                <div className="bg-slate-50 brutal-border border-dashed p-10 text-center font-bold text-slate-400 uppercase text-[10px] tracking-widest italic">
                  Signal recording is being decrypted...
                </div>
              )}

              {/* AI Summary */}
              <div className="space-y-4">
                <h3 className="text-lg md:text-xl font-black text-ink uppercase tracking-tight font-display italic flex items-center gap-3">
                  <FileText className="w-5 h-5 md:w-6 md:h-6 text-brand" />
                  Call Summary
                </h3>
                <div className="bg-white brutal-border p-4 md:p-8 text-ink font-bold leading-relaxed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm md:text-lg uppercase tracking-tight">
                  {selectedCall.summary}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="brutal-border bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-2">Duration</div>
                  <div className="text-2xl font-black text-ink font-display italic leading-none">{formatDuration(selectedCall.duration_seconds || 0)}</div>
                </div>
                <div className="brutal-border bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-2">Network Cost</div>
                  <div className="text-2xl font-black text-emerald-600 font-display italic leading-none">${selectedCall.cost.toFixed(4)}</div>
                </div>
              </div>

              {/* Transcript */}
              <div className="space-y-4">
                <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic flex items-center gap-3">
                  <MessageCircle className="w-6 h-6 text-indigo-500" />
                  Raw Signal Transcript
                </h3>
                <div className="bg-zinc-50 brutal-border p-8 text-ink font-bold leading-loose max-h-[500px] overflow-y-auto uppercase tracking-wide text-xs">
                  {selectedCall.transcript || "SIGNAL LOG PURGED OR UNAVAILABLE."}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Backdrop for detail panel */}
      {selectedCall && (
        <div 
          className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40" 
          onClick={() => setSelectedCall(null)}
        />
      )}
    </div>
  );
}
