import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, Inbox, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router";

import ActivationChecklist from "../components/ActivationChecklist";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import WorkspaceShell from "../components/WorkspaceShell";
import { Button, Skeleton } from "../components/atoms";
import FirstRunWorkspace from "../components/overview/FirstRunWorkspace";
import RecentActivity from "../components/overview/RecentActivity";
import {
  EMPTY_OVERVIEW_METRICS,
  type OverviewMetrics,
  type RecentConversation,
} from "../components/overview/overview-types";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { StatusNotice } from "../components/molecules";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

function MetricSkeleton() {
  return (
    <div className="wl-metric-tile wl-metric-tile--compact" aria-hidden="true">
      <Skeleton shape="text" className="h-3 w-20" />
      <Skeleton shape="text" className="mt-4 h-8 w-10" />
    </div>
  );
}

function metricRows(metrics: OverviewMetrics) {
  return [
    {
      label: "Conversations",
      value: metrics.conversationsToday,
      href: "/inbox",
      icon: Inbox,
      tone: metrics.conversationsToday > 0 ? ("success" as const) : ("neutral" as const),
    },
    {
      label: "High intent",
      value: metrics.highIntentToday,
      href: "/insights",
      icon: Sparkles,
      tone: metrics.highIntentToday > 0 ? ("primary" as const) : ("neutral" as const),
    },
    {
      label: "Appointments",
      value: metrics.appointmentsBooked,
      href: "/phone?tab=appointments",
      icon: CalendarCheck2,
      tone: metrics.appointmentsBooked > 0 ? ("wire" as const) : ("neutral" as const),
    },
    {
      label: "Needs attention",
      value: metrics.activeWork,
      href: "/approvals",
      icon: ShieldCheck,
      tone: metrics.activeWork > 0 ? ("warning" as const) : ("success" as const),
    },
  ];
}

function DashboardLoadingState() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading Home">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <MetricSkeleton key={index} />
        ))}
      </section>
      <div className="wl-paper wl-paper-elevated p-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex min-h-16 items-center gap-3 border-b border-border/60 last:border-0">
            <Skeleton shape="surface" className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton shape="text" className="h-4 w-32" />
              <Skeleton shape="text" className="mt-2 h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { agents, loading, degraded, phoneLookupDegraded, refresh } = useAgents();
  const [metrics, setMetrics] = useState<OverviewMetrics>(EMPTY_OVERVIEW_METRICS);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [recentUnavailable, setRecentUnavailable] = useState(false);
  const [metricsUnavailable, setMetricsUnavailable] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    let timer: number | null = null;
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setRefreshTick((value) => value + 1), 1_500);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!loadedOnceRef.current) setLoadingDashboard(true);
      setRecentUnavailable(false);
      setMetricsUnavailable(false);
      const dayBoundary = new Date();
      dayBoundary.setHours(0, 0, 0, 0);
      const since = dayBoundary.toISOString();

      const [recentResponse, metricsResponse] = await Promise.all([
        authFetch("/api/overview/recent-conversations?limit=4").catch(() => null),
        authFetch(`/api/overview/operating-metrics?since=${encodeURIComponent(since)}`).catch(
          () => null,
        ),
      ]);

      if (cancelled) return;

      if (recentResponse?.ok) {
        const body = await recentResponse.json().catch(() => null);
        setConversations(
          Array.isArray(body?.conversations)
            ? (body.conversations as RecentConversation[]).slice(0, 4)
            : [],
        );
      } else {
        setRecentUnavailable(true);
      }

      if (metricsResponse?.ok) {
        const body = await metricsResponse.json().catch(() => null);
        setMetrics({
          conversationsToday: Number(body?.conversationsToday ?? 0),
          highIntentToday: Number(body?.highIntentToday ?? 0),
          appointmentsBooked: Number(body?.appointmentsBooked ?? 0),
          activeWork: Number(body?.activeWork ?? 0),
        });
      } else {
        setMetricsUnavailable(true);
      }

      setLoadingDashboard(false);
      loadedOnceRef.current = true;
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const hasBots = agents.length > 0;
  const isFirstRun = !loading && !degraded && !hasBots;

  return (
    <WorkspaceShell contentClassName="pt-3 pb-5 lg:pt-4">
      <WorkspacePageFrame mode="operate" className="wl-overview gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className={isFirstRun ? "sr-only" : "wl-app-page-title"}>Home</h1>
          {!isFirstRun ? (
            <Button asChild size="sm">
              <Link to="/studio?create=1">
                <Plus size={15} aria-hidden="true" />
                New Bot
              </Link>
            </Button>
          ) : null}
        </header>

        {isFirstRun ? (
          <FirstRunWorkspace />
        ) : degraded && !hasBots ? (
          <WorkspaceRecovery onRetry={refresh} />
        ) : loading && !hasBots ? (
          <DashboardLoadingState />
        ) : (
          <>
            <ActivationChecklist className="mb-0" />

            {degraded ? (
              <StatusNotice tone="warning" title="Bots unavailable">
                Showing the last safe workspace state while Wireline reconnects.
              </StatusNotice>
            ) : null}
            {phoneLookupDegraded ? (
              <StatusNotice tone="warning" title="Line status unavailable">
                Your bots and lines are unchanged.
              </StatusNotice>
            ) : null}

            <section
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
              aria-label="Today"
              aria-busy={loadingDashboard}
            >
              {loadingDashboard
                ? Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)
                : metricRows(metrics).map(({ label, value, href, icon: Icon, tone }) => (
                    <Link
                      key={label}
                      to={href}
                      className="wl-metric-tile wl-metric-tile--compact wl-press wl-focus-ring-halo group"
                      data-tone={tone}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="wl-metric-tile__label">{label}</p>
                        <Icon className="wl-metric-tile__icon size-4 shrink-0 text-primary" aria-hidden="true" />
                      </div>
                      <div className="wl-metric-tile__value">{value}</div>
                    </Link>
                  ))}
            </section>

            {metricsUnavailable ? (
              <p className="text-xs text-muted-foreground" role="status">
                Today&apos;s totals could not refresh.
              </p>
            ) : null}

            <RecentActivity
              conversations={conversations}
              loading={loadingDashboard}
              unavailable={recentUnavailable && conversations.length === 0}
            />
          </>
        )}
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
