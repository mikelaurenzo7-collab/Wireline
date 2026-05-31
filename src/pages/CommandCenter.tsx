/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { log } from "../lib/server-logger";
import { authFetch, getAccessToken } from "../lib/api";
import { LiveFloorPanel, type FloorAgent } from "../components/CommandCenter/LiveFloorPanel";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import OnboardingQuickstart from "../components/OnboardingQuickstart";
import PageTransition from "../components/layout/PageTransition";
import AppPageIntro from "../components/layout/AppPageIntro";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientSubTabs from "../components/layout/ClientSubTabs";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { Radio, Zap, Globe, Activity, ListTodo } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type LiveCall = {
  id: string;
  agent_id?: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
  thought?: string;
};

const OPS_TABS = [
  { id: "floor", label: "Live floor", icon: Radio },
  { id: "intel", label: "Actions", icon: ListTodo },
  { id: "analytics", label: "Analytics", icon: Globe },
] as const;

type OpsTabId = (typeof OPS_TABS)[number]["id"];

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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: OpsTabId =
    tabParam === "intel" || tabParam === "analytics" || tabParam === "floor" ? tabParam : "floor";

  const setActiveTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === "floor") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [agents, setAgents] = useState<FloorAgent[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, LeadDossier>>({});
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activatingGrowth, setActivatingGrowth] = useState(false);
  const mountedRef = useRef(true);
  const dossiersRef = useRef(dossiers);
  dossiersRef.current = dossiers;

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
            agent_id: s.agent_id || undefined,
            customer_number: s.customer_number,
            sentiment_label: s.label || "Connected",
            urgency: s.urgency || 0,
            status: s.status === "escalated" ? "escalated" : "active",
            thought: s.thought,
          })),
        );
        setPresenceLoading(false);

        // Fetch dossiers for new numbers
        const numbers = (signals || [])
          .map((s: any) => s.customer_number)
          .filter((n: string) => !dossiersRef.current[n]);
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
  }, [user]);

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
    if (!user) return;
    let alive = true;
    authFetch("/api/agents")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.agents) {
          setAgents(
            data.agents.map((a: any) => ({
              id: a.id,
              name: a.name,
              role: a.role,
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();

    let eventSource: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let failCount = 0;
    const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
    const MAX_FAILS = 10;

    const scheduleFallbackPoll = () => {
      if (!mountedRef.current || failCount >= MAX_FAILS) return;
      const delay = BACKOFF_MS[Math.min(failCount, BACKOFF_MS.length - 1)];
      fallbackTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        fetchPresence();
        failCount++;
        scheduleFallbackPoll();
      }, delay);
    };

    const setupPresenceStream = () => {
      if (!user) return;

      try {
        const token = getAccessToken();
        if (!token) return;
        const streamUrl = `${window.location.origin}/api/fleet/presence/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(streamUrl, { withCredentials: true });

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "presence" && mountedRef.current) {
              failCount = 0; // reset backoff on successful message
              const signals = payload.signals || [];
              setCalls(
                signals.map((s: any) => ({
                  id: s.id,
                  agent_id: s.agent_id || undefined,
                  customer_number: s.customer_number,
                  sentiment_label: s.label || "Connected",
                  urgency: s.urgency || 0,
                  status: s.status === "escalated" ? "escalated" : "active",
                  thought: s.thought,
                })),
              );
              setPresenceLoading(false);

              // Fetch dossiers for new numbers
              const numbers = signals
                .map((s: any) => s.customer_number)
                .filter((n: string) => !dossiersRef.current[n]);
              if (numbers.length > 0) {
                authFetch(`/api/dashboard/dossiers?numbers=${numbers.join(",")}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((dossData) => {
                    if (mountedRef.current && dossData?.dossiers) {
                      setDossiers((prev) => ({ ...prev, ...dossData.dossiers }));
                    }
                  })
                  .catch(() => {});
              }
            }
          } catch (_e) {
            // silent parsing catch
          }
        };

        eventSource.onerror = () => {
          // SSE failed — fall back to exponential-backoff polling
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (mountedRef.current && fallbackTimer === null) {
            fetchPresence();
            failCount = 1;
            scheduleFallbackPoll();
          }
        };
      } catch (_err) {
        fetchPresence();
        failCount = 1;
        scheduleFallbackPoll();
      }
    };

    setupPresenceStream();

    // Standard polling for stats (60s)
    const slowTimer = setInterval(fetchAll, 60_000);

    return () => {
      mountedRef.current = false;
      if (eventSource) eventSource.close();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
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
      <ClientRouteViewport className="overflow-y-auto">
        <div className="max-w-[1600px] mx-auto space-y-2 pb-2">
          {/* Command header — the "Wireline OS" title + caption were
            removed per design direction (the top nav already labels
            this Home). The action button + live-stat tiles stay,
            right-aligned. A small orientation strip on the left
            clarifies what this page IS vs the nearby /cockpit page
            (which manages the agent floor). */}
          <AppPageIntro
            eyebrow="Workspace · Command center"
            title="Live Ops"
            subtitle="Live callers on the floor, supervisor listen-in, action queue, and fleet analytics — one unified surface."
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
                    className="app-primary-btn flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-brand to-brand-deep text-on-brand rounded-2xl shadow-sm shadow-brand/20 transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                  >
                    <Zap
                      className={clsx("w-4 h-4 fill-current", activatingGrowth && "animate-pulse")}
                    />
                    <span className="text-xs font-black uppercase tracking-widest">
                      {activatingGrowth ? "Activating…" : "Activate Growth"}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/agents")}
                    title="Create an agent first → /agents"
                    className="app-primary-btn flex items-center gap-2 px-6 py-3 rounded-2xl border border-black/10 bg-paper/55 text-ink hover:border-brand/25 transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Create an agent →
                    </span>
                  </button>
                )}

                {/* Live telemetry strip — bound to real fleet/presence state.
                Previously this rendered hardcoded "0.02ms Latency" / "12 Online"
                placeholders that violated the no-mocks rule and confused
                operators who couldn't reconcile the numbers with their
                actual data. */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 bg-black/[0.02] border border-black/5 rounded-2xl max-md:w-full max-md:grid max-md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("floor")}
                    className="flex flex-col text-left hover:opacity-80 transition-opacity"
                    title="View live floor"
                  >
                    <span className="text-eyebrow">Live Calls</span>
                    <span className="text-xs font-mono font-bold text-brand">
                      {calls.length} active
                    </span>
                  </button>
                  <div className="w-px h-6 bg-black/5" />
                  <button
                    type="button"
                    onClick={() => navigate("/agents")}
                    className="flex flex-col text-left hover:opacity-80 transition-opacity"
                    title="View fleet"
                  >
                    <span className="text-eyebrow">Fleet Size</span>
                    <span className="text-xs font-mono font-bold text-brand">
                      {stats?.agents?.length ?? 0} agents
                    </span>
                  </button>
                </div>

                <button
                  onClick={refresh}
                  disabled={isRefreshing || loading}
                  className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn !p-3 !rounded-2xl"
                  aria-label="Refresh"
                >
                  <RefreshCw className={clsx("w-5 h-5", isRefreshing && "animate-spin")} />
                </button>
              </>
            }
          />

          <ClientSubTabs
            tabs={[
              {
                ...OPS_TABS[0],
                badge: calls.length > 0 ? calls.length : undefined,
              },
              {
                ...OPS_TABS[1],
                badge:
                  actions.filter((a) => a.status === "pending").length > 0
                    ? actions.filter((a) => a.status === "pending").length
                    : undefined,
              },
              OPS_TABS[2],
            ]}
            activeId={activeTab}
            onChange={setActiveTab}
            aria-label="Live Ops sections"
          />

          {activeTab === "floor" && (
            <section className="space-y-2 pt-1">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-brand/15 to-brand-2/15 rounded-[2rem] blur opacity-20 group-hover:opacity-35 transition duration-1000" />
                <div className="relative glass border-black/5 rounded-[1.75rem] p-3 sm:p-4 md:p-5">
                  <LiveFloorPanel calls={calls} agents={agents} loading={presenceLoading} />
                </div>
              </div>
            </section>
          )}

          {activeTab === "intel" && (
            <section className="space-y-2 pt-1">
              <div className="glass border-black/5 rounded-[1.75rem] p-4 md:p-5 min-h-[280px] flex flex-col">
                <ActionFeed actions={actions} onRefresh={refresh} />
              </div>
            </section>
          )}

          {activeTab === "analytics" && (
            <section className="space-y-2 pt-1 border-t border-black/5">
              <span className="app-section-title block">Fleet analytics</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Analytics: Sentiment */}
                <div className="glass border-black/5 rounded-[2rem] p-4 hover:border-brand/30 hover:-translate-y-px hover:shadow-md hover:shadow-brand/5 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="app-section-title flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-brand" />
                      Market Sentiment
                    </h3>
                  </div>

                  {sentimentData.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-black/8 rounded-2xl bg-black/[0.01] px-6">
                      <div className="relative">
                        <span
                          aria-hidden
                          className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
                        />
                        <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25 flex items-center justify-center">
                          <Activity className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
                          Awaiting signal
                        </p>
                        <p className="font-display italic text-lg text-ink leading-tight">
                          No conversations yet
                        </p>
                      </div>
                      <p className="text-caption leading-relaxed">
                        Make your first call to{" "}
                        <a href="tel:+16306425661" className="text-brand hover:underline">
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
                                border: "1px solid rgba(107, 43, 153 , 0.3)",
                                borderRadius: 0,
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
                <div className="glass border-black/5 rounded-[2rem] p-4 hover:border-brand/30 hover:-translate-y-px hover:shadow-md hover:shadow-brand/5 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="app-section-title flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-brand" />
                      Unit Economics
                    </h3>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 border border-brand/20 rounded-full">
                      <span className="text-eyebrow !text-[0.625rem] text-brand">
                        Efficiency: {stats?.unitEconomics?.efficiencyScore ?? 0}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                      <span className="app-section-title block mb-1">Cost / Min</span>
                      <span className="font-display italic text-2xl text-ink tabular-nums">
                        ${stats?.unitEconomics?.costPerMinute ?? "0.00"}
                      </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                      <span className="app-section-title block mb-1">Cost / Lead</span>
                      <span className="font-display italic text-2xl text-ink tabular-nums">
                        ${stats?.unitEconomics?.costPerLead ?? "0.00"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-4 rounded-2xl bg-brand/5 border border-brand/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-eyebrow text-brand">Fleet ROI Projection</span>
                      <span className="text-caption font-mono font-semibold text-brand">
                        EXCELLENT
                      </span>
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
            </section>
          )}

          {activeTab === "floor" && (
            <section className="space-y-3 pt-2">
              <span className="app-section-title">Get started</span>
              <OnboardingQuickstart />
            </section>
          )}
        </div>
      </ClientRouteViewport>
    </PageTransition>
  );
}
