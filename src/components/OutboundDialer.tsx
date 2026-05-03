import React, { useState, useEffect, useRef } from "react";
import { PhoneOutgoing, Loader2, PlayCircle, Clock, Plus, Phone, UploadCloud, Users, Bot, Radar, Activity, Zap, Terminal, Shield, Target, FileSpreadsheet, ChevronRight, Share2, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { Link } from "react-router-dom";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";

export default function OutboundDialer() {
  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  
  // UI States
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dial form states
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [context, setContext] = useState("");
  
  const [isDialing, setIsDialing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dialError, setDialError] = useState("");
  const [uploadStats, setUploadStats] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const agentsRes = await authFetch("/api/agents");
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents || []);
      if (agentsData.agents?.length > 0) setSelectedAgentId(agentsData.agents[0].id);

      const leadsRes = await authFetch("/api/outbound");
      const leadsData = await leadsRes.json();
      setLeads(leadsData.leads || []);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const dispatchCall = async () => {
    if (!selectedAgentId || !customerNumber) return;
    setIsDialing(true);
    setDialError("");
    try {
      const res = await authFetch("/api/outbound/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId, customerName, customerNumber, context })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setCustomerName("");
      setCustomerNumber("");
      setContext("");
      setTimeout(() => fetchData(), 2000); 
    } catch(err: any) {
      setDialError(err.message);
    } finally {
      setIsDialing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (!file) return;

     setIsUploading(true);
     setUploadStats("");
     setDialError("");

     Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
           const parsedLeads = results.data.map((row: any) => ({
              agent_id: selectedAgentId,
              customer_name: row.customer_name || row.Name || row.name || "",
              customer_number: row.customer_number || row.Phone || row.phone || "",
              context: row.context || row.Context || row.Notes || "",
              status: "Queued"
           })).filter(l => l.customer_number);

           if (parsedLeads.length === 0) {
              setDialError("No valid phone numbers found in CSV. Ensure header is 'customer_number' or 'phone'.");
              setIsUploading(false);
              return;
           }

           try {
              const res = await authFetch("/api/outbound/bulk", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ leads: parsedLeads })
              });
              if (!res.ok) throw new Error("Bulk upload failed on server.");
              
              setUploadStats(`SYNCED ${parsedLeads.length} OPERATIONAL LEADS.`);
              setTimeout(() => fetchData(), 1000);
           } catch (e: any) {
              setDialError(e.message);
           }
           setIsUploading(false);
           if (fileInputRef.current) fileInputRef.current.value = "";
        },
        error: (error) => {
           setDialError(`CSV_PARSING_ERROR: ${error.message}`);
           setIsUploading(false);
        }
     });
  };

  const launchQueue = async () => {
     const queued = leads.filter(l => l.status === "Queued");
     if (queued.length === 0) return;
     
     if (!window.confirm(`SEQUENTIAL_DISPATCH_ALERT: ATTEMPTING ${queued.length} RELAY_THREADS. PROCEED?`)) return;

     setIsDialing(true);
     setUploadStats(`DISPATCHING ${queued.length} NODAL SIGNALS. DO_NOT_DISCONNECT.`);
     setDialError("");

     for (const lead of queued) {
        try {
           const res = await authFetch("/api/outbound/dial", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ 
                agentId: lead.agent_id, 
                customerName: lead.customer_name, 
                customerNumber: lead.customer_number, 
                context: lead.context 
             })
           });
           
           if (res.ok) {
              setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: "Dialing" } : l));
           }
           await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
           console.error("Failed batch call", e);
        }
     }
     
     setIsDialing(false);
     setUploadStats(`BATCH_SEQUENCE_TERMINATED.`);
     setTimeout(() => fetchData(), 2000);
  };

  return (
    <div className="flex flex-col space-y-12 md:space-y-20 pb-40 max-w-[1600px] mx-auto w-full p-8 md:p-12 lg:p-16">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <Radar className="w-3 h-3" /> BATCH_MODE: ENABLED
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Shield className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">SECURITY_ENFORCED: LEVEL_4</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            OUTBOUND<br />DISPATCH
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Deploy specialized neural units across global carrier networks for mass lead qualification and mission execution.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
           <div className="bg-white p-2 brutal-border border-4 shadow-none flex">
              <button onClick={() => setMode("single")} className={cn("px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all italic", mode === "single" ? "bg-ink text-brand" : "text-muted hover:text-ink")}>DISCRETE_THREAD</button>
              <button onClick={() => setMode("bulk")} className={cn("px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all italic", mode === "bulk" ? "bg-ink text-brand" : "text-muted hover:text-ink")}>BATCH_ARCHIVE</button>
           </div>
           <CsvExportButton type="leads" label="Export Leads" />
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-48 space-y-8">
           <Loader2 className="w-20 h-20 animate-spin text-brand" />
           <span className="text-[12px] font-black uppercase tracking-[0.8em] text-ink italic animate-pulse">BOOTSTRAPPING_OPERATIONS_CORE...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-16 lg:gap-24">
          
          {/* Configuration Panel */}
          <div className="xl:col-span-5">
             <div className="bg-white brutal-border border-8 sticky top-32 overflow-hidden flex flex-col">
                 <div className="p-10 border-b-8 border-ink bg-zinc-950 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <Zap className="w-6 h-6 text-brand" />
                       <h2 className="text-2xl font-black text-white uppercase tracking-tighter font-display italic">DISPATCH_PARAMS</h2>
                    </div>
                    {mode === 'bulk' && <FileSpreadsheet className="w-6 h-6 text-brand" />}
                    {mode === 'single' && <Activity className="w-6 h-6 text-brand" />}
                 </div>

                 <div className="p-10 md:p-14 space-y-10">
                   <div className="space-y-4">
                     <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] block italic ml-1">DEPLOY_MISSION_AGENT</label>
                     <div className="relative">
                        <select 
                          value={selectedAgentId} 
                          onChange={e => setSelectedAgentId(e.target.value)} 
                          className="w-full p-6 bg-paper brutal-border border-4 outline-none focus:bg-brand text-ink font-black uppercase tracking-widest text-xs h-20 appearance-none cursor-pointer italic"
                        >
                           {agents.map(a => <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>)}
                        </select>
                        <ChevronRight className="absolute right-8 top-1/2 -translate-y-1/2 w-8 h-8 text-ink pointer-events-none rotate-90" />
                     </div>
                   </div>

                   <AnimatePresence mode="wait">
                    {mode === "single" ? (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                      >
                        <div className="grid grid-cols-1 gap-10">
                          <div className="space-y-4">
                            <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] block italic ml-1">CARRIER_VECTOR (PHONE)</label>
                            <input type="text" value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="+1 XXX XXX XXXX" className="w-full p-6 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-xl bg-white shadow-none font-sans h-20 italic font-display" />
                          </div>

                          <div className="space-y-4">
                            <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] block italic ml-1">SUBJECT_DESIGNATION (NAME)</label>
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="JOHN_DOE" className="w-full p-6 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-xl bg-white shadow-none h-20 italic font-display" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] block italic ml-1">MISSION_OBJECTIVES (CONTEXT)</label>
                          <textarea value={context} onChange={e => setContext(e.target.value)} rows={5} placeholder="ENTER_OPERATIONAL_PARAMETERS..." className="w-full p-8 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-tighter text-2xl bg-white shadow-none resize-none italic font-display leading-[1.1]"></textarea>
                        </div>

                        <button 
                          onClick={dispatchCall} 
                          disabled={isDialing || !customerNumber}
                          className="w-full h-24 bg-zinc-950 text-brand brutal-border border-4 flex justify-center items-center gap-6 hover:bg-black disabled:opacity-50 font-black uppercase tracking-[0.4em] text-lg italic transition-all active:translate-x-1 active:translate-y-1 active:shadow-none"
                        >
                          {isDialing ? <><Loader2 className="w-8 h-8 animate-spin" /> DISPATCHING_RELAY...</> : <><Search className="w-8 h-8" /> INITIATE_SIGNAL</>}
                        </button>
                      </motion.div>
                    ) : (
                       <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-10"
                       >
                          <div className="p-8 bg-zinc-950 text-brand brutal-border border-4 shadow-none">
                             <div className="flex items-center gap-4 mb-6 border-b border-brand/20 pb-4">
                               <Terminal className="w-5 h-5 text-brand" />
                               <h4 className="text-[10px] font-black uppercase tracking-[0.4em] italic leading-none">STRUCTURAL_INTEGRITY_SPECS</h4>
                             </div>
                             <ul className="text-[10px] font-bold text-white/50 space-y-3 uppercase tracking-widest">
                                <li className="flex items-center gap-3"><ChevronRight className="w-3 h-3 text-brand" /> HEADERS: <span className="text-white">PHONE, NAME, CONTEXT</span></li>
                                <li className="flex items-center gap-3"><ChevronRight className="w-3 h-3 text-brand" /> FORMAT: <span className="text-white">CSV_ENCODED</span></li>
                                <li className="flex items-center gap-3"><ChevronRight className="w-3 h-3 text-brand" /> LIMIT: <span className="text-white">1,000_LINES_MAX</span></li>
                             </ul>
                          </div>

                          <div 
                            className="border-8 border-dashed border-ink/10 p-20 flex flex-col items-center justify-center text-center hover:bg-brand/5 hover:border-brand transition-all w-full cursor-pointer relative group" 
                            onClick={() => fileInputRef.current?.click()}
                          >
                             <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                             {isUploading ? (
                                <Loader2 className="w-16 h-16 text-brand animate-spin mb-8" />
                             ) : (
                                <UploadCloud className="w-16 h-16 text-zinc-100 group-hover:text-brand transition-all mb-8 group-hover:scale-110" />
                             )}
                             <h3 className="font-black text-ink uppercase tracking-[0.4em] mb-4 font-display italic text-lg">UPLOAD_BATCH_MANIFEST</h3>
                             <p className="text-[10px] font-black text-muted uppercase tracking-[0.5em] italic">DRAG_MANIFEST_HERE_OR_CLICK_TO_SCAN</p>
                          </div>
                          
                          <div className="p-10 bg-brand/5 border-4 border-brand border-dashed flex items-center gap-6">
                             <Shield className="w-8 h-8 text-brand fill-ink" />
                             <p className="text-[10px] font-black text-ink uppercase tracking-widest italic leading-relaxed">
                                ALL_BATCH_DATA_SCRUBBED_AND_ENCRYPTED_BEFORE_DISPATCH_SEQUENCE_EXECUTION.
                             </p>
                          </div>
                       </motion.div>
                    )}
                   </AnimatePresence>

                   <AnimatePresence>
                    {(dialError || uploadStats) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        {dialError && (
                          <div className="p-6 bg-rose-500 text-white font-black uppercase tracking-widest text-[10px] brutal-border border-4 shadow-none italic flex items-center gap-4">
                            <Terminal className="w-5 h-5 shrink-0" /> THREAD_CRITICAL_FAIL: {dialError}
                          </div>
                        )}
                        {uploadStats && (
                          <div className="p-6 bg-brand text-ink font-black uppercase tracking-widest text-[10px] brutal-border border-4 shadow-none italic flex items-center gap-4">
                            <Activity className="w-5 h-5 shrink-0" /> NETWORK_STATUS: {uploadStats}
                          </div>
                        )}
                      </motion.div>
                    )}
                   </AnimatePresence>
                 </div>
              </div>
          </div>

          {/* Operations Queue */}
          <div className="xl:col-span-7">
             <div className="bg-white brutal-border border-8 overflow-hidden min-h-[800px] flex flex-col relative animate-in fade-in slide-in-from-right-10 duration-700">
                <div className="absolute inset-0 bg-ink/5 -skew-x-12 translate-x-[50%] pointer-events-none" />
                <div className="p-10 md:p-14 border-b-8 border-ink bg-zinc-950 flex flex-col md:flex-row justify-between items-center gap-8 shrink-0 relative z-10 overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                     <Radar className="w-32 h-32 text-brand animate-spin" style={{ animationDuration: '10s' }} />
                  </div>
                  <div className="flex items-center gap-6 relative z-10">
                     <PlayCircle className="w-12 h-12 text-brand" />
                     <div>
                       <h2 className="text-3xl font-black text-white uppercase tracking-tighter font-display italic leading-none">OPERATIONS_QUEUE</h2>
                       <p className="text-[10px] font-black text-brand uppercase tracking-[0.4em] italic mt-3">Tactical Pipeline Status</p>
                     </div>
                  </div>
                  
                  {leads.filter(l => l.status === "Queued").length > 0 && (
                     <button 
                       onClick={launchQueue} 
                       disabled={isDialing}
                       className="w-full md:w-auto h-20 bg-brand text-ink px-10 border-4 border-ink text-sm font-black uppercase tracking-[0.3em] hover:shadow-none transition-all flex items-center justify-center gap-6 active:translate-x-1 active:translate-y-1 italic relative z-10"
                     >
                        {isDialing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Radar className="w-6 h-6 animate-pulse" />}
                        SEQUENTIAL_DISPATCH ({leads.filter(l => l.status === "Queued").length})
                     </button>
                  )}
               </div>

               <div className="flex-1 overflow-y-auto relative z-10 scrollbar-hide">
                <AnimatePresence mode="popLayout">
                  {leads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-24 md:p-40 text-center">
                      <div className="w-32 h-32 md:w-48 md:h-48 bg-paper brutal-border border-8 flex items-center justify-center mb-12 group hover:-rotate-6 transition-transform">
                          <Target className="w-16 h-16 md:w-24 md:h-24 text-zinc-100 group-hover:text-brand transition-colors" />
                      </div>
                      <div className="space-y-6">
                         <h3 className="text-4xl font-black text-ink uppercase tracking-tighter font-display italic leading-none">QUEUE_IDLE</h3>
                         <p className="max-w-md font-bold text-muted uppercase tracking-[0.4em] text-xs md:text-sm leading-loose italic underline decoration-brand decoration-4 underline-offset-[-2px]">
                            NO_TACTICAL_SIGNAL_THREADS_CURRENTLY_REGISTERED_IN_THE_OPERATIONAL_PIPELINE.
                         </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y-8 divide-ink">
                      {leads.map((lead, idx) => (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={lead.id || idx} 
                          className={cn(
                            "p-10 md:p-14 flex flex-col sm:flex-row gap-10 transition-all justify-between items-center group", 
                            lead.status === 'Queued' ? 'bg-brand/5' : 'hover:bg-zinc-50'
                          )}
                        >
                          <div className="flex-2 min-w-0 w-full sm:w-auto space-y-6">
                            <div className="flex flex-wrap items-center gap-6">
                               <div className="w-1.5 h-10 bg-ink" />
                               <h3 className="font-black text-ink text-3xl md:text-5xl uppercase tracking-tighter font-display italic leading-[0.8] truncate group-hover:translate-x-2 transition-transform">{lead.customer_name || "SUBJECT_UNKNOWN"}</h3>
                               {lead.source === "inbound" && (
                                  <span className="px-3 py-1 bg-brand-2/15 border-2 border-brand-2/50 text-brand-2 text-[10px] font-black uppercase tracking-widest italic">INBOUND</span>
                               )}
                            </div>
                            <div className="flex flex-wrap items-center gap-8 pl-10">
                               <div className={cn(
                                 "px-4 py-1 brutal-border border-2 shadow-none text-[10px] font-black uppercase tracking-widest italic flex items-center gap-3", 
                                 lead.status === 'Completed' ? 'bg-emerald-500 text-white' :
                                 lead.status === 'Queued' ? 'bg-brand text-ink border-ink animate-pulse' : 
                                 'bg-rose-500 text-white animate-pulse'
                               )}>
                                  <div className="w-2 h-2 bg-current rounded-full" /> {lead.status}
                               </div>
                               <Link
                                 to={`/contact/${encodeURIComponent(lead.phone_number || lead.customer_number || "unknown")}`}
                                 className="px-3 py-1 rounded-full glass border border-brand/30 hover:bg-brand/10 hover:border-brand/60 transition-all text-xs text-brand font-mono"
                               >
                                 {lead.phone_number || lead.customer_number}
                               </Link>
                               <span className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic hidden md:inline">RELAY_TARGET: AGENT_{lead.agent_id?.substring(0,8).toUpperCase()}</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-3">
                             <ClaudeRecipeButton
                                recipe="enrich-lead"
                                initial={{
                                   customerName: lead.customer_name,
                                   customerNumber: lead.phone_number || lead.customer_number,
                                   context: lead.context,
                                }}
                                label="Enrich"
                             />
                             <ClaudeRecipeButton
                                recipe="brief"
                                agentId={selectedAgentId}
                                initial={{
                                   customerName: lead.customer_name,
                                   customerNumber: lead.phone_number,
                                   reasonForCall: lead.context,
                                }}
                                label="Brief"
                             />
                             {lead.status === 'Queued' && (
                                <button className="w-12 h-12 rounded-full glass border border-white/10 flex items-center justify-center text-ink/70 hover:border-brand/40 hover:text-brand transition-all">
                                   <Share2 className="w-5 h-5" />
                                </button>
                             )}
                             <div className="w-12 h-12 rounded-full glass border border-white/10 flex items-center justify-center text-ink/70 group-hover:border-brand/40 group-hover:text-brand transition-all">
                                <Terminal className="w-5 h-5" />
                             </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
               </div>
               
               <div className="p-10 bg-zinc-950 text-brand text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-brand/5 translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
                  <p className="text-[10px] font-black uppercase tracking-[1em] italic opacity-40 relative z-10">-- SYSTEM OPERATIONS PIPELINE STATUS: IDLE --</p>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
