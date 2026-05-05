import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Radio, Phone, Clock, Bot, Loader2, RefreshCw,
  PhoneIncoming, PhoneOutgoing, Activity, Signal,
  Users, Zap, AlertCircle, PhoneOff, ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import PageShell, { Panel, StatTile } from "./PageShell";

type SignalEntry = {
  id: string;          // call_id
  agent_id: string;
  customer_number: string;
  status: string;
  label: string;
  type: string;        // 'voice' | 'email'
  started_at: string;
};

type ActivityEntry = {
  id: string | number;
  agent_id: string;
  agent_name?: string;
  customer_number?: string;
  direction?: string;
  summary?: string;
  lead_score?: number;
  duration_seconds?: number;
  created_at: string;
  type: "call" | "email" | "task" | "lesson";
  label?: string;
};

/** Live elapsed time ticker for an active call. */
function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [secs, setSecs] = useState(() => Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="tabular-nums font-mono">{m}:{String(s).padStart(2, "0")}</span>;
}

export default function LiveMonitor() {
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async () => {
    try {
      const [signalRes, activityRes, agentsRes] = await Promise.all([
        authFetch("/api/fleet/presence").then(r => r.json()),
        authFetch("/api/fleet/activity").then(r => r.json()),
        authFetch("/api/agents").then(r => r.json()),
      ]);
      setSignals(signalRes.signals || []);
      setActivity(activityRes.activity || []);
      setAgents(agentsRes.agents || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("LiveMonitor fetch failed:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? id.slice(0, 8);

  const activeCount = signals.length;
  const todayCallCount = activity.filter(e => e.type === "call").length;
  const avgLeadScore = (() => {
    const calls = activity.filter(e => e.type === "call" && e.lead_score);
    if (!calls.length) return 0;
    return Math.round(calls.reduce((s, c) => s + (c.lead_score ?? 0), 0) / calls.length);
  })();

  return (
    <PageShell
      title="Live Monitor"
      eyebrow="Fleet · Real-time"
      subtitle="Active calls, signal presence, and recent fleet activity — refreshing every 10 seconds"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-white/10 text-[9px] uppercase tracking-[0.3em] text-muted/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <button
            onClick={fetchData}
            className="h-9 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Scanning carrier nodes</span>
        </div>
      ) : (
        <div className="h-full flex flex-col gap-3 overflow-hidden">
          {/* Stat row */}
          <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Active Calls"       value={activeCount}       sub="Live right now"        icon={Radio}     accent="#7DF9FF" />
            <StatTile label="Fleet Size"         value={agents.length}     sub="Configured agents"     icon={Users}     accent="#C58BFF" />
            <StatTile label="Recent Activity"    value={todayCallCount}    sub="Events in feed"        icon={Activity}  accent="#FF6BD9" />
            <StatTile label="Avg Lead Score"     value={avgLeadScore}      sub="Recent calls"          icon={Zap}       accent="#4DFFC4" />
          </div>

          {/* Main grid */}
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3">
            {/* Active calls panel */}
            <div className="xl:col-span-5 h-full">
              <Panel
                title="active calls"
                hint={activeCount > 0 ? `${activeCount} live` : "idle"}
                icon={Radio}
                scroll flush
                actions={
                  activeCount > 0 ? (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] uppercase tracking-[0.3em]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {activeCount} active
                    </span>
                  ) : undefined
                }
              >
                <AnimatePresence mode="popLayout">
                  {activeCount === 0 ? (
                    <motion.div key="idle"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full min-h-[200px] flex flex-col items-center justify-center gap-4 text-center px-6 py-12"
                    >
                      <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center">
                        <PhoneOff className="w-7 h-7 text-muted/50" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-display italic lowercase text-2xl text-ink">fleet idle</h3>
                        <p className="text-[10px] uppercase tracking-[0.4em] text-muted/60 max-w-xs">
                          No active calls at this moment. The monitor updates every 10 seconds.
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {signals.map((sig) => (
                        <motion.div
                          key={sig.id}
                          layout
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          className="px-4 py-3.5 hover:bg-white/3 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {/* Live dot */}
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-xl glass border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                <Phone className="w-4 h-4" />
                              </div>
                              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-paper animate-pulse" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display italic text-base text-ink leading-none">
                                  {sig.customer_number || "Unknown"}
                                </span>
                                <span className="text-[9px] uppercase tracking-[0.3em] text-muted/60">
                                  {sig.label || sig.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-muted/70">
                                <span className="inline-flex items-center gap-1">
                                  <Bot className="w-3 h-3 text-brand" />
                                  {agentName(sig.agent_id)}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-[10px] text-emerald-400 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                <ElapsedTimer startedAt={sig.started_at} />
                              </div>
                              <div className="text-[9px] text-muted/60 uppercase tracking-[0.3em] mt-0.5">{sig.type}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </Panel>
            </div>

            {/* Activity feed */}
            <div className="xl:col-span-7 h-full">
              <Panel title="recent activity" hint="Fleet events" icon={Activity} scroll flush>
                <AnimatePresence mode="popLayout">
                  {activity.length === 0 ? (
                    <motion.div key="no-activity"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full min-h-[200px] flex items-center justify-center">
                      <p className="text-[9px] uppercase tracking-[0.5em] text-muted/50">No recent activity</p>
                    </motion.div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {activity.map((ev, idx) => (
                        <motion.div
                          key={`${ev.id}-${idx}`}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="px-4 py-3 hover:bg-white/3 transition-colors group"
                        >
                          <ActivityRow ev={ev} agentName={agentName} />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </Panel>
            </div>
          </div>

          {/* Agent fleet status row */}
          {agents.length > 0 && (
            <div className="shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {agents.map(agent => {
                  const isActive = signals.some(s => s.agent_id === agent.id);
                  return (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass border transition-all",
                        isActive
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-white/10"
                      )}
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        isActive ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                      )} />
                      <div>
                        <p className="text-[11px] text-ink font-medium leading-none mb-0.5">{agent.name}</p>
                        <p className={cn(
                          "text-[9px] uppercase tracking-[0.28em]",
                          isActive ? "text-emerald-400" : "text-muted/50"
                        )}>
                          {isActive ? "on call" : "idle"}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

function ActivityRow({ ev, agentName }: { ev: ActivityEntry; agentName: (id: string) => string }) {
  const isCall = ev.type === "call";
  const Icon = isCall
    ? (ev.direction === "inbound" ? PhoneIncoming : PhoneOutgoing)
    : ev.type === "task" ? AlertCircle
    : Signal;

  const timeStr = new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded-lg glass border flex items-center justify-center shrink-0",
        isCall
          ? ev.direction === "inbound"
            ? "border-brand/30 text-brand"
            : "border-brand-2/30 text-brand-2"
          : "border-white/10 text-muted"
      )}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {ev.customer_number && (
            <Link
              to={`/contact/${encodeURIComponent(ev.customer_number)}`}
              className="font-display italic text-sm text-ink hover:text-brand transition-colors truncate"
            >
              {ev.customer_number}
            </Link>
          )}
          {ev.lead_score != null && ev.lead_score > 0 && (
            <span className={cn(
              "px-1.5 py-0 rounded-full text-[8px] font-mono shrink-0",
              ev.lead_score >= 80 ? "bg-rose-500/15 text-rose-500"
                : ev.lead_score >= 50 ? "bg-brand/15 text-brand"
                : "bg-white/5 text-muted"
            )}>
              {ev.lead_score}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted/60">
          <span className="inline-flex items-center gap-1">
            <Bot className="w-2.5 h-2.5 text-brand" />
            {agentName(ev.agent_id)}
          </span>
          {ev.summary && (
            <span className="truncate max-w-[180px]">{ev.summary}</span>
          )}
          {ev.label && !ev.summary && (
            <span>{ev.label}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[9px] text-muted/60 tabular-nums">{timeStr}</div>
        {isCall && ev.duration_seconds != null && (
          <div className="text-[8px] text-muted/40 tabular-nums">
            {Math.floor(ev.duration_seconds / 60)}m {ev.duration_seconds % 60}s
          </div>
        )}
      </div>

      <ChevronRight className="w-3 h-3 text-muted/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
