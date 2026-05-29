/**
 * DirectorDock — the right-hand "mission control" panel of the Director chat.
 *
 * The Director is the boss of the whole fleet, so its dock is account-level
 * (not scoped to one agent). It answers, at a glance:
 *   1. How is the operation doing?   → 7-day fleet pulse (calls / bookings /
 *      agents) pulled live from the account.
 *   2. Pull anything, fast.          → one-tap jumps to every operational
 *      surface — call logs, analytics, live ops, appointments, triage,
 *      pipeline, inbox, SMS — so the operator never hunts through nav.
 *   3. What just happened?           → the latest calls across every agent.
 *
 * Read-only + navigation only. Mirrors AgentDock so the Director feels like the
 * same product, one level up.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Compass,
  PhoneCall,
  CalendarCheck,
  Users,
  LayoutGrid,
  Radio,
  BarChart3,
  Inbox,
  MessageCircle,
  Kanban,
  Headphones,
  CalendarClock,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "../lib/utils";
import { relativeTime, sentimentTone } from "../lib/call-format";
import type { DirectorOverview } from "./DirectorWorkspace";

// Quick-pull launchers — every operational surface the operator might want to
// open straight from the Director chat. Ordered by daily-driver frequency.
const QUICK_PULLS: ReadonlyArray<{
  icon: React.ElementType;
  label: string;
  to: string;
}> = [
  { icon: Radio, label: "Call logs", to: "/logs" },
  { icon: BarChart3, label: "Analytics", to: "/insights" },
  { icon: LayoutGrid, label: "Live Ops", to: "/ops" },
  { icon: CalendarClock, label: "Appointments", to: "/appointments" },
  { icon: Inbox, label: "Triage", to: "/triage" },
  { icon: Kanban, label: "Pipeline", to: "/pipeline" },
  { icon: MessageCircle, label: "SMS", to: "/sms" },
  { icon: Headphones, label: "Cockpit", to: "/cockpit" },
];

interface DirectorDockProps {
  /** Account overview, owned by the parent (AgentChat) and shared with the
   *  Director workspace so the dock never fetches it a second time. */
  overview: DirectorOverview | null;
  loading: boolean;
  /** Re-fetch the shared overview (refresh button + focus/interval). */
  onRefresh: () => void | Promise<void>;
}

export default function DirectorDock({ overview, loading, onRefresh }: DirectorDockProps) {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  // Light refresh: on tab focus + a slow interval, like AgentDock.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(() => void refresh(), 90_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [refresh]);

  const stats = overview?.stats;
  const fleetCount = overview?.fleet.length ?? 0;
  const pulse: ReadonlyArray<{ icon: React.ElementType; label: string; value: number }> = [
    { icon: PhoneCall, label: "Calls", value: stats?.calls7d ?? 0 },
    { icon: CalendarCheck, label: "Booked", value: stats?.bookings7d ?? 0 },
    { icon: Users, label: "Agents", value: fleetCount },
  ];
  const recentCalls = overview?.recentCalls ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl border border-black/8 glass overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/8">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 text-brand shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink truncate">Mission control</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70 truncate">
              Your whole operation
            </p>
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
          title="Refresh"
          aria-label="Refresh dock"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5 scrollbar-hide">
        {/* Fleet pulse */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
            Fleet pulse · last 7 days
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {pulse.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-black/8 bg-paper/50 px-1.5 py-2.5 flex flex-col items-center text-center"
              >
                <s.icon className="w-3.5 h-3.5 text-brand/80 mb-1" />
                <span className="text-[16px] font-display leading-none text-ink tabular-nums">
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

        {/* Quick pulls — open any surface straight from the chat */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">Pull it up</p>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PULLS.map((q) => (
              <button
                key={q.label}
                onClick={() => navigate(q.to)}
                className="group flex items-center gap-2 rounded-xl border border-black/8 glass px-2.5 py-2 text-left hover:border-brand/40 hover:bg-brand/[0.04] transition-all"
              >
                <q.icon className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="text-[11px] font-medium text-ink truncate flex-1">{q.label}</span>
                <ArrowUpRight className="w-3 h-3 text-muted/40 group-hover:text-brand transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </section>

        {/* Latest calls across the fleet */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted/70">Latest calls</p>
            <button
              onClick={() => navigate("/logs")}
              className="text-[10px] text-brand hover:text-brand/80 transition-colors"
            >
              View all
            </button>
          </div>
          {!loading && recentCalls.length === 0 ? (
            <p className="text-[11px] text-muted/70 leading-relaxed">
              No calls yet. When your fleet starts taking calls, the latest outcomes show here.
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentCalls.map((c, i) => (
                <motion.button
                  key={i}
                  onClick={() => navigate("/logs")}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  className="w-full text-left rounded-xl border border-black/8 bg-paper/40 px-2.5 py-2 hover:border-brand/30 transition-colors"
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
                      {c.outcome || (c.intent && c.intent !== "none" ? c.intent : "Call")}
                    </span>
                    <span className="text-[9px] text-muted/60 shrink-0">
                      {relativeTime(c.createdAt)}
                    </span>
                  </div>
                  {c.summary && (
                    <p className="text-[10px] text-muted leading-snug line-clamp-2">{c.summary}</p>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
