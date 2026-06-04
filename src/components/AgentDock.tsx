/**
 * AgentDock — the right-hand "mission control" panel of the chat page.
 *
 * Chat is Wireline's primary control surface, so each agent's chat is framed
 * by a live operational dock that answers three questions at a glance:
 *   1. What has this agent DONE lately?  → the 24h Pulse (calls/texts/emails/
 *      bookings/queued tasks) + the latest call outcomes.
 *   2. What CAN this agent do?           → every capability grouped by the
 *      integration it rides on, with live on/off state mirrored from the
 *      workspace thread.
 *   3. What should I have it do NEXT?    → one-tap action launchers that seed
 *      a structured prompt into the composer (call / email / text / book /
 *      coach / recap). Nothing fires automatically — the operator reviews the
 *      seeded prompt, sends it, and approves the proposal the agent drafts.
 *
 * The dock is read-mostly and side-effect free except for launching prompts;
 * all mutations still flow through the approval-gated workspace endpoints.
 */
import React, { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  PhoneCall,
  MessageCircle,
  Mail,
  CalendarCheck,
  ListTodo,
  Phone,
  CalendarPlus,
  Sparkles,
  BarChart3,
  Zap,
  Check,
  RefreshCw,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { AGENT_TOOL_CATALOG, type AgentToolCatalogEntry } from "../lib/agent-capabilities";

interface Pulse {
  calls: number;
  emails: number;
  texts: number;
  bookings: number;
  openTasks: number;
  windowHours: number;
}
interface RecentCall {
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  outcome: string | null;
  createdAt: string | null;
}
interface OverviewResponse {
  pulse: Pulse;
  recentCalls: RecentCall[];
}

interface AgentDockProps {
  agentId: string;
  agentName: string;
  enabledTools: string[];
  /** Seed a structured prompt into the chat composer (operator confirms + sends). */
  onLaunch: (text: string) => void;
}

// One-tap launchers. Bracketed placeholders are positioned for the operator
// to fill; the agent's planner converts the sent prompt into an approval card.
const QUICK_ACTIONS: ReadonlyArray<{
  icon: React.ElementType;
  label: string;
  text: string;
}> = [
  {
    icon: Phone,
    label: "Place a call",
    text: "Place an outbound call to [name] at [+1 555 000 0000] to [reason for the call].",
  },
  {
    icon: Mail,
    label: "Send email",
    text: "Draft and send an email to [name] at [email@example.com]. Subject: [subject]. Message: [what to say].",
  },
  {
    icon: MessageCircle,
    label: "Send a text",
    text: "Text [name] at [+1 555 000 0000]: [your message].",
  },
  {
    icon: CalendarPlus,
    label: "Book a meeting",
    text: "Book an appointment for [name] on [day & time] for [service].",
  },
  {
    icon: Sparkles,
    label: "Coach tone",
    text: "Warm up your greeting and soften how you handle price objections.",
  },
  {
    icon: BarChart3,
    label: "Recap calls",
    text: "Recap how my recent calls went — wins, objections, and what you'll improve next.",
  },
];

const GROUP_META: Record<AgentToolCatalogEntry["group"], { label: string }> = {
  core: { label: "Core skills" },
  calendar: { label: "Scheduling" },
  crm: { label: "CRM & leads" },
  messaging: { label: "Messaging" },
  team: { label: "Team comms" },
  meetings: { label: "Meetings" },
  ecommerce: { label: "Commerce" },
};

const GROUP_ORDER: ReadonlyArray<AgentToolCatalogEntry["group"]> = [
  "core",
  "messaging",
  "calendar",
  "crm",
  "meetings",
  "team",
  "ecommerce",
];

function sentimentTone(sentiment: string | null): string {
  const s = (sentiment || "").toLowerCase();
  if (s.includes("pos")) return "bg-emerald-500";
  if (s.includes("neg")) return "bg-rose-500";
  return "bg-amber-400";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function AgentDock({ agentId, agentName, enabledTools, onLaunch }: AgentDockProps) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!agentId) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/overview`);
        if (!r.ok) throw new Error("overview failed");
        const data = (await r.json()) as OverviewResponse;
        setOverview(data);
      } catch {
        // Dock is non-critical; leave the last good snapshot in place.
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agentId],
  );

  useEffect(() => {
    setLoading(true);
    setOverview(null);
    load("initial");
  }, [load]);

  // Light refresh: when the operator returns to the tab + a slow interval.
  useEffect(() => {
    const onFocus = () => load("refresh");
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(() => load("refresh"), 90_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [load]);

  const enabled = new Set(enabledTools);
  const enabledCount = AGENT_TOOL_CATALOG.filter((t) => enabled.has(t.name)).length;

  const pulse = overview?.pulse;
  const stats: ReadonlyArray<{ icon: React.ElementType; label: string; value: number }> = [
    { icon: PhoneCall, label: "Calls", value: pulse?.calls ?? 0 },
    { icon: MessageCircle, label: "Texts", value: pulse?.texts ?? 0 },
    { icon: Mail, label: "Emails", value: pulse?.emails ?? 0 },
    { icon: CalendarCheck, label: "Booked", value: pulse?.bookings ?? 0 },
    { icon: ListTodo, label: "Tasks", value: pulse?.openTasks ?? 0 },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-black/8 glass overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
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
          className="shrink-0 min-w-[44px] min-h-[44px] w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
          title="Refresh"
          aria-label="Refresh dock"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5 scrollbar-hide">
        {/* Pulse */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
            Pulse · last {pulse?.windowHours ?? 24}h
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 stagger-children">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-black/8 bg-paper/50 px-1.5 py-2 flex flex-col items-center text-center"
              >
                <s.icon className="w-3.5 h-3.5 text-brand/80 mb-1" />
                <span className="text-[15px] font-display leading-none text-ink tabular-nums">
                  {loading ? (
                    <span className="inline-block w-4 h-3 rounded bg-black/8 animate-pulse" />
                  ) : (
                    s.value
                  )}
                </span>
                <span className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-muted/70">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
            Launch an action
          </p>
          <div className="grid grid-cols-2 gap-1.5 stagger-children">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => onLaunch(a.text)}
                className="group flex items-center gap-2 rounded-xl border border-black/8 glass px-2.5 py-2 text-left hover:border-brand/40 hover:bg-brand/[0.04] hover:-translate-y-px transition-all duration-300"
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
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-colors",
                            on
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 cursor-default"
                              : "bg-black/3 border-black/8 text-muted/70 hover:border-brand/40 hover:text-ink",
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

        {/* Recent call outcomes */}
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
                  className="rounded-xl border border-black/8 bg-paper/40 px-2.5 py-2"
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
                    <p className="text-[10px] text-muted leading-snug line-clamp-2">{c.summary}</p>
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
