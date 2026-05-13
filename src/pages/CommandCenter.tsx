import React, { useState, useEffect, useRef, useCallback } from "react";
import { LayoutGrid, RefreshCw, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { LiveMonitor } from "../components/CommandCenter/LiveMonitor";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import PageTransition from "../components/layout/PageTransition";
import { authFetch } from "../lib/api";
import type { SignalPresence, FleetTask, DashboardStats } from "../types/api";

// ── Type conversions ──────────────────────────────────────────────────────────

type LiveCall = {
  id: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
};

type ActionItem = {
  id: string;
  type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string;
  created_at: string;
};

function signalToCall(s: SignalPresence): LiveCall {
  const label = s.label ?? "Live · Active";
  const escalated = label.startsWith("⚠") || label.startsWith("🚨");
  return {
    id: s.id,
    customer_number: s.customer_number ?? "Unknown caller",
    sentiment_label: label,
    urgency: escalated ? 8 : 3,
    status: escalated ? "escalated" : "active",
  };
}

// Maps fleet task_type strings to the ActionFeed's fixed icon set.
const TASK_TYPE_MAP: Record<string, ActionItem["type"]> = {
  follow_up: "send_email",
  email: "send_email",
  call_back: "schedule_calendar",
  schedule: "schedule_calendar",
  appointment: "schedule_calendar",
  crm_update: "update_crm_lead",
  compliance_review: "create_internal_task",
  review: "create_internal_task",
  escalation: "create_internal_task",
};

function taskToAction(t: FleetTask): ActionItem {
  const mapped = TASK_TYPE_MAP[t.task_type] ?? "create_internal_task";
  return {
    id: t.id,
    type: mapped,
    priority: t.priority,
    status:
      t.status === "completed" ? "completed" : t.status === "cancelled" ? "failed" : "pending",
    description: t.description ?? t.task_type,
    created_at: t.created_at,
  };
}

// ── Sentiment colours ─────────────────────────────────────────────────────────
const SENTIMENT_COLORS = {
  positive: "#10B981",
  neutral: "#9B59F5",
  negative: "#E040C0",
};

const PRESENCE_POLL_MS = 10_000; // live-call panel refreshes every 10 s

export default function CommandCenter() {
  const mountedRef = useRef(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [presenceRes, tasksRes, statsRes] = await Promise.all([
        authFetch("/api/fleet/presence").then((r) => r.json()),
        authFetch("/api/fleet/tasks?status=pending").then((r) => r.json()),
        authFetch("/api/dashboard/stats").then((r) => r.json()),
      ]);
      if (!mountedRef.current) return;
      setCalls((presenceRes.signals ?? []).map(signalToCall));
      setActions((tasksRes.tasks ?? []).slice(0, 20).map(taskToAction));
      setStats(statsRes as DashboardStats);
    } catch {
      // Non-critical background data — fail silently; stale data stays visible.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Refresh only live calls on the fast interval; stats + tasks poll slower.
  const fetchPresence = useCallback(async () => {
    try {
      const res = await authFetch("/api/fleet/presence");
      const data = await res.json();
      if (mountedRef.current) setCalls((data.signals ?? []).map(signalToCall));
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    const fastTimer = setInterval(fetchPresence, PRESENCE_POLL_MS);
    const slowTimer = setInterval(fetchAll, 60_000);
    return () => {
      mountedRef.current = false;
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, [fetchAll, fetchPresence]);

  const refresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  };

  // Build chart data from stats
  const sentimentData = stats
    ? [
        {
          name: "Positive",
          value: stats.sentimentBreakdown?.positive ?? 0,
          color: SENTIMENT_COLORS.positive,
        },
        {
          name: "Neutral",
          value: stats.sentimentBreakdown?.neutral ?? 0,
          color: SENTIMENT_COLORS.neutral,
        },
        {
          name: "Negative",
          value: stats.sentimentBreakdown?.negative ?? 0,
          color: SENTIMENT_COLORS.negative,
        },
      ].filter((d) => d.value > 0)
    : [];

  const volumeData = stats?.chartData ?? [];

  const totalSentiment = sentimentData.reduce((s, d) => s + d.value, 0);

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <LayoutGrid className="w-8 h-8 text-indigo-500" />
              Omnichannel Command Center
            </h1>
            <p className="text-zinc-500 mt-1">
              Unified real-time visibility across your entire fleet.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-400">
                Security: SOC 2 Compliant
              </span>
            </div>
            <button
              onClick={refresh}
              disabled={isRefreshing || loading}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw
                className={clsx("w-5 h-5 text-zinc-400", isRefreshing && "animate-spin")}
              />
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Monitor (2/3 width) */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
              <LiveMonitor calls={calls} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Sentiment Pie */}
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-4">
                  Sentiment Distribution
                </h3>
                {sentimentData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-2 text-zinc-700 text-sm italic">
                    <span>No call data yet</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={160}>
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={68}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {sentimentData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #27272a",
                            borderRadius: "8px",
                            fontSize: "11px",
                          }}
                          formatter={(v: number) => [`${v} call${v !== 1 ? "s" : ""}`, ""]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 min-w-0">
                      {sentimentData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: d.color }}
                          />
                          <span className="text-xs text-zinc-400 truncate">{d.name}</span>
                          <span className="ml-auto text-xs font-bold text-zinc-300 tabular-nums">
                            {totalSentiment > 0
                              ? `${Math.round((d.value / totalSentiment) * 100)}%`
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Volume Area Chart */}
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-4">
                  Volume Overview
                </h3>
                {volumeData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-2 text-zinc-700 text-sm italic">
                    <span>No volume data yet</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart
                      data={volumeData}
                      margin={{ top: 4, right: 0, left: -24, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ccSignals" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0AC8D4" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0AC8D4" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="ccLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9B59F5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#9B59F5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#52525b", fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#52525b", fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#18181b",
                          border: "1px solid #27272a",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                        labelStyle={{ color: "#a1a1aa" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="signals"
                        name="Calls"
                        stroke="#0AC8D4"
                        fill="url(#ccSignals)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="leads"
                        name="Leads"
                        stroke="#9B59F5"
                        fill="url(#ccLeads)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Action Sidebar (1/3 width) */}
          <div className="lg:col-span-1">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm h-full sticky top-8">
              <ActionFeed actions={actions} />
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
