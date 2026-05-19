import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid,
  Activity,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Zap,
  Globe,
  Cpu,
  Lock,
  Bell,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNavigate } from "react-router-dom";
import { log } from "../lib/server-logger";
import { authFetch } from "../lib/api";
import { LiveMonitor } from "../components/CommandCenter/LiveMonitor";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import OnboardingQuickstart from "../components/OnboardingQuickstart";
import PageTransition from "../components/layout/PageTransition";
import { clsx } from "clsx";
import { motion } from "motion/react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SignalPresence = {
  id: string;
  customer_number: string;
  label: string;
  urgency: number;
  status: "active" | "escalated";
  started_at: string;
};

type LiveCall = {
  id: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
  thought?: string;
};

type ActionItem = {
  id: string;
  type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string;
  created_at: string;
  payload?: any;
  reasoning?: string;
};

type LeadDossier = {
  customer_number: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  bio?: string;
  linked_in_url?: string;
};

// â”€â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SENTIMENT_COLORS = {
  positive: "#10b981", // emerald-500
  neutral: "#6366f1", // indigo-500
  negative: "#f43f5e", // rose-500
};

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CommandCenter() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const navigate = useNavigate();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, LeadDossier>>({});
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activatingGrowth, setActivatingGrowth] = useState(false);
  const mountedRef = useRef(true);

  const fetchPresence = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authFetch("/api/fleet/presence");
      if (!res.ok) throw new Error("Presence fetch failed");

      const { signals } = await res.json();

      if (mountedRef.current) {
        setCalls(
          (signals || []).map((s: any) => ({
            id: s.id,
            customer_number: s.customer_number,
            sentiment_label: s.label || "Connected",
            urgency: s.urgency || 0,
            status: s.status === "escalated" ? "escalated" : "active",
          })),
        );

        // Fetch dossiers for new numbers
        const numbers = (signals || [])
          .map((s: any) => s.customer_number)
          .filter((n: string) => !dossiers[n]);
        if (numbers.length > 0) {
          const dossRes = await authFetch(`/api/dashboard/dossiers?numbers=${numbers.join(",")}`);
          if (dossRes.ok) {
            const { dossiers: newDossData } = await dossRes.json();
            setDossiers((prev) => ({ ...prev, ...newDossData }));
          }
        }
      }
    } catch (err: any) {
      // Aborted / transient fetches are expected (navigation, intervals
      // racing component unmount) â€” only log unexpected failures.
      const msg = String(err?.message || "");
      if (err?.name === "AbortError" || msg.includes("Failed to fetch")) return;
      log.error("Failed to fetch live presence", { err });
    }
  }, [user, dossiers]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    try {
      // `/api/fleet/stats` was a phantom endpoint â€” it was never declared
      // on the server, so the Command Center showed perpetual "Awaiting
      // data" with 404s in the Network tab. `/api/dashboard/stats` returns
      // the same shape (sentimentBreakdown / unitEconomics / agents â€¦).
      const [actionsRes, statsRes] = await Promise.all([
        authFetch("/api/fleet/tasks"),
        authFetch("/api/dashboard/stats"),
      ]);

      const { tasks: actionsData } = await actionsRes.json();
      const statsData = await statsRes.json();

      if (mountedRef.current) {
        setActions(
          (actionsData || []).map((t: any) => ({
            id: t.id,
            type: t.task_type,
            priority: t.priority,
            status:
              t.status === "completed"
                ? "completed"
                : t.status === "cancelled"
                  ? "failed"
                  : "pending",
            description: t.description ?? t.task_type,
            created_at: t.created_at,
            payload: t.payload,
            reasoning: t.resolution_notes,
          })),
        );
        setStats(statsData);
      }
    } catch (err: any) {
      // Suppress aborted-fetch noise â€” they fire on every page navigation.
      const msg = String(err?.message || "");
      if (err?.name === "AbortError" || msg.includes("Failed to fetch")) {
        // expected when user navigates mid-request
      } else {
        log.error("Command Center data fetch failed", { err });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    fetchPresence();

    // High-frequency polling for real-time feel (5s)
    const fastTimer = setInterval(fetchPresence, 5_000);
    // Standard polling for stats (60s)
    const slowTimer = setInterval(fetchAll, 60_000);

    return () => {
      mountedRef.current = false;
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, [fetchAll, fetchPresence, user]);

  const refresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    await fetchPresence();
    setIsRefreshing(false);
  };

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

  const totalSentiment = sentimentData.reduce((s, d) => s + d.value, 0);

  return (
    <PageTransition>
      <div className="max-w-[1600px] mx-auto space-y-2 pb-2">
        {/* Elite Command Header â€” tightened so the onboarding card fits
            above the fold on a 900px viewport. Title/subtitle/stats kept
            but vertical density compressed ~40px without losing brand. */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-black/5">
          <div className="space-y-0.5">
            <h1 className="text-xl md:text-2xl font-black tracking-tighter text-ink">
              Wireline OS
            </h1>
            <p className="text-[12px] text-muted/80 max-w-lg leading-snug">
              Live calls, fleet status, and unit economics for your entire agent operation â€” one
              screen, real time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Activate Growth â€” full button when the user has at least one
                agent, disabled-stub when they don't. Stub still occupies the
                slot so fresh accounts don't see a blank gap that reads as
                broken UI. Hover-tooltip routes them to /agents to set up. */}
            {(stats?.agents?.length ?? 0) > 0 ? (
              <button
                onClick={async () => {
                  if (activatingGrowth) return;
                  setActivatingGrowth(true);
                  try {
                    const res = await authFetch("/api/jobs/prospect", { method: "POST" });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error(body.error || `HTTP ${res.status}`);
                    }
                    const body = (await res.json().catch(() => ({}))) as {
                      prospectingEnabled?: boolean;
                    };
                    if (body.prospectingEnabled === false) {
                      toastInfo(
                        "Prospecting is disabled",
                        "Open Settings â†’ Growth to enable autonomous prospecting and configure targeting.",
                      );
                    } else {
                      toastSuccess(
                        "Growth engine queued",
                        "Apollo Intelligence is sourcing new leads. They'll appear in Outbound shortly.",
                      );
                    }
                  } catch (err: any) {
                    toastError(
                      "Failed to activate growth engine",
                      err?.message || "Check network and try again.",
                    );
                  } finally {
                    setActivatingGrowth(false);
                  }
                }}
                disabled={activatingGrowth}
                className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-2xl hover:bg-brand-2 transition-all shadow-xl shadow-brand/20 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
              >
                <Zap
                  className={clsx("w-4 h-4 fill-current", activatingGrowth && "animate-pulse")}
                />
                <span className="text-xs font-black uppercase tracking-widest">
                  {activatingGrowth ? "Activatingâ€¦" : "Activate Growth"}
                </span>
              </button>
            ) : (
              <button
                onClick={() => navigate("/agents")}
                title="Create an agent first â†’ /agents"
                className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/10 bg-white/5 text-muted/70 hover:text-ink hover:border-white/25 transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-widest">
                  Create an agent â†’
                </span>
              </button>
            )}

            {/* Live telemetry strip â€” bound to real fleet/presence state.
                Previously this rendered hardcoded "0.02ms Latency" / "12 Online"
                placeholders that violated the no-mocks rule and confused
                operators who couldn't reconcile the numbers with their
                actual data. */}
            <div className="hidden xl:flex items-center gap-6 px-6 py-3 bg-black/[0.02] border border-black/5 rounded-2xl">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-muted font-bold">
                  Live Calls
                </span>
                <span className="text-xs font-mono font-bold text-brand">
                  {calls.length} active
                </span>
              </div>
              <div className="w-px h-6 bg-black/5" />
              <button
                type="button"
                onClick={() => navigate("/agents")}
                className="flex flex-col text-left hover:opacity-80 transition-opacity"
                title="View fleet"
              >
                <span className="text-[9px] uppercase tracking-wider text-muted font-bold">
                  Fleet Size
                </span>
                <span className="text-xs font-mono font-bold text-brand">
                  {stats?.agents?.length ?? 0} agents
                </span>
              </button>
            </div>

            <button
              onClick={refresh}
              disabled={isRefreshing || loading}
              className="brutal-btn !p-3 !rounded-2xl"
              aria-label="Refresh"
            >
              <RefreshCw className={clsx("w-5 h-5", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Onboarding quickstart â€” self-hides once all 4 steps complete */}
        <section className="space-y-3">
          <span className="text-[10px] uppercase tracking-[0.35em] text-muted font-medium">
            Get started
          </span>
          <OnboardingQuickstart />
        </section>

        {/* Dashboard Grid â€” compressed for 1366Ã—768 laptop viewports.
            Previously every card was p-8 (32px) min-h-[400px]+, gap-8
            between, with a right rail at min-h-[600px]. That stacked
            into ~1200px of dashboard content alone â€” half a viewport
            below the fold on a typical demo laptop. Tightened to p-5,
            min-h-[280px], gap-4. Internal Live Monitor still uses its
            own card. */}
        <section className="space-y-2 pt-2 border-t border-black/5">
          <span className="text-[10px] uppercase tracking-[0.35em] text-muted font-medium block">
            Live operations
          </span>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
            {/* Left Column: Live Monitor (8/12) */}
            <div className="xl:col-span-8 space-y-2">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-brand-2/20 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
                <div className="relative glass border-black/5 rounded-[2rem] p-4 min-h-[180px]">
                  <LiveMonitor calls={calls} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Analytics: Sentiment */}
                <div className="glass border-black/5 rounded-[2rem] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-brand" />
                      Market Sentiment
                    </h3>
                  </div>

                  {sentimentData.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center gap-2 text-center border border-dashed border-black/8 rounded-2xl bg-black/[0.01] px-6">
                      <Activity className="w-6 h-6 text-muted/30" />
                      <p className="text-[11px] text-ink/70 font-medium">No conversations yet</p>
                      <p className="text-[10px] text-muted/70 leading-relaxed">
                        Make your first call to{" "}
                        <a href="tel:+16306425661" className="text-brand hover:underline">
                          (630) 642-5661
                        </a>{" "}
                        to see live sentiment.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-8">
                      <div className="w-1/2 h-[120px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sentimentData}
                              innerRadius={50}
                              outerRadius={75}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {sentimentData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "rgba(28, 25, 23, 0.95)",
                                border: "1px solid rgba(79, 30, 123 , 0.3)",
                                borderRadius: "12px",
                                boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                              }}
                              itemStyle={{ color: "#E0D8CC", fontSize: "11px" }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-3">
                        {sentimentData.map((d) => (
                          <div key={d.name} className="flex items-center justify-between group">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: d.color }}
                              />
                              <span className="text-[11px] font-medium text-muted group-hover:text-ink transition-colors">
                                {d.name}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-ink">
                              {totalSentiment > 0
                                ? `${Math.round((d.value / totalSentiment) * 100)}%`
                                : "â€”"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Analytics: Unit Economics */}
                <div className="glass border-black/5 rounded-[2rem] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-brand" />
                      Unit Economics
                    </h3>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 border border-brand/20 rounded-full">
                      <span className="text-[9px] font-bold text-brand uppercase tracking-wider">
                        Efficiency: {stats?.unitEconomics?.efficiencyScore ?? 0}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                      <span className="text-[9px] font-medium text-muted uppercase tracking-wider block mb-1">
                        Cost / Min
                      </span>
                      <span className="text-xl font-bold text-ink">
                        ${stats?.unitEconomics?.costPerMinute ?? "0.00"}
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                      <span className="text-[9px] font-medium text-muted uppercase tracking-wider block mb-1">
                        Cost / Lead
                      </span>
                      <span className="text-xl font-bold text-ink">
                        ${stats?.unitEconomics?.costPerLead ?? "0.00"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-2xl bg-brand/5 border border-brand/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-brand uppercase tracking-wider">
                        Fleet ROI Projection
                      </span>
                      <span className="text-[10px] font-mono font-bold text-brand">EXCELLENT</span>
                    </div>
                    <div className="h-1.5 w-full bg-brand/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stats?.unitEconomics?.efficiencyScore ?? 0}%` }}
                        className="h-full bg-brand rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Intelligence & Actions (4/12) */}
            <div className="xl:col-span-4 space-y-2">
              {/* Intelligence Hub (Action Feed) */}
              <div className="glass border-black/5 rounded-[2rem] p-4 h-full min-h-[180px] flex flex-col">
                <ActionFeed actions={actions} onRefresh={refresh} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
