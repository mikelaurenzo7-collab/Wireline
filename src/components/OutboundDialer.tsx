import React, { useState, useEffect, useRef } from "react";
import { PhoneOutgoing, Loader2, PlayCircle, Clock, Plus, Phone, UploadCloud, Users, Bot } from "lucide-react";
import Papa from "papaparse";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

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
              
              setUploadStats(`Successfully queued ${parsedLeads.length} leads in the system.`);
              setTimeout(() => fetchData(), 1000);
           } catch (e: any) {
              setDialError(e.message);
           }
           setIsUploading(false);
           if (fileInputRef.current) fileInputRef.current.value = "";
        },
        error: (error) => {
           setDialError(`CSV Parsing Error: ${error.message}`);
           setIsUploading(false);
        }
     });
  };

  // Launch all queued calls sequentially
  const launchQueue = async () => {
     const queued = leads.filter(l => l.status === "Queued");
     if (queued.length === 0) return;
     
     if (!window.confirm(`Warning: This will attempt to sequentially dispatch ${queued.length} calls against Vapi. Do you want to proceed?`)) return;

     setIsDialing(true);
     setUploadStats(`Dispatching ${queued.length} queued calls... Please don't close the browser.`);
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
              // Mark local complete to show progress
              setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: "Dialing" } : l));
           }
           
           // Slight delay between sequential dispatches to avoid rate limits
           await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (e) {
           console.error("Failed batch call", e);
        }
     }
     
     setIsDialing(false);
     setUploadStats(`Batch sequence complete.`);
     setTimeout(() => fetchData(), 2000);
  };

  return (
    <div className="flex flex-col min-h-full bg-white space-y-6 md:space-y-8 pb-32 max-w-7xl mx-auto w-full p-4 md:p-8 lg:p-10 text-ink">
      <header className="border-b-8 border-ink pb-6 md:pb-8 relative flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="space-y-2">
           <div className="flex items-center gap-2 mb-3">
              <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-display">BATCH CENTER</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                 <PhoneOutgoing className="w-2.5 h-2.5" />
                 <span className="text-[8px] font-black uppercase tracking-tighter italic">Signal Operations</span>
              </div>
           </div>
           <h1 className="text-4xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
             Signal Batching
           </h1>
        </div>
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[9px] md:text-[10px] max-w-xs leading-relaxed lg:text-right">Dispatch tactical AI specialists across carrier networks for autonomous lead qualification.</p>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-24 text-center"><Loader2 className="w-12 h-12 animate-spin text-brand" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
          
          <div className="lg:col-span-1">
             <div className="bg-white brutal-border shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sticky top-0 overflow-hidden">
                 <div className="flex w-full border-b-4 border-ink bg-ink">
                    <button 
                      onClick={() => setMode("single")} 
                      className={cn("flex-1 py-4 text-[9px] font-black uppercase tracking-widest font-display italic transition-all", mode === "single" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
                    >
                      Discrete Signal
                    </button>
                    <button 
                      onClick={() => setMode("bulk")} 
                      className={cn("flex-1 py-4 text-[9px] font-black uppercase tracking-widest font-display italic border-l-4 border-ink transition-all", mode === "bulk" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
                    >
                      Batch Archive
                    </button>
                 </div>

                 <div className="p-6 md:p-8 space-y-6">
                   <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 block italic">Select Agent</label>
                     <select value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)} className="w-full p-4 bg-zinc-50 brutal-border outline-none focus:bg-brand text-ink font-black uppercase tracking-widest text-[10px] h-12 appearance-none cursor-pointer">
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>)}
                     </select>
                   </div>

                   {mode === "single" ? (
                     <div className="space-y-5 animate-in fade-in slide-in-from-left-4 text-ink">
                       <div>
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block italic">Target Number</label>
                         <input type="text" value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="+1 XXX XXX XXXX" className="w-full p-4 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-[10px] bg-white shadow-none font-mono h-11" />
                       </div>

                       <div>
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block italic">Recipient Identity</label>
                         <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="JOHN DOE" className="w-full p-4 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-[10px] bg-white shadow-none h-11" />
                       </div>

                       <div>
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block italic">Tactical Context</label>
                         <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} placeholder="MISSION OBJECTIVES..." className="w-full p-4 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-tight text-sm bg-white shadow-none resize-none italic font-display"></textarea>
                       </div>

                       <button 
                         onClick={dispatchCall} 
                         disabled={isDialing || !customerNumber}
                         className="w-full py-4 bg-zinc-950 text-brand brutal-border flex justify-center items-center gap-3 hover:bg-black disabled:opacity-50 font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(250,204,21,1)] text-[10px] italic h-14"
                       >
                         {isDialing ? <><Loader2 className="w-4 h-4 animate-spin" /> DISPATCHING...</> : <><PhoneOutgoing className="w-4 h-4" /> INITIATE SIGNAL</>}
                       </button>
                     </div>
                   ) : (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                         <div className="p-4 bg-zinc-950 text-brand brutal-border shadow-none">
                            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] mb-2 italic">Format Required</h4>
                            <ul className="text-[8px] font-bold text-white/50 list-disc pl-4 space-y-1 uppercase tracking-widest">
                               <li>HEADERS: <span className="text-white">PHONE, NAME, CONTEXT</span></li>
                            </ul>
                         </div>

                         <div className="border-4 border-dashed border-ink/20 p-8 flex flex-col items-center justify-center text-center hover:bg-zinc-50 transition-all w-full cursor-pointer relative group" onClick={() => fileInputRef.current?.click()}>
                            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                            {isUploading ? (
                               <Loader2 className="w-8 h-8 text-brand animate-spin mb-4" />
                            ) : (
                               <UploadCloud className="w-8 h-8 text-slate-200 group-hover:text-brand transition-colors mb-4" />
                            )}
                            <h3 className="font-black text-ink uppercase tracking-widest mb-1 font-display italic text-xs">Upload CSV</h3>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">DRAG SIGNAL DATA OR CLICK</p>
                         </div>
                      </div>
                   )}

                  {dialError && (
                    <div className="p-3 bg-rose-500 text-white font-black uppercase tracking-widest text-[8px] brutal-border shadow-none italic animate-shake">
                      SIGNAL_ERROR: {dialError}
                    </div>
                  )}
                  {uploadStats && (
                    <div className="p-3 bg-brand text-ink font-black uppercase tracking-widest text-[8px] brutal-border shadow-none italic">
                      SYSTEM_STATUS: {uploadStats}
                    </div>
                  )}
                </div>
             </div>
          </div>

          <div className="lg:col-span-2">
             <div className="bg-white brutal-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden min-h-[500px] flex flex-col">
                <div className="p-4 md:p-6 border-b-4 border-ink bg-zinc-950 flex justify-between items-center shrink-0">
                  <h2 className="text-base md:text-xl font-black text-white uppercase tracking-tight font-display italic flex items-center gap-3">
                     <PlayCircle className="w-5 h-5 md:w-6 md:h-6 text-brand" />
                     Operations Queue
                  </h2>
                  
                  {leads.filter(l => l.status === "Queued").length > 0 && (
                     <button 
                       onClick={launchQueue} 
                       disabled={isDialing}
                       className="bg-brand text-ink px-4 py-2 border-2 md:border-4 border-ink text-[8px] md:text-[9px] font-black uppercase tracking-widest shadow-none hover:bg-white hover:text-ink transition-all flex items-center gap-2 active:translate-x-1 active:translate-y-1"
                     >
                        {isDialing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        BATCH DISPATCH ({leads.filter(l => l.status === "Queued").length})
                     </button>
                  )}
               </div>

               <div className="flex-1 overflow-y-auto">
                {leads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-12 md:p-24 text-slate-400 text-center">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-zinc-50 brutal-border border-slate-100 flex items-center justify-center mb-6 shadow-none">
                        <Users className="w-6 h-6 md:w-8 md:h-8 text-slate-200" />
                    </div>
                    <p className="font-black text-ink text-[10px] uppercase tracking-widest mb-1 italic">ARCHIVE EMPTY</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest leading-loose max-w-sm">
                        No tactical signals identified in queue.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y-2 divide-ink/10">
                    {leads.map((lead, idx) => (
                      <div key={idx} className={cn("p-4 md:p-6 flex flex-col sm:flex-row gap-4 md:gap-6 transition-all justify-between items-center group", lead.status === 'Queued' ? 'bg-brand/5' : 'hover:bg-zinc-50')}>
                          <div className="flex-1 min-w-0 w-full sm:w-auto">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <h3 className="font-black text-ink text-base md:text-xl uppercase tracking-tighter font-display italic truncate">{lead.customer_name || "UNKNOWN"}</h3>
                              <span className={cn("px-2 py-0.5 brutal-border shadow-none text-[7px] md:text-[8px] font-black uppercase tracking-widest italic h-5 flex items-center", 
                                 lead.status === 'Completed' ? 'bg-emerald-500 text-white' :
                                 lead.status === 'Queued' ? 'bg-brand text-ink border-ink' : 
                                 'bg-rose-500 text-white'
                              )}>
                                 {lead.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">
                               <span className="text-ink font-mono bg-zinc-100 px-2 py-0.5 brutal-border shadow-none border-zinc-200">{lead.customer_number}</span>
                               <span className="italic">RELAY_AGENT: {lead.agent_id?.substring(0,8).toUpperCase()}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                             <div className="w-10 h-10 bg-zinc-950 text-brand brutal-border flex items-center justify-center shadow-none group-hover:bg-brand group-hover:text-ink transition-all">
                                <PlayCircle className="w-4 h-4" />
                             </div>
                          </div>
                       </div>
                    ))}
                  </div>
                )}
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
