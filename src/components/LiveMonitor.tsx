/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Radio,
  Phone,
  Clock,
  Bot,
  RefreshCw,
  PhoneIncoming,
  PhoneOutgoing,
  Activity,
  Signal,
  Users,
  Zap,
  AlertCircle,
  PhoneOff,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatTime, safeDate } from "../lib/safe-date";
import PageShell, { Panel, StatTile } from "./PageShell";

const POLL_INTERVAL_MS = 10_000;

/**
 * Sentiment labels emitted by server.ts (conversation-update handler) that
 * indicate a call is in distress. Must stay in sync with the label strings
 * set in server.ts around the negativeHits/liveSentimentLabel logic.
 */
const DISTRESS_LABEL_PREFIXES = ["⚠", "frustrated"] as const;

/** Returns true when a live signal label indicates a distressed call. */
function isDistressedLabel(label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return DISTRESS_LABEL_PREFIXES.some((p) => l.includes(p.toLowerCase()));
}

type SignalEntry = {
  id: string; // call_id
  agent_id: string;
  customer_number: string;
  status: string;
  label: string;
  type: string; // 'voice' | 'email'
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
  // safeDate handles Postgres-style "YYYY-MM-DD HH:MM:SS+00" + nullish.
  const startMs = (safeDate(startedAt) ?? new Date()).getTime();
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.max(0, Math.floor((Date.now() - startMs) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [startMs]);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="tabular-nums font-mono">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

/** Real-time wall clock */
function WallClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono tabular-nums text-[10px] text-muted/70">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

/** Color-coded sentiment badge for live calls */
function SentimentBadge({ label, status }: { label?: string; status?: string }) {
  const text = label || status || "Live";
  if (text.includes("Frustrated")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.25em] bg-rose-500/15 border border-rose-500/30 text-rose-500">
        <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
        {text}
      </span>
    );
  }
  if (text.includes("Tense")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.25em] bg-amber-500/15 border border-amber-500/30 text-amber-600">
        <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
        {text}
      </span>
    );
  }
  if (text.includes("Closing")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.25em] bg-violet-500/15 border border-violet-500/30 text-violet-600">
        <span className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
        {text}
      </span>
    );
  }
  if (text.includes("Positive")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.25em] bg-emerald-500/15 border border-emerald-500/30 text-emerald-600">
        <span className="w-1 h-1 rounded-full bg-emerald-500" />
        {text}
      </span>
    );
  }
  if (text.includes("Engaged")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.25em] bg-brand/15 border border-brand/30 text-brand">
        <span className="w-1 h-1 rounded-full bg-brand" />
        {text}
      </span>
    );
  }
  // Default: aurora badge
  return <span className="badge-aurora">{text}</span>;
}

/** Animated ring for an active call */
function PulseRing({ size = 40 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Outer animated ring 1 */}
      <div
        className="absolute rounded-full border border-emerald-400/40"
        style={{
          inset: -8,
          animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
        }}
      />
      {/* Outer animated ring 2 (delayed) */}
      <div
        className="absolute rounded-full border border-emerald-400/20"
        style={{
          inset: -14,
          animation: "ping 1.4s cubic-bezier(0,0,0.2,1) 0.5s infinite",
        }}
      />
      {/* Core icon */}
      <div className="w-full h-full rounded-xl glass border border-emerald-500/40 flex items-center justify-center text-emerald-600">
        <Phone className="w-4 h-4" />
      </div>
    </div>
  );
}

export default function LiveMonitor() {
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [_lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // mountedRef tracks whether the LiveMonitor is still alive; both the
  // initial fetch and the 10s poll bail before setState if it flipped
  // false during an in-flight request. AbortController cancels the
  // network leg cleanly so authFetch's deadline timer drains too.
  const mountedRef = useRef(true);

  const fetchData = async (signal: AbortSignal) => {
    try {
      const [signalRes, activityRes, agentsRes] = await Promise.all([
        authFetch("/api/fleet/presence", { signal }).then((r) => r.json()),
        authFetch("/api/fleet/activity", { signal }).then((r) => r.json()),
        authFetch("/api/agents", { signal }).then((r) => r.json()),
      ]);
      if (!mountedRef.current) return;
      setSignals(signalRes.signals || []);
      setActivity(activityRes.activity || []);
      setAgents(agentsRes.agents || []);
      setLastRefresh(new Date());
    } catch (e: any) {
      // Aborted fetches (user navigated away) + transient "Failed to fetch"
      // network blips are not real failures — they fire whenever the
      // component unmounts mid-request. Stay quiet.
      if (e?.name === "AbortError") return;
      const msg = String(e?.message || "");
      if (msg.includes("Failed to fetch")) return;
      if (mountedRef.current) console.error("LiveMonitor fetch failed:", e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetchData(controller.signal);
    intervalRef.current = setInterval(() => fetchData(controller.signal), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      controller.abort();
    };
  }, []);

  const agentName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  };

  const activeCount = signals.length;
  const todayCallCount = activity.filter((e) => e.type === "call").length;
  const avgLeadScore = (() => {
    const calls = activity.filter((e) => e.type === "call" && e.lead_score);
    if (!calls.length) return 0;
    return Math.round(calls.reduce((s, c) => s + (c.lead_score ?? 0), 0) / calls.length);
  })();

  return (
    <PageShell
      title="Live Monitor"
      eyebrow="Fleet · Real-time"
      subtitle="Active calls and recent fleet activity — refreshing every 10 seconds"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-black/10 text-[9px] uppercase tracking-[0.3em] text-muted/70">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            Live · <WallClock />
          </div>
          <button
            onClick={() => {
              const c = new AbortController();
              fetchData(c.signal);
            }}
            className="h-9 px-3 rounded-full glass border border-black/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <div className="relative w-14 h-14">
            <div
              className="absolute inset-0 rounded-full opacity-40"
              style={{
                background:
                  "conic-gradient(from 0deg, #0A0A0A, #0A0A0A, #0A0A0A, #10B981, #0A0A0A)",
                filter: "blur(1px)",
                animation: "spin 2s linear infinite",
              }}
            />
            <div className="absolute inset-1.5 rounded-full bg-paper" />
            <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
              <Radio className="w-4 h-4 text-brand animate-pulse" />
            </div>
          </div>
          <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60">
            Establishing connection…
          </p>
        </div>
      ) : (
        <div className="h-full flex flex-col gap-2 overflow-hidden">
          {/* Distress alert banner — appears when any active call hits frustrated/tense state */}
          {(() => {
            const distressedCalls = signals.filter((s) => isDistressedLabel(s.label));
            if (distressedCalls.length === 0) return null;
            return (
              <motion.div
                key="distress-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/8"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-rose-500 uppercase tracking-[0.28em]">
                    Distress signal
                    {distressedCalls.length > 1 ? `s (${distressedCalls.length})` : ""} detected
                  </span>
                  <span className="text-[9px] text-rose-500/70 ml-2">
                    {distressedCalls.map((s) => agentName(s.agent_id)).join(", ")} — consider
                    escalating to human
                  </span>
                </div>
                <span className="text-[8px] uppercase tracking-[0.3em] text-rose-500/60 shrink-0">
                  De-escalate → Acknowledge → Escalate
                </span>
              </motion.div>
            );
          })()}

          {/* Stat row */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2">
            <StatTile
              label="Active Calls"
              value={activeCount}
              sub="Live right now"
              icon={Radio}
              accent="#0A0A0A"
            />
            <StatTile
              label="Fleet Size"
              value={agents.length}
              sub="Configured agents"
              icon={Users}
              accent="#0A0A0A"
            />
            <StatTile
              label="Recent Activity"
              value={todayCallCount}
              sub="Events in feed"
              icon={Activity}
              accent="#0A0A0A"
            />
            <StatTile
              label="Avg Lead Score"
              value={avgLeadScore}
              sub="Recent calls"
              icon={Zap}
              accent="#10B981"
            />
          </div>

          {/* Main grid */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* Active calls panel */}
            <div className="lg:col-span-5 h-full">
              <Panel
                title="Active Calls"
                hint={activeCount > 0 ? `${activeCount} live` : "idle"}
                icon={Radio}
                scroll
                flush
                actions={
                  activeCount > 0 ? (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[8px] uppercase tracking-[0.3em]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {activeCount} active
                    </span>
                  ) : undefined
                }
              >
                <AnimatePresence mode="popLayout">
                  {activeCount === 0 ? (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full min-h-[160px] flex flex-col items-center justify-center gap-4 text-center px-6 py-12"
                    >
                      {/* Animated idle rings */}
                      <div className="relative w-16 h-16">
                        <div
                          className="absolute inset-0 rounded-2xl opacity-15"
                          style={{
                            background: "#0A0A0A",
                            animation: "pulse 3s ease-in-out infinite",
                          }}
                        />
                        <div className="w-full h-full rounded-2xl glass border border-black/8 flex items-center justify-center">
                          <PhoneOff className="w-7 h-7 text-muted/60" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-display italic lowercase text-2xl text-ink/70">Idle</h3>
                        <p className="text-[9px] sm:app-section-title/65 max-w-[240px] sm:max-w-[180px]">
                          No active calls right now
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
                          className="relative px-3 py-2 hover:bg-white/[0.03] transition-colors overflow-hidden"
                        >
                          {/* Green ambient glow for active call */}
                          <div
                            className="absolute -left-4 top-0 bottom-0 w-1 rounded-r-full bg-emerald-400"
                            style={{ boxShadow: "0 0 16px rgba(52,211,153,0.8)" }}
                          />
                          <div className="flex items-center gap-3.5 pl-2">
                            <PulseRing />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-display italic text-base text-ink leading-none">
                                  {sig.customer_number || "Unknown"}
                                </span>
                                <SentimentBadge label={sig.label} status={sig.status} />
                              </div>
                              <div className="flex items-center gap-3 text-[9px] text-muted/60 mt-0.5">
                                <span className="inline-flex items-center gap-1">
                                  <Bot className="w-2.5 h-2.5 text-brand" />
                                  {agentName(sig.agent_id)}
                                </span>
                                <span className="uppercase tracking-[0.25em]">{sig.type}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[11px] text-emerald-600 flex items-center gap-1.5 font-mono tabular-nums">
                                <Clock className="w-3 h-3" />
                                <ElapsedTimer startedAt={sig.started_at} />
                              </div>
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
            <div className="lg:col-span-7 h-full">
              <Panel title="Recent Activity" hint="Fleet events" icon={Activity} scroll flush>
                <AnimatePresence mode="popLayout">
                  {activity.length === 0 ? (
                    <motion.div
                      key="no-activity"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full min-h-[160px] flex items-center justify-center"
                    >
                      <p className="text-[9px] uppercase tracking-[0.5em] text-muted/65">
                        No recent activity
                      </p>
                    </motion.div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {activity.map((ev, idx) => (
                        <motion.div
                          key={`${ev.id}-${idx}`}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="px-3 py-2 hover:bg-white/3 transition-colors group"
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
                {agents.map((agent) => {
                  const isActive = signals.some((s) => s.agent_id === agent.id);
                  return (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass border transition-all",
                        isActive ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10",
                      )}
                    >
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          isActive ? "bg-emerald-400 animate-pulse" : "bg-white/20",
                        )}
                      />
                      <div>
                        <p className="text-[11px] text-ink font-medium leading-none mb-0.5">
                          {agent.name}
                        </p>
                        <p
                          className={cn(
                            "text-[9px] uppercase tracking-[0.28em]",
                            isActive ? "text-emerald-600" : "text-muted/65",
                          )}
                        >
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
    ? ev.direction === "inbound"
      ? PhoneIncoming
      : PhoneOutgoing
    : ev.type === "task"
      ? AlertCircle
      : Signal;

  const timeStr = formatTime(ev.created_at, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-8 h-8 rounded-lg glass border flex items-center justify-center shrink-0",
          isCall
            ? ev.direction === "inbound"
              ? "border-brand/30 text-brand"
              : "border-brand-2/30 text-brand-2"
            : "border-white/10 text-muted",
        )}
      >
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
            <span
              className={cn(
                "px-1.5 py-0 rounded-full text-[8px] font-mono shrink-0",
                ev.lead_score >= 80
                  ? "bg-rose-500/15 text-rose-500"
                  : ev.lead_score >= 50
                    ? "bg-brand/15 text-brand"
                    : "bg-white/5 text-muted",
              )}
            >
              {ev.lead_score}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted/60">
          <span className="inline-flex items-center gap-1">
            <Bot className="w-2.5 h-2.5 text-brand" />
            {agentName(ev.agent_id)}
          </span>
          {ev.summary && <span className="truncate max-w-[180px]">{ev.summary}</span>}
          {ev.label && !ev.summary && <span>{ev.label}</span>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[9px] text-muted/60 tabular-nums">{timeStr}</div>
        {isCall && ev.duration_seconds != null && (
          <div className="text-[8px] text-muted/60 tabular-nums">
            {Math.floor(ev.duration_seconds / 60)}m {ev.duration_seconds % 60}s
          </div>
        )}
      </div>

      <ChevronRight className="w-3 h-3 text-muted/55 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
