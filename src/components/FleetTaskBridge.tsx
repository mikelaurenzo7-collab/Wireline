import React, { useState, useEffect } from "react";
import { ArrowRight, Phone, Mail, CheckCircle2, Clock, Loader2, Bot, User, ChevronRight, Calendar, Terminal, Shield, Zap, Target, Signal, Activity, AlertTriangle, Box, Command, Search, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

export default function FleetTaskBridge() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await authFetch("/api/fleet/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await authFetch("/api/agents");
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) {
      console.error("Failed to fetch agents:", e);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchAgents();
    const interval = setInterval(fetchTasks, 30000); 
    return () => clearInterval(interval);
  }, []);

  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const updateStatus = async (id: string, status: string) => {
    try {
      const payload: any = { status };
      if (status === 'completed' && resolutionNotes[id]) {
         payload.resolution_notes = resolutionNotes[id];
      }
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchTasks();
    } catch(e) {}
  };

  const updatePriority = async (id: string, priority: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority })
      });
      fetchTasks();
    } catch(e) {}
  };

  const updateAssignment = async (id: string, agent_id: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id })
      });
      fetchTasks();
    } catch(e) {}
  };

  const updateDueDate = async (id: string, due_date: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date })
      });
      fetchTasks();
    } catch(e) {}
  };

  return (
    <div className="flex flex-col space-y-3 w-full">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <Bot className="w-3 h-3" /> PIELINE: ACTIVE
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Command className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">GATEWAY: OMNICHANNEL_RELAY</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            OPERATIONS<br />BRIDGE
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Real-time handoff management and tactical mission coordination across your entire communication fleet.
          </p>
        </div>
        
        <div className="flex items-center gap-6 w-full lg:w-auto">
          <button 
            onClick={fetchTasks} 
            className="w-16 h-16 brutal-border border-4 bg-white flex items-center justify-center hover:bg-brand transition-all hover:shadow-none translate-x-[-4px] translate-y-[-4px] active:translate-x-1 active:translate-y-1"
          >
            <Clock className={cn("w-8 h-8", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="grid gap-12">
        <AnimatePresence mode="popLayout">
          {loading && tasks.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-40 flex flex-col items-center gap-8 justify-center bg-paper brutal-border border-4 border-dashed"
            >
              <Loader2 className="w-20 h-20 animate-spin text-brand" />
              <span className="text-[12px] font-black uppercase tracking-[0.8em] text-ink italic animate-pulse">DECRYPTING_OPERATIONAL_QUEUE...</span>
            </motion.div>
          ) : tasks.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-32 text-center bg-white brutal-border border-8 space-y-12"
            >
              <div className="w-32 h-32 md:w-48 md:h-48 bg-brand brutal-border border-8 flex items-center justify-center mx-auto group hover:-rotate-6 transition-transform">
                 <CheckCircle2 className="w-16 h-16 md:w-24 md:h-24 text-ink" />
              </div>
              <div className="space-y-6">
                 <h3 className="text-4xl md:text-6xl font-black text-ink uppercase font-display italic tracking-tighter leading-none">ZERO_SIGNAL_BACKLOG</h3>
                 <p className="max-w-md font-bold text-muted uppercase tracking-[0.4em] text-xs md:text-sm leading-loose italic mx-auto underline decoration-brand decoration-4 underline-offset-[-2px]">
                   ALL_TACTICAL_DATA_HANDOFFS_HAVE_BEEN_SUCCESSFULLY_PROCESSED_AND_TERMINATED.
                 </p>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-10">
              {tasks.map(task => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={task.id} 
                  className={cn(
                    "bg-white brutal-border border-8 p-4 md:p-5 transition-all relative overflow-hidden group",
                    task.status === 'completed' ? "bg-zinc-50 border-zinc-100 opacity-60 grayscale shadow-none" : "",
                    task.priority === 'high' && task.status !== 'completed' && "border-rose-500 "
                  )}
                >
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-12 group/card">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-10 flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-6 shrink-0 relative">
                        <div className={cn(
                          "w-20 h-20 md:w-24 md:h-24 brutal-border border-4 flex items-center justify-center shrink-0  group-hover:translate-x-[-4px] group-hover:translate-y-[-4px] group-hover:shadow-none transition-all",
                          task.source_type === 'phone_call' ? "bg-brand text-ink" : "bg-zinc-950 text-white"
                        )}>
                          {task.source_type === 'phone_call' ? <Phone className="w-10 h-10" /> : <Mail className="w-10 h-10" />}
                        </div>

                        <div className="flex items-center gap-2 text-ink animate-pulse shrink-0">
                          <ChevronRight className="w-10 h-10" />
                        </div>

                        <div className={cn(
                          "w-20 h-20 md:w-24 md:h-24 brutal-border border-4 flex items-center justify-center shrink-0  group-hover:translate-x-[-4px] group-hover:translate-y-[-4px] group-hover:shadow-none transition-all",
                          task.target_channel === 'email' ? "bg-zinc-950 text-white" : "bg-brand text-ink"
                        )}>
                          {task.target_channel === 'email' ? <Mail className="w-10 h-10" /> : <Phone className="w-10 h-10" />}
                        </div>
                      </div>

                      <div className="flex-1 w-full text-center md:text-left space-y-4">
                        <div className="flex flex-wrap items-center gap-6 justify-center md:justify-start">
                           <span className="text-[10px] font-black text-white bg-ink px-3 py-1 uppercase tracking-[0.3em] italic brutal-border border-2 shadow-none leading-none">
                             MISSION_{task.task_type.toUpperCase()}
                           </span>
                           <div className="relative">
                            <select
                              value={task.priority || "medium"}
                              onChange={(e) => updatePriority(task.id, e.target.value)}
                              className={cn(
                                "text-[10px] font-black uppercase tracking-[0.3em] italic brutal-border border-2 p-2 outline-none h-10 flex items-center shadow-none transition-all appearance-none pr-10",
                                task.priority === 'high' ? "bg-rose-500 text-white border-rose-600" :
                                task.priority === 'low' ? "bg-zinc-200 text-zinc-500 border-zinc-300" :
                                "bg-brand text-ink border-brand"
                              )}
                            >
                              <option value="high">HIGH_PRIORITY_RELAY</option>
                              <option value="medium">MEDIUM_PRIORITY</option>
                              <option value="low">LOW_PRIORITY</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                           </div>
                           <span className="text-[10px] text-muted font-black uppercase tracking-[0.4em] italic opacity-40">RELAY_ID: {task.id.substring(0,8).toUpperCase()}</span>
                        </div>
                        <h4 className="font-black text-ink text-3xl md:text-5xl font-display uppercase tracking-tighter italic leading-none group-hover:translate-x-2 transition-transform">
                           {task.source_type === 'phone_call' ? 'INBOUND_VOICE_RELAY' : 'ROUTING_LOGIC_THREAD'}
                        </h4>
                        <p className="text-xl md:text-2xl font-black text-muted uppercase tracking-tight leading-none italic font-display">
                          {task.description.toUpperCase()}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 pt-8 border-t-4 border-ink/5">
                           <div className="space-y-4">
                              <label className="text-[9px] font-black text-muted uppercase tracking-[0.5em] italic flex items-center gap-4 leading-none">
                                <Bot className="w-5 h-5 text-brand fill-ink" /> OPERATIONAL_ASSET
                              </label>
                              <div className="relative">
                                <select 
                                  value={task.agent_id || ""}
                                  onChange={(e) => updateAssignment(task.id, e.target.value)}
                                  className="w-full text-[10px] font-black bg-white brutal-border border-4 p-5 outline-none focus:bg-brand min-w-[250px] appearance-none cursor-pointer uppercase tracking-widest shadow-none italic font-display"
                                >
                                   <option value="">SELECT_MISSION_AGENT</option>
                                   {agents.map((a: any) => (
                                     <option key={a.id} value={a.id}>{a.name.toUpperCase()} (MISSION_READY)</option>
                                   ))}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-ink pointer-events-none" />
                              </div>
                           </div>

                           <div className="space-y-4">
                              <label className="text-[9px] font-black text-muted uppercase tracking-[0.5em] italic flex items-center gap-4 leading-none">
                                <Calendar className="w-5 h-5 text-brand fill-ink" /> TARGET_DEADLINE
                              </label>
                              <input 
                                type="date"
                                value={task.due_date ? task.due_date.split('T')[0] : ""}
                                onChange={(e) => updateDueDate(task.id, e.target.value)}
                                className="w-full text-[10px] font-black bg-white brutal-border border-4 p-5 outline-none focus:bg-brand min-w-[180px] cursor-pointer shadow-none italic font-display"
                              />
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center xl:items-end gap-6 shrink-0 w-full xl:w-[350px] mt-6 xl:mt-0 xl:pl-10 xl:border-l-8 xl:border-ink/5">
                       <div className="flex items-center justify-between w-full">
                          <div className={cn(
                            "px-6 py-2 brutal-border border-4 shadow-none text-[10px] font-black uppercase tracking-[0.4em] italic",
                            task.status === 'completed' ? "bg-emerald-500 text-white border-emerald-600" : "bg-brand text-ink border-brand animate-pulse"
                          )}>
                            {task.status}
                          </div>
                          <div className="flex items-center gap-4 text-muted font-mono text-[10px] font-black uppercase">
                            <Clock className="w-4 h-4" />
                            {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase()}
                          </div>
                       </div>
                       
                       {task.status === 'pending' ? (
                         <div className="w-full space-y-6">
                            <div className="space-y-4">
                              <label className="text-[9px] font-black text-muted uppercase tracking-[0.4em] italic ml-1">RESOLUTION_LOG</label>
                              <textarea 
                                rows={3}
                                placeholder="ENTER_MISSION_OUTCOME_NODES..."
                                value={resolutionNotes[task.id] || ''}
                                onChange={e => setResolutionNotes({ ...resolutionNotes, [task.id]: e.target.value })}
                                className="w-full text-sm font-black uppercase tracking-widest italic bg-zinc-50 border-4 border-ink p-5 outline-none focus:bg-brand shadow-none resize-none"
                              />
                            </div>
                            <button 
                              onClick={() => updateStatus(task.id, 'completed')}
                              className="w-full h-16 bg-zinc-950 text-brand brutal-border border-4 flex items-center justify-center gap-6 hover:shadow-none hover:bg-black transition-all active:translate-x-1 active:translate-y-1 text-xs font-black uppercase tracking-[0.4em] italic"
                            >
                               <CheckCircle2 className="w-6 h-6" /> CONFIRM_PROCESSING
                            </button>
                         </div>
                       ) : (
                         task.resolution_notes && (
                           <div className="w-full p-6 bg-emerald-50 brutal-border border-4 border-emerald-500 relative overflow-hidden group/note">
                              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/note:scale-125 transition-transform">
                                 <Shield className="w-20 h-20 text-emerald-500" />
                              </div>
                              <span className="text-[9px] font-black text-emerald-700 uppercase tracking-[0.4em] block mb-3 italic leading-none">RESOLUTION_ARCHIVE</span>
                              <p className="text-xs font-bold text-emerald-900 uppercase italic leading-loose tracking-widest">{task.resolution_notes}</p>
                           </div>
                         )
                       )}
                    </div>
                  </div>
                  
                  {task.status === 'pending' && (
                    <div className={cn(
                      "absolute top-0 left-0 w-4 h-full",
                      task.priority === 'high' ? "bg-rose-500 animate-pulse shadow-[8px_0px_20px_0px_rgba(244,63,94,0.3)]" : "bg-brand"
                    )} />
                  )}
                  {task.due_date && task.status === 'pending' && new Date(task.due_date) < new Date() && (
                    <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-black px-8 py-3 uppercase tracking-[0.6em] italic brutal-border border-t-0 border-r-0 shadow-none z-10 font-display">
                      THREAD_OVERDUE
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
      
      <footer className="pt-20 border-t-8 border-ink border-dashed">
         <div className="flex flex-col md:flex-row justify-between items-center gap-10 opacity-30">
            <div className="flex items-center gap-10">
               <div className="flex items-center gap-4">
                  <Activity className="w-6 h-6 text-ink" />
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] italic">Handoff_Latency: 1.2s</span>
               </div>
               <div className="flex items-center gap-4">
                  <Signal className="w-6 h-6 text-ink" />
                  <span className="text-[10px] font-black uppercase tracking-[0.5em] italic">Uptime: 99.9%</span>
               </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[1em] italic leading-none">-- NETWORK_RELAY_CONSOLE_v4.0 --</p>
         </div>
      </footer>
    </div>
  );
}
