import React, { useState, useEffect } from "react";
import { ArrowRight, Phone, Mail, CheckCircle2, Clock, Loader2, Bot, User, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export default function FleetTaskBridge() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await fetch("/api/fleet/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchTasks();
    } catch(e) {}
  };

  return (
    <div className="space-y-16">
      <div className="flex justify-between items-end border-b-8 border-ink pb-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
             <span className="bg-ink text-brand text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-sans animate-pulse">Relay Service Active</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-ink uppercase tracking-tight font-display flex items-center gap-6 italic leading-none">
            <Bot className="w-12 h-12 md:w-16 md:h-16 text-brand" />
            Transfer Hub
          </h2>
          <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-5">Handoff management between voice and email channels.</p>
        </div>
        <button 
          onClick={fetchTasks}
          className="w-20 h-20 brutal-border bg-white flex items-center justify-center text-ink hover:bg-brand transition-all shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
        >
          <Clock className={cn("w-10 h-10", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid gap-12">
        {loading && tasks.length === 0 ? (
          <div className="p-32 flex justify-center bg-white brutal-border border-ink/10 shadow-none">
            <Loader2 className="w-24 h-24 animate-spin text-brand" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-32 text-center bg-white brutal-border shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
            <div className="w-32 h-32 bg-brand brutal-border flex items-center justify-center mx-auto mb-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
               <CheckCircle2 className="w-16 h-16 text-ink" />
            </div>
            <p className="text-ink font-black uppercase text-xl tracking-tighter font-display italic">No pending transfers.</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">All tasks have been processed.</p>
          </div>
        ) : (
          tasks.map(task => (
            <div 
              key={task.id} 
              className={cn(
                "bg-white brutal-border p-12 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all relative overflow-hidden group",
                task.status === 'completed' ? "bg-zinc-50/50 opacity-60 grayscale" : "bg-white"
              )}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-16">
                <div className="flex items-center gap-12 flex-1 min-w-0">
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-24 h-24 brutal-border flex items-center justify-center shrink-0 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all",
                      task.source_type === 'phone_call' ? "bg-brand text-ink" : "bg-zinc-950 text-white"
                    )}>
                      {task.source_type === 'phone_call' ? <Phone className="w-12 h-12" /> : <Mail className="w-12 h-12" />}
                    </div>

                    <div className="flex items-center gap-6 text-ink animate-pulse scale-150">
                      <ChevronRight className="w-8 h-8" />
                    </div>

                    <div className={cn(
                      "w-24 h-24 brutal-border flex items-center justify-center shrink-0 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all",
                      task.target_channel === 'email' ? "bg-zinc-950 text-white" : "bg-brand text-ink"
                    )}>
                      {task.target_channel === 'email' ? <Mail className="w-12 h-12" /> : <Phone className="w-12 h-12" />}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-6 mb-4">
                       <span className="text-[10px] font-black text-white bg-ink px-3 py-1 uppercase tracking-widest italic brutal-border shadow-none">
                         {task.task_type.replace('_', ' ')}
                       </span>
                       <span className="text-[10px] text-slate-300 font-black uppercase tracking-[0.3em]">RELAY_ID: {task.id.split('-')[0]}</span>
                    </div>
                    <h4 className="font-black text-ink text-2xl md:text-4xl font-display uppercase tracking-tight italic leading-none mb-4">
                       {task.source_type === 'phone_call' ? 'Phone Handoff' : 'Email Inquiry'}
                    </h4>
                    <p className="text-lg font-bold text-ink uppercase tracking-tight leading-relaxed max-w-2xl font-display text-zinc-400">
                      {task.description.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-6 shrink-0 w-full md:w-auto">
                   <div className="flex items-center gap-6">
                      <div className={cn(
                        "px-6 py-3 brutal-border shadow-none text-xs font-black uppercase tracking-[0.3em] italic",
                        task.status === 'completed' ? "bg-emerald-500 text-white" : "bg-brand text-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      )}>
                        {task.status}
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        THROUGHPUT: {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase()}
                      </span>
                   </div>
                   
                   {task.status === 'pending' && (
                     <button 
                       onClick={() => updateStatus(task.id, 'completed')}
                       className="brutal-btn !bg-ink !text-brand !py-5 !px-12 w-full md:w-auto text-xs active:translate-x-1 active:translate-y-1 active:shadow-none"
                     >
                        Mark Resolved
                     </button>
                   )}
                </div>
              </div>
              {task.status === 'pending' && (
                <div className="absolute top-0 left-0 w-4 h-full bg-brand" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
