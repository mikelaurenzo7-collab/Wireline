import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Check,
  Phone,
  Sparkles,
  FileText,
  Search,
  Target,
  BarChart3,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";

interface AgentDockProps {
  agentId: string;
  agentName: string;
  enabledTools: string[];
  onLaunch: (text: string) => void;
}

interface PulseStat {
  label: string;
  value: number;
  icon: typeof Activity;
}

const QUICK_ACTIONS = [
  { icon: Sparkles, label: "Take control", text: "Take control of this call and talk" },
  { icon: FileText, label: "Regenerate response", text: "Regenerate your last response" },
  {
    icon: Target,
    label: "Commit to memory",
    text: "Remember this customer's name and preferences",
  },
  { icon: Search, label: "Look up", text: "Look up recent interactions with this caller" },
] as const;

const GROUP_META: Record<string, { label: string }> = {
  voice: { label: "Voice" },
  messaging: { label: "Messaging" },
  data: { label: "Data" },
  calendar: { label: "Calendar" },
};

const GROUP_ORDER = ["voice", "messaging", "data", "calendar"];

function sentimentTone(sentiment: string | null | undefined) {
  switch (sentiment?.toLowerCase()) {
    case "positive":
      return "bg-emerald-500";
    case "negative":
      return "bg-rose-500";
    default:
      return "bg-amber-400";
  }
}

function relativeTime(dateStr: string | null) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const d = Math.floor(hrs / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

export default function AgentDock({
  agentId,
  agentName,
  enabledTools,
  onLaunch,
}: AgentDockProps) {
  const [pulse, setPulse] = useState<{ windowHours: number } | null>(null);
  const [overview, setOverview] = useState<{
    recentCalls: Array<{
      summary?: string;
      sentiment?: string;
      intent?: string;
      outcome?: string;
      createdAt: string | null;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const enabled = new Set(enabledTools as AgentToolName[]);
  const enabledCount = Array.from(enabled).filter((t) =>
    AGENT_TOOL_CATALOG.some((c) => c.name === t),
  ).length;

  const stats: PulseStat[] = [
    {
      label: "Calls",
      value: overview?.recentCalls.length ?? 0,
      icon: Phone,
    },
    {
      label: "Avg time",
      value: 0,
      icon: Activity,
    },
    {
      label: "Positive",
      value: (overview?.recentCalls ?? []).filter(
        (c) => c.sentiment?.toLowerCase() === "positive",
      ).length,
      icon: TrendingUp,
    },
    {
      label: "Negative",
      value: (overview?.recentCalls ?? []).filter(
        (c) => c.sentiment?.toLowerCase() === "negative",
      ).length,
      icon: TrendingDown,
    },
    {
      label: "Tools",
      value: enabledCount,
      icon: Zap,
    },
  ];

  const load = async (kind: "init" | "refresh") => {
    if (kind === "refresh") setRefreshing(true);
    try {
      const [pulseRes, overviewRes] = await Promise.all([
        authFetch(`/api/agents/${encodeURIComponent(agentId)}/pulse`),
        authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/overview`),
      ]);
      if (pulseRes.ok) setPulse(await pulseRes.json());
      if (overviewRes.ok) setOverview(await overviewRes.json());
    } catch {
      /* non-critical */
    } finally {
      if (kind === "refresh") setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load("init");
  }, [agentId]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-brand/[0.10]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 flex w-8 h-8 items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
            <Activity className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-ink truncate leading-tight">
              Mission control
            </p>
            <p className="flex items-center gap-1.5 text-[10px] text-muted leading-tight">
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="truncate">{agentName} · live</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => load("refresh")}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
          title="Refresh"
          aria-label="Refresh dock"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5 scrollbar-hide">
        {/* Pulse — horizontal stat strip, no boxes */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-3">
            Pulse · last {pulse?.windowHours ?? 24}h
          </p>
          <div className="flex items-center justify-between gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center gap-0.5 min-w-0 flex-1"
              >
                <s.icon className="w-3.5 h-3.5 text-brand/60" />
                <span className="text-[15px] font-display leading-none text-ink tabular-nums">
                  {loading ? (
                    <span className="inline-block w-4 h-3 bg-black/8 animate-pulse" />
                  ) : (
                    s.value
                  )}
                </span>
                <span className="text-[9px] uppercase tracking-[0.12em] text-muted/60">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions — no glass on each button */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
            Launch an action
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => onLaunch(a.text)}
                className="group flex items-center gap-2 border border-black/[0.06] dark:border-brand/[0.10] px-2.5 py-2 text-left hover:border-brand/40 hover:bg-brand/[0.04] hover:-translate-y-px transition-all duration-300"
              >
                <a.icon className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="text-[11px] font-medium text-ink truncate">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-muted/70 leading-relaxed">
            Seeds a draft into the composer — you review and send, the agent proposes, you approve.
          </p>
        </section>

        {/* Capabilities by integration */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70">
              Capabilities
            </p>
            <span className="text-[9px] uppercase tracking-[0.18em] text-brand/80">
              {enabledCount}/{AGENT_TOOL_CATALOG.length} on
            </span>
          </div>
          <div className="space-y-3">
            {GROUP_ORDER.map((group) => {
              const items = AGENT_TOOL_CATALOG.filter((t) => t.group === group);
              if (items.length === 0) return null;
              const onCount = items.filter((t) => enabled.has(t.name)).length;
              return (
                <div key={group}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-ink/80">
                      {GROUP_META[group].label}
                    </span>
                    <span className="text-[9px] text-muted/60 tabular-nums">
                      {onCount}/{items.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((t) => {
                      const on = enabled.has(t.name);
                      return (
                        <button
                          key={t.name}
                          title={
                            on
                              ? t.description
                              : `${t.description}\n\nTap to ask ${agentName} to turn this on.`
                          }
                          onClick={() =>
                            on ? undefined : onLaunch(`Turn on ${t.label.toLowerCase()}.`)
                          }
                          disabled={on}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 text-[10px] border transition-colors",
                            on
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 cursor-default"
                              : "bg-black/[0.02] border-black/[0.06] text-muted/70 hover:border-brand/40 hover:text-ink",
                          )}
                        >
                          {on ? <Check className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent call outcomes — unified surface */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
            Latest calls
          </p>
          {overview && overview.recentCalls.length === 0 ? (
            <p className="text-[11px] text-muted/70 leading-relaxed">
              No calls yet. When {agentName} starts taking calls, the latest outcomes show here.
            </p>
          ) : (
            <div className="space-y-1.5">
              {(overview?.recentCalls ?? []).map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  className="border border-black/[0.06] dark:border-brand/[0.10] px-2.5 py-2"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        sentimentTone(c.sentiment),
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] font-medium text-ink/80 truncate flex-1">
                      {c.outcome || c.intent || "Call"}
                    </span>
                    <span className="text-[9px] text-muted/60 shrink-0">
                      {relativeTime(c.createdAt)}
                    </span>
                  </div>
                  {c.summary && (
                    <p className="text-[10px] text-muted leading-snug line-clamp-2">
                      {c.summary}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}