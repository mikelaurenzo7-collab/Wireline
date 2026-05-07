import { useState, useEffect, useRef } from "react";
import { Phone, Mail, CheckCircle2, Clock, Loader2, Bot, ChevronRight, Calendar, ChevronDown, AlertTriangle, RotateCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatTime } from "../lib/safe-date";

export default function FleetTaskBridge() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  // Dead-component guard for the polling loop and the initial loads —
  // unmount during a 30s tick should not write state.
  const mountedRef = useRef(true);

  const fetchTasks = async (signal?: AbortSignal) => {
    try {
      const res = await authFetch("/api/fleet/tasks", signal ? { signal } : {});
      const data = await res.json();
      if (!mountedRef.current) return;
      setTasks(data.tasks || []);
      setError(null);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (mountedRef.current) {
        console.error(e);
        // Distinguish "queue clear" (success + 0 tasks) from "API down"
        // — without this, a failed /api/fleet/tasks just left the panel
        // showing the "All handoffs processed" empty state.
        setError("Couldn't reach the fleet task service.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const fetchAgents = async (signal?: AbortSignal) => {
    try {
      const res = await authFetch("/api/agents", signal ? { signal } : {});
      const data = await res.json();
      if (!mountedRef.current) return;
      setAgents(data.agents || []);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (mountedRef.current) console.error("Failed to fetch agents:", e);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetchTasks(controller.signal);
    fetchAgents(controller.signal);
    const interval = setInterval(() => fetchTasks(controller.signal), 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      controller.abort();
    };
  }, []);

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
    } catch { /* noop */ }
  };

  const updatePriority = async (id: string, priority: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority })
      });
      fetchTasks();
    } catch { /* noop */ }
  };

  const updateAssignment = async (id: string, agent_id: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id })
      });
      fetchTasks();
    } catch { /* noop */ }
  };

  const updateDueDate = async (id: string, due_date: string) => {
    try {
      await authFetch(`/api/fleet/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date })
      });
      fetchTasks();
    } catch { /* noop */ }
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading queue</span>
      </div>
    );
  }

  // Show the error state ahead of "queue clear" so a failed /api/fleet/tasks
  // doesn't masquerade as an empty success.
  if (error && tasks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="w-12 h-12 rounded-2xl glass border border-rose-500/30 flex items-center justify-center text-rose-500">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h4 className="font-display italic lowercase text-lg text-ink">queue offline</h4>
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">{error}</p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="w-12 h-12 rounded-2xl glass border border-emerald-500/30 flex items-center justify-center text-emerald-500">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="font-display italic lowercase text-lg text-ink">queue clear</h4>
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">All handoffs processed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
        <button
          onClick={() => fetchTasks()}
          className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-muted/70 hover:text-brand transition-colors"
          title="Refresh"
        >
          <RotateCw className={cn("w-3 h-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <AnimatePresence mode="popLayout">
        {tasks.map(task => {
          const isCompleted = task.status === 'completed';
          const isHigh = task.priority === 'high' && !isCompleted;
          const isOverdue = task.due_date && task.status === 'pending' && new Date(task.due_date) < new Date();

          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              key={task.id}
              className={cn(
                "relative rounded-xl glass border p-3 overflow-hidden",
                isCompleted ? "border-white/6 opacity-60" :
                isHigh ? "border-rose-500/40" :
                "border-white/8"
              )}
            >
              {/* Priority bar */}
              {!isCompleted && (
                <div className={cn(
                  "absolute top-0 left-0 w-0.5 h-full",
                  isHigh ? "bg-rose-500" : "bg-brand"
                )} />
              )}

              <div className="flex flex-col lg:flex-row gap-3">
                {/* Source → target channel diagram */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={cn(
                    "w-8 h-8 rounded-lg glass border flex items-center justify-center shrink-0",
                    task.source_type === 'phone_call' ? "border-brand/40 text-brand" : "border-white/10 text-ink/70"
                  )}>
                    {task.source_type === 'phone_call' ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted/50" />
                  <div className={cn(
                    "w-8 h-8 rounded-lg glass border flex items-center justify-center shrink-0",
                    task.target_channel === 'email' ? "border-white/10 text-ink/70" : "border-brand/40 text-brand"
                  )}>
                    {task.target_channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full glass border border-white/10 text-ink/80 leading-none">
                      {task.task_type}
                    </span>
                    <div className="relative">
                      <select
                        value={task.priority || "medium"}
                        onChange={(e) => updatePriority(task.id, e.target.value)}
                        className={cn(
                          "text-[9px] uppercase tracking-[0.25em] py-0.5 pl-2 pr-6 rounded-full border outline-none cursor-pointer appearance-none leading-none",
                          task.priority === 'high' ? "bg-rose-500/15 border-rose-500/30 text-rose-500" :
                          task.priority === 'low' ? "bg-white/5 border-white/10 text-muted" :
                          "bg-brand/10 border-brand/30 text-brand"
                        )}
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 pointer-events-none" />
                    </div>
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 leading-none">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Overdue
                      </span>
                    )}
                    <span className="text-[9px] uppercase tracking-[0.3em] text-muted/50 ml-auto">
                      <Clock className="w-2.5 h-2.5 inline mr-1" />
                      {formatTime(task.created_at, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h4 className="font-display italic text-base text-ink leading-tight">
                    {task.source_type === 'phone_call' ? 'Inbound voice handoff' : 'Routing thread'}
                  </h4>
                  <p className="text-xs text-muted/80 leading-relaxed">{task.description}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-white/6">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                        <Bot className="w-2.5 h-2.5 text-brand" /> Assigned agent
                      </label>
                      <div className="relative">
                        <select
                          value={task.agent_id || ""}
                          onChange={(e) => updateAssignment(task.id, e.target.value)}
                          className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                        >
                          <option value="">Select agent</option>
                          {agents.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                        <Calendar className="w-2.5 h-2.5 text-brand" /> Due date
                      </label>
                      <input
                        type="date"
                        value={task.due_date ? task.due_date.split('T')[0] : ""}
                        onChange={(e) => updateDueDate(task.id, e.target.value)}
                        className="w-full text-xs bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand/50 text-ink"
                      />
                    </div>
                  </div>

                  {task.status === 'pending' ? (
                    <div className="space-y-1.5 pt-1">
                      <textarea
                        rows={2}
                        placeholder="Resolution notes (optional)…"
                        value={resolutionNotes[task.id] || ''}
                        onChange={e => setResolutionNotes({ ...resolutionNotes, [task.id]: e.target.value })}
                        className="w-full text-xs bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 resize-none"
                      />
                      <button
                        onClick={() => updateStatus(task.id, 'completed')}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[10px] uppercase tracking-[0.25em] hover:bg-emerald-500/25 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark resolved
                      </button>
                    </div>
                  ) : (
                    task.resolution_notes && (
                      <div className="rounded-lg glass border border-emerald-500/20 p-2.5">
                        <span className="text-[9px] uppercase tracking-[0.3em] text-emerald-500 block mb-1">Resolution</span>
                        <p className="text-xs text-ink/80 leading-relaxed">{task.resolution_notes}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
