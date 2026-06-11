import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { resolveAppPageSubTabId, resolveAppPageSubTabRoute } from "../lib/page-sub-tabs";
import { clientLog } from "../lib/client-log";
import { log } from "../lib/server-logger";
import { authFetch, refreshSessionIfNeeded } from "../lib/api";
import { LiveFloorPanel, type FloorAgent } from "../components/CommandCenter/LiveFloorPanel";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import { OpsPulseStrip } from "../components/CommandCenter/OpsPulseStrip";
import { OpsIntelligenceRail } from "../components/CommandCenter/OpsIntelligenceRail";
import { TriagePanel } from "../components/TriageInbox";
import CsvExportButton from "../components/CsvExportButton";
import PageTransition from "../components/layout/PageTransition";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientToolbar from "../components/layout/ClientToolbar";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { EmptyState } from "../components/ui/EmptyState";
import { InlineEmpty } from "../components/ui/InlineEmpty";
import {
  WL_OPS_CLASSES,
  OPS_SENTIMENT_COLORS,
  OPS_COPY,
  OPS_CHANNEL_TOOLBAR,
  OPS_CHANNEL_EMPTY,
} from "../lib/wireline-ops-design";

const OpsSentimentChart = lazy(() => import("../components/CommandCenter/OpsSentimentChart"));

// ─── Types ───────────────────────────────────────────────────────────────────

type LiveCall = {
  id: string,
  agent_id?: string,
  customer_number: string,
  sentiment_label: string,
  urgency: number,
  status: "active" | "escalated";
  thought?: string;
};

const OPS_ROUTE = resolveAppPageSubTabRoute("/ops")!;

type OpsTabId = "floor" | "intel" | "triage" | "analytics";

type ActionItem = {
  id: string,
  type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string,
  created_at: string,
  payload?: Record<string, unknown>;
  reasoning?: string;
};

type LeadDossier = {
  customer_number: string,
  full_name?: string,
  company?: string,
  job_title?: string,
  bio?: string,
  linked_in_url?: string;
};

type TelemetryStats = {
  sentimentBreakdown?: {
    positive?: number,
    neutral?: number,
    negative?: number,
  };
  unitEconomics?: {
    efficiencyScore?: number,
    costPerMinute?: number | string,
    costPerLead?: number | string,
  };
  agents?: {
    id: string,
    name: string,
    role?: string,
  }[];
};

type SignalPayload = {
  id: string,
  agent_id?: string | null,
  customer_number: string,
  label?: string,
  urgency?: number,
  status?: string,
  thought?: string;
};

type TaskPayload = {
  id: string,
  task_type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: string,
  description?: string,
  created_at: string,
  payload?: Record<string, unknown>;
  resolution_notes?: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LiveOps() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveAppPageSubTabId(OPS_ROUTE, searchParams.get("tab")) as OpsTabId;

  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [agents, setAgents] = useState<FloorAgent[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, LeadDossier>>({});
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activatingGrowth, setActivatingGrowth] = useState(false);
  const [agentsHydrated, setAgentsHydrated] = useState(false);
  const [triageAttention, setTriageAttention] = useState(0);
  const [triageLoading, setTriageLoading] = useState(false);
  const triageRefreshRef = useRef<(() => void) | null>(null);
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
          (signals || []).map((s: SignalPayload) => ({
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
          .map((s: SignalPayload) => s.customer_number)
          .filter((n: string) => !dossiersRef.current[n]);
        if (numbers.length > 0) {
          const dossRes = await authFetch(`/api/dashboard/dossiers?numbers=${numbers.join(",")}`);
          if (dossRes.ok) {
            const { dossiers: newDossData } = await dossRes.json();
            setDossiers((prev) => ({ ...prev, ...newDossData }));
          }
        }
      }
    } catch (err) {
      // Aborted / transient fetches are expected (navigation, intervals
      // racing component unmount) — only log unexpected failures.
      const error = err as Error;
      const msg = error.message || "";
      if (error.name === "AbortError" || msg.includes("Failed to fetch")) return;
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
      if (!statsRes.ok) {
        throw new Error(`dashboard stats ${statsRes.status}`);
      }
      const statsData = await statsRes.json();

      if (mountedRef.current) {
        setActions(
          (actionsData || []).map((t: TaskPayload) => ({
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
        setStats(statsData as TelemetryStats);
      }
    } catch (err) {
      // Suppress aborted-fetch noise — they fire on every page navigation.
      const error = err as Error;
      const msg = error.message || "";
      if (error.name === "AbortError" || msg.includes("Failed to fetch")) {
        // expected when user navigates mid-request
      } else {
        log.error("Command Center data fetch failed", { err });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAgentsHydrated(false);
      return;
    }
    let alive = true;
    setAgentsHydrated(false);
    authFetch("/api/agents")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.agents) {
          setAgents(
            data.agents.map((a: FloorAgent) => ({
              id: a.id,
              name: a.name,
              role: a.role,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setAgentsHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();

    let eventSource: EventSource | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastPresenceAt = Date.now();
    let failCount = 0;
    const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
    const MAX_FAILS = 10;
    /** Serverless has no LISTEN/NOTIFY — poll if SSE goes quiet. */
    const PRESENCE_HEARTBEAT_MS = 15_000;

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

    const setupPresenceStream = async () => {
      if (!user) return;

      try {
        const ok = await refreshSessionIfNeeded();
        if (!ok) return;
        const streamUrl = `${window.location.origin}/api/fleet/presence/stream`;
        eventSource = new EventSource(streamUrl, { withCredentials: true });

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "presence" && mountedRef.current) {
              failCount = 0; // reset backoff on successful message
              lastPresenceAt = Date.now();
              const signals = payload.signals || [];
              setCalls(
                signals.map((s: SignalPayload) => ({
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
                .map((s: SignalPayload) => s.customer_number)
                .filter((n: string) => !dossiersRef.current[n]);
              if (numbers.length > 0) {
                authFetch(`/api/dashboard/dossiers?numbers=${numbers.join(",")}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((dossData) => {
                    if (mountedRef.current && dossData?.dossiers) {
                      setDossiers((prev) => ({ ...prev, ...dossData.dossiers }));
                    }
                  })
                  .catch((err) => clientLog.error("command-center:dossier-fetch", err));
              }
            }
          } catch {
            // SSE message parse — non-critical
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

    heartbeatTimer = setInterval(() => {
      if (!mountedRef.current) return;
      if (Date.now() - lastPresenceAt >= PRESENCE_HEARTBEAT_MS) {
        fetchPresence();
        lastPresenceAt = Date.now();
      }
    }, PRESENCE_HEARTBEAT_MS);

    // Standard polling for stats (60s)
    const slowTimer = setInterval(fetchAll, 60_000);

    return () => {
      mountedRef.current = false;
      if (eventSource) eventSource.close();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      clearInterval(slowTimer);
    };
  }, [fetchAll, fetchPresence, user]);

  const refresh = async () => {
    setIsRefreshing(true);
    if (activeTab === "triage") {
      triageRefreshRef.current?.();
    } else {
      await fetchAll();
      await fetchPresence();
    }
    setIsRefreshing(false);
  };

  const sentimentData = stats
    ? [
        {
          name: "Positive",
          value: stats.sentimentBreakdown?.positive ?? 0,
          color: OPS_SENTIMENT_COLORS.positive,
        },
        {
          name: "Neutral",
          value: stats.sentimentBreakdown?.neutral ?? 0,
          color: OPS_SENTIMENT_COLORS.neutral,
        },
        {
          name: "Negative",
          value: stats.sentimentBreakdown?.negative ?? 0,
          color: OPS_SENTIMENT_COLORS.negative,
        },
      ].filter((d) => d.value > 0)
    : [];

  const totalSentiment = sentimentData.reduce((s, d) => s + d.value, 0);
  const pendingActions = actions.filter((a) => a.status === "pending").length;
  const escalations = calls.filter((c) => c.status === "escalated").length;
  const fleetAgentCount = agentsHydrated ? Math.max(stats?.agents?.length ?? 0, agents.length) : 0;
  const pulseLoading = loading || presenceLoading;
  const fleetPulseLoading = !agentsHydrated;
  const toolbarBusy = activeTab === "triage" ? triageLoading : pulseLoading || fleetPulseLoading;
  const mainColSpan = activeTab === "triage" ? "lg:col-span-12" : "lg:col-span-8 xl:col-span-9";

  const navigateOpsTab = (tab: Exclude<OpsTabId, "analytics">) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <PageTransition>
      <ClientRouteViewport>
        <div
          className={clsx(
            "flex flex-col flex-1 min-h-0 h-full max-w-[1680px] mx-auto w-full bg-paper paper-texture",
            WL_OPS_CLASSES.canvas,
          )}
        >
          <OpsPulseStrip
            liveCalls={calls.length}
            pendingActions={pendingActions}
            fleetAgents={fleetAgentCount}
            escalations={escalations}
            activeTab={activeTab}
            onMetricNavigate={navigateOpsTab}
            loading={pulseLoading}
            fleetLoading={fleetPulseLoading}
          />

          <ClientToolbar
            className="shrink-0 px-2 sm:px-3"
            left={
              <span className="app-toolbar-stat inline-flex items-center gap-2">
                {activeTab === "triage" && !toolbarBusy && triageAttention > 0 && (
                  <span
                    className="w-2 h-2 rounded-full bg-brand animate-pulse shrink-0"
                    aria-hidden
                  />
                )}
                {toolbarBusy
                  ? OPS_CHANNEL_TOOLBAR.ops.loading
                  : activeTab === "floor"
                    ? OPS_CHANNEL_TOOLBAR.ops.floor(calls.length)
                    : activeTab === "intel"
                      ? OPS_CHANNEL_TOOLBAR.ops.intel(pendingActions)
                      : activeTab === "triage"
                        ? OPS_CHANNEL_TOOLBAR.ops.triage(triageAttention)
                        : OPS_CHANNEL_TOOLBAR.ops.analytics}
              </span>
            }
            actions={
              <>
                {activeTab === "triage" && <CsvExportButton type="tasks" label="CSV" />}
                <ShadButton
                  type="button"
                  variant="outline"
                  size="icon"
                  disableAnimations
                  onClick={refresh}
                  disabled={isRefreshing || (activeTab === "triage" ? triageLoading : loading)}
                  className="touch-press hover:scale-[1.05] shrink-0 w-9 rounded-md text-muted hover:text-ink wl-panel disabled:cursor-not-allowed"
                  aria-label="Refresh"
                  title="Refresh"
                >
                  <RefreshCw
                    className={clsx(
                      "w-4 h-4",
                      (isRefreshing || (activeTab === "triage" ? triageLoading : false)) &&
                        "animate-spin",
                    )}
                  />
                </ShadButton>
              </>
            }
          />

          {/* Desktop-first grid with dynamic viewport perfection */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch px-2 sm:px-3 pt-1 pb-3 flex-1 min-h-0 overflow-hidden">
            {/* Left Pane (Main Operations) */}
            <div
              className={clsx(mainColSpan, "flex flex-col min-h-0 min-w-0 gap-3 overflow-hidden")}
            >
              {activeTab === "floor" && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex-1 min-h-0 flex flex-col overflow-hidden"
                >
                  <div
                    className={clsx(
                      WL_OPS_CLASSES.floorFrame,
                      "flex-1 min-h-0 flex flex-col overflow-hidden wl-panel border border-ink/10 rounded-lg shadow-sm",
                    )}
                  >
                    <LiveFloorPanel
                      calls={calls}
                      agents={agents}
                      loading={presenceLoading}
                      agentsLoading={!agentsHydrated}
                    />
                  </div>
                </motion.section>
              )}

              {activeTab === "intel" && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex-1 min-h-0 flex flex-col overflow-hidden"
                >
                  <div
                    className={clsx(
                      WL_OPS_CLASSES.floorFrame,
                      "flex-1 min-h-0 flex flex-col overflow-hidden wl-panel border border-ink/10 rounded-lg shadow-sm",
                    )}
                  >
                    <ActionFeed actions={actions} onRefresh={refresh} />
                  </div>
                </motion.section>
              )}

              {activeTab === "triage" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex-1 min-h-0 flex flex-col overflow-hidden"
                >
                  <TriagePanel
                    embedded
                    refreshRef={triageRefreshRef}
                    onAttentionChange={setTriageAttention}
                    onLoadingChange={setTriageLoading}
                  />
                </motion.div>
              )}

              {activeTab === "analytics" && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex-1 min-h-0 overflow-y-auto scroll-viewport scroll-pb-safe space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
                    {/* Analytics: Sentiment */}
                    <div
                      className={clsx(
                        WL_OPS_CLASSES.railCard,
                        "wl-card-lift hover:border-brand/35 transition-colors duration-200 wl-panel border border-ink/10 rounded-lg",
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="wl-label">Market Sentiment</h3>
                      </div>

                      {sentimentData.length === 0 ? (
                        <>
                          {/* Mobile: compact inline empty so the pulse strip (above) stays in view */}
                          <div className="md:hidden py-1">
                            <InlineEmpty
                              label={OPS_CHANNEL_EMPTY.sentiment.title}
                              icon={Activity}
                            />
                          </div>
                          {/* Desktop+: keep the richer EmptyState */}
                          <div className="hidden md:block">
                            <EmptyState
                              icon={Activity}
                              eyebrow={OPS_CHANNEL_EMPTY.sentiment.eyebrow}
                              title={OPS_CHANNEL_EMPTY.sentiment.title}
                              description={OPS_CHANNEL_EMPTY.sentiment.description}
                              actions={[...OPS_CHANNEL_EMPTY.sentiment.actions]}
                              density="compact"
                              withHalo={false}
                              className="py-8"
                            />
                          </div>
                        </>
                      ) : (
                        <Suspense
                          fallback={
                            <div className="h-44 flex items-center justify-center text-[11px] text-muted">
                              Loading chart…
                            </div>
                          }
                        >
                          <OpsSentimentChart data={sentimentData} total={totalSentiment} />
                        </Suspense>
                      )}
                    </div>

                    {/* Analytics: Unit Economics */}
                    <div
                      className={clsx(
                        WL_OPS_CLASSES.railCard,
                        "wl-card-lift hover:border-brand/35 transition-colors duration-200 wl-panel border border-ink/10 rounded-lg",
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="wl-label">Unit Economics</h3>
                        <span className={WL_OPS_CLASSES.scoreBadge}>
                          {OPS_COPY.roiLabel}: {stats?.unitEconomics?.efficiencyScore ?? 0}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 stagger-children">
                        <div className="p-4 rounded-md wl-panel relative overflow-hidden group hover:-translate-y-px transition-transform border border-ink/10">
                          <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-brand/8 blur-xl -translate-y-4 translate-x-4" />
                          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
                          <span className="wl-label block mb-1 relative z-10">Cost / Min</span>
                          <span className="text-2xl font-semibold text-ink tabular-nums relative z-10">
                            ${stats?.unitEconomics?.costPerMinute ?? "0.00"}
                          </span>
                        </div>
                        <div className="p-4 rounded-md wl-panel relative overflow-hidden group hover:-translate-y-px transition-transform border border-ink/10">
                          <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-brand-deep/8 blur-xl -translate-y-4 translate-x-4" />
                          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand-deep/40 to-transparent" />
                          <span className="wl-label block mb-1 relative z-10">Cost / Lead</span>
                          <span className="text-2xl font-semibold text-ink tabular-nums relative z-10">
                            ${stats?.unitEconomics?.costPerLead ?? "0.00"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 p-4 rounded-md bg-brand/5 border border-brand/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-eyebrow text-brand">{OPS_COPY.roiLabel}</span>
                          <span className="text-caption font-mono font-semibold text-brand tabular-nums">
                            {(stats?.unitEconomics?.efficiencyScore ?? 0) >= 70
                              ? "Strong"
                              : (stats?.unitEconomics?.efficiencyScore ?? 0) >= 40
                                ? "Building"
                                : "Early"}
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
                </motion.section>
              )}
            </div>

            {activeTab !== "triage" && (
              <OpsIntelligenceRail
                liveCalls={calls.length}
                fleetAgents={fleetAgentCount}
                activatingGrowth={activatingGrowth}
                onActivatingGrowthChange={setActivatingGrowth}
              />
            )}
          </div>
        </div>
      </ClientRouteViewport>
    </PageTransition>
  );
}
