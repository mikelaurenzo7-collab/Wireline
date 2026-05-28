/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Activity, RefreshCw, Zap, Globe } from "lucide-react";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNavigate } from "react-router-dom";
import { log } from "../lib/server-logger";
import { authFetch } from "../lib/api";
import { LiveMonitor } from "../components/CommandCenter/LiveMonitor";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import OnboardingQuickstart from "../components/OnboardingQuickstart";
import PageTransition from "../components/layout/PageTransition";
import AppPageIntro from "../components/layout/AppPageIntro";
import { clsx } from "clsx";
import { motion } from "motion/react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Data ─────────────────────────────────────────────────────────────────────

const SENTIMENT_COLORS = {
  positive: "#10b981", // emerald-500
  neutral: "#6366f1", // indigo-500
  negative: "#f43f5e", // rose-500
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LiveOps() {
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
      // racing component unmount) — only log unexpected failures.
      const msg = String(err?.message || "");
      if (err?.name === "AbortError" || msg.includes("Failed to fetch")) return;
      log.error("Failed to fetch live presence", { err });
    }
  }, [user, dossiers]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    try {
      // `/api/fleet/stats` was a phantom endpoint — it was never declared
      // on the server, so the Command Center showed perpetual "Awaiting
      // data" with 404s in the Network tab. `/api/dashboard/stats` returns
      // the same shape (sentimentBreakdown / unitEconomics / agents …).
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
      // Suppress aborted-fetch noise — they fire on every page navigation.
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
        {/* Command header — the "Wireline OS" title + caption were
            removed per design direction (the top nav already labels
            this Home). The action button + live-stat tiles stay,
            right-aligned. A small orientation strip on the left
            clarifies what this page IS vs the nearby /cockpit page
            (which manages the agent floor). */}
        <AppPageIntro
          eyebrow="Workspace · Owner pulse"
          title="Live Ops"
          subtitle={
            <>
              Live calls, action feed, lead intel — what&apos;s happening and what to do next. For
              the floor view (agent availability + listen-in), open{" "}
              <button
                type="button"
                onClick={() => navigate("/cockpit")}
                className="text-brand hover:underline font-medium"
              >
                Cockpit ↗
              </button>
              .
            </>
          }
          actions={
            <>
              {/* Activate Growth — full button when the user has at least one
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
                          "Open Settings → Growth to enable autonomous prospecting and configure targeting.",
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
                  className="app-primary-btn flex items-center gap-2 px-6 py-3 bg-ink text-paper rounded-sm hover:bg-black/80 transition-all shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                >
                  <Zap
                    className={clsx("w-4 h-4 fill-current", activatingGrowth && "animate-pulse")}
                  />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {activatingGrowth ? "Activating…" : "Activate Growth"}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => navigate("/agents")}
                  title="Create an agent first → /agents"
                  className="app-primary-btn flex items-center gap-2 px-6 py-3 rounded-sm border border-black/20 bg-white text-ink hover:border-black/40 hover:shadow-sm transition-all"
                >
                  <Zap className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    Create an agent →
                  </span>
                </button>
              )}

              {/* Live telemetry strip — bound to real fleet/presence state.
                Previously this rendered hardcoded "0.02ms Latency" / "12 Online"
                placeholders that violated the no-mocks rule and confused
                operators who couldn't reconcile the numbers with their
                actual data. */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4 bg-white border border-black/10 rounded-sm shadow-sm max-md:w-full max-md:grid max-md:grid-cols-2">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-black/50">
                    Live Calls
                  </span>
                  <span className="text-sm font-mono font-black tracking-tight text-ink">
                    {calls.length} active
                  </span>
                </div>
                <div className="w-px h-8 bg-black/10 hidden md:block" />
                <button
                  type="button"
                  onClick={() => navigate("/agents")}
                  className="flex flex-col text-left hover:opacity-70 transition-opacity"
                  title="View fleet"
                >
                  <span className="text-[10px] uppercase tracking-widest font-bold text-black/50">
                    Fleet Size
                  </span>
                  <span className="text-sm font-mono font-black tracking-tight text-ink">
                    {stats?.agents?.length ?? 0} agents
                  </span>
                </button>
              </div>

              <button
                onClick={refresh}
                disabled={isRefreshing || loading}
                className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn shadow-sm !p-3 !rounded-sm !border !border-black/20"
                aria-label="Refresh"
              >
                <RefreshCw className={clsx("w-5 h-5", isRefreshing && "animate-spin")} />
              </button>
            </>
          }
        />

        {/* Onboarding quickstart — self-hides once all 4 steps complete */}
        <section className="space-y-3">
          <span className="app-section-title">Get started</span>
          <OnboardingQuickstart />
        </section>

        {/* Dashboard Grid — compressed for 1366×768 laptop viewports.
            Tightened to p-5, min-h-[280px], gap-4. Internal Live Monitor still uses its
            own card. */}
        <section className="space-y-4 pt-6 border-t border-black/10 mt-6">
          <span className="text-[10px] uppercase tracking-widest font-bold text-black/50 block">
            Live operations
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Live Monitor (8/12) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="relative group">
                <div className="relative brutal-card min-h-[180px]">
                  <LiveMonitor calls={calls} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Analytics: Sentiment */}
                <div className="brutal-card">
                  <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-3">
                    <h3 className="app-section-title flex items-center gap-2 text-ink uppercase tracking-widest font-bold">
                      <Globe className="w-4 h-4 text-ink" />
                      Market Sentiment
                    </h3>
                  </div>

                  {sentimentData.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center gap-2 text-center border border-black/10 rounded-sm bg-black/[0.02] px-6 shadow-inner">
                      <Activity className="w-5 h-5 text-black/30" />
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/60">
                        No conversations yet
                      </p>
                      <p className="text-xs leading-relaxed text-black/50 font-medium">
                        Make your first call to{" "}
                        <a href="tel:+16306425661" className="text-ink hover:underline font-bold">
                          (630) 642-5661
                        </a>{" "}
                        to see live sentiment.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                      <div className="w-full sm:w-1/2 h-[150px] min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sentimentData}
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                              isAnimationActive={true}
                              animationBegin={200}
                              animationDuration={800}
                            >
                              {sentimentData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "rgba(28, 25, 23, 0.95)",
                                border: "1px solid rgba(0, 0, 0 , 0.3)",
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
                                : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Analytics: Unit Economics */}
                <div className="brutal-card">
                  <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-3">
                    <h3 className="app-section-title flex items-center gap-2 text-ink uppercase tracking-widest font-bold">
                      <Zap className="w-4 h-4 text-ink" />
                      Unit Economics
                    </h3>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/5 border border-black/10 rounded-sm">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-ink">
                        Efficiency: {stats?.unitEconomics?.efficiencyScore ?? 0}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-sm bg-black/[0.02] border border-black/10 shadow-inner">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-1">
                        Cost / Min
                      </span>
                      <span className="text-2xl font-black tracking-tighter text-ink">
                        ${stats?.unitEconomics?.costPerMinute ?? "0.00"}
                      </span>
                    </div>
                    <div className="p-4 rounded-sm bg-black/[0.02] border border-black/10 shadow-inner">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-1">
                        Cost / Lead
                      </span>
                      <span className="text-2xl font-black tracking-tighter text-ink">
                        ${stats?.unitEconomics?.costPerLead ?? "0.00"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-sm bg-black/5 border border-black/15 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-ink">
                        Fleet ROI Projection
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 tracking-widest">
                        EXCELLENT
                      </span>
                    </div>
                    <div className="h-2 w-full bg-black/10 rounded-sm overflow-hidden border border-black/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stats?.unitEconomics?.efficiencyScore ?? 0}%` }}
                        className="h-full bg-ink"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Intelligence & Actions (4/12) */}
            <div className="lg:col-span-4 space-y-4">
              {/* Intelligence Hub (Action Feed) */}
              <div className="brutal-card h-full min-h-[180px] flex flex-col p-5">
                <ActionFeed actions={actions} onRefresh={refresh} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
