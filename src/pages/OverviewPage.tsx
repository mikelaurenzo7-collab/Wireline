import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, Inbox, Phone, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router";

import ActivationChecklist from "../components/ActivationChecklist";
import OutboundDialDialog from "../components/OutboundDialDialog";
import OutcomeLedger from "../components/OutcomeLedger";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import WorkspaceShell from "../components/WorkspaceShell";
import { Button, Skeleton } from "../components/atoms";
import FirstRunWorkspace from "../components/overview/FirstRunWorkspace";
import { BotRoster, ConfigureCard } from "../components/overview/OverviewRail";
import UnifiedInbox from "../components/overview/UnifiedInbox";
import {
  EMPTY_OVERVIEW_METRICS,
  type OverviewMetrics,
  type RecentConversation,
} from "../components/overview/overview-types";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { StatusNotice } from "../components/molecules";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { isReviewedOutboundCandidate } from "../lib/outbound-call-purpose";

function MetricSkeleton() {
  return (
    <div className="wl-metric-tile wl-metric-tile--compact" aria-hidden="true">
      <Skeleton shape="text" className="h-3 w-28" />
      <Skeleton shape="text" className="mt-5 h-8 w-12" />
    </div>
  );
}

function metricRows(metrics: OverviewMetrics) {
  return [
    {
      label: "Customer conversations today",
      value: metrics.conversationsToday,
      href: "/inbox",
      icon: Inbox,
      tone: metrics.conversationsToday > 0 ? ("success" as const) : ("neutral" as const),
    },
    {
      label: "High intent today",
      value: metrics.highIntentToday,
      href: "/insights",
      icon: Sparkles,
      tone: metrics.highIntentToday > 0 ? ("primary" as const) : ("neutral" as const),
    },
    {
      label: "Appointments booked",
      value: metrics.appointmentsBooked,
      href: "/calendar",
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
    <section
      className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.65fr)]"
      aria-busy="true"
      aria-label="Loading unified workspace overview"
    >
      <div className="wl-paper wl-paper-elevated min-h-[520px] p-5" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <Skeleton shape="text" className="h-5 w-40" />
          <Skeleton shape="text" className="h-9 w-24" />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(15rem,0.82fr)_minmax(0,1.18fr)]">
          <div className="grid gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <Skeleton shape="text" className="h-4 w-32" />
                <Skeleton shape="text" className="mt-2 h-3 w-48" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border p-5">
            <Skeleton shape="text" className="h-4 w-24" />
            <Skeleton shape="text" className="mt-4 h-7 w-48" />
            <Skeleton shape="text" className="mt-3 h-3 w-full" />
            <Skeleton shape="text" className="mt-2 h-3 w-4/5" />
          </div>
        </div>
      </div>
      <div className="grid content-start gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="wl-paper wl-paper-elevated p-5" aria-hidden="true">
            <Skeleton shape="text" className="h-4 w-32" />
            <Skeleton shape="text" className="mt-5 h-24 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const { agents, loading, degraded, phoneLookupDegraded, refresh } = useAgents();
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const [metrics, setMetrics] = useState<OverviewMetrics>(EMPTY_OVERVIEW_METRICS);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
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
        authFetch("/api/overview/recent-conversations").catch(() => null),
        authFetch(`/api/overview/operating-metrics?since=${encodeURIComponent(since)}`).catch(
          () => null,
        ),
      ]);

      if (cancelled) return;

      if (recentResponse?.ok) {
        const body = await recentResponse.json().catch(() => null);
        const nextConversations = Array.isArray(body?.conversations)
          ? (body.conversations as RecentConversation[]).slice(0, 8)
          : [];
        setConversations(nextConversations);
        setSelectedConversationId((current) => {
          if (current && nextConversations.some((item) => item.id === current)) return current;
          return nextConversations[0]?.id ?? null;
        });
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

  const primaryBot = agents[0];
  const hasBots = agents.length > 0;
  const hasLiveLine = agents.some((bot) => isReviewedOutboundCandidate(bot));
  const isFirstRun = !loading && !degraded && !hasBots;
  const primaryStudioHref = primaryBot
    ? `/studio?agent=${encodeURIComponent(primaryBot.id)}&section=setup`
    : "/studio?create=1";

  return (
    <WorkspaceShell contentClassName="pt-3 pb-5 lg:pt-4">
      <WorkspacePageFrame mode="operate" className="wl-overview">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className={isFirstRun ? "sr-only" : "wl-app-page-title mt-1"}>Overview</h1>
          </div>
          {!isFirstRun ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="secondary" className="justify-center">
                <Link to="/templates">Browse Templates</Link>
              </Button>
              {hasLiveLine ? (
                <Button
                  type="button"
                  className="justify-center"
                  onClick={() => setShowOutboundDial(true)}
                >
                  <Phone size={15} aria-hidden="true" />
                  New call
                </Button>
              ) : (
                <Button asChild className="justify-center">
                  <Link to={hasBots ? primaryStudioHref : "/studio?create=1"}>
                    {hasBots ? (
                      <Sparkles size={15} aria-hidden="true" />
                    ) : (
                      <Plus size={15} aria-hidden="true" />
                    )}
                    {hasBots ? "Configure Bot" : "Create Bot"}
                  </Link>
                </Button>
              )}
            </div>
          ) : null}
        </header>

        {isFirstRun ? (
          <>
            <span className="sr-only">Create Your Own or Browse Templates</span>
            <FirstRunWorkspace />
          </>
        ) : degraded && !hasBots ? (
          <WorkspaceRecovery onRetry={refresh} />
        ) : loading && !hasBots ? (
          <DashboardLoadingState />
        ) : (
          <>
            <ActivationChecklist className="mb-0" />

            {degraded ? (
              <StatusNotice tone="warning" title="Bot Roster Partial">
                BotBound is showing the last safe Bot roster while account data recovers.
              </StatusNotice>
            ) : null}
            {phoneLookupDegraded ? (
              <StatusNotice tone="warning" title="Line Status Unavailable">
                We could not verify attached phone numbers. Your lines and Bots are unchanged.
              </StatusNotice>
            ) : null}
            {recentUnavailable ? (
              <StatusNotice tone="warning" title="Conversation Preview Partial">
                Recent customer conversations could not be refreshed. Open Inbox for the full
                record.
              </StatusNotice>
            ) : null}
            {metricsUnavailable ? (
              <StatusNotice tone="warning" title="Metrics Partial">
                Today&apos;s operating metrics could not be refreshed. Existing conversations and
                outcomes are unchanged.
              </StatusNotice>
            ) : null}

            <section
              className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.65fr)]"
              aria-label="Customer demand and outcomes"
            >
              <span className="sr-only">
                Calls, reviewed calls, email, and computer tasks. Recent conversations.
              </span>
              <UnifiedInbox
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
                loading={loadingDashboard}
                unavailable={recentUnavailable && conversations.length === 0}
              />
              <aside className="grid content-start gap-4" aria-label="Workspace summary">
                <section
                  className="grid grid-cols-2 gap-2 sm:gap-3"
                  aria-label="Today’s operating metrics"
                  aria-busy={loadingDashboard}
                >
                  {loadingDashboard
                    ? Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)
                    : metricRows(metrics).map(({ label, value, href, icon: Icon, tone }, index) => (
                        <Link
                          key={label}
                          to={href}
                          className={`wl-metric-tile wl-metric-tile--compact wl-press wl-reveal wl-reveal-${index + 1} group wl-focus-ring-halo`}
                          data-tone={tone}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="wl-metric-tile__label">{label}</p>
                            <Icon
                              className="wl-metric-tile__icon size-4 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                          </div>
                          <div className="wl-metric-tile__value">{value}</div>
                        </Link>
                      ))}
                </section>
                <p className="sr-only" role="status">
                  {loadingDashboard
                    ? "Loading today's numbers."
                    : `${metrics.conversationsToday} conversations today, ${metrics.highIntentToday} high intent, ${metrics.appointmentsBooked} appointments booked, ${metrics.activeWork} needing attention.`}
                </p>
                <BotRoster bots={agents} phoneLookupDegraded={phoneLookupDegraded} />
                <ConfigureCard bot={primaryBot} />
              </aside>
            </section>

            <section className="wl-paper wl-paper-elevated p-5 sm:p-6" aria-label="Outcome ledger">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Proof of Work
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">Outcomes</h2>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/insights">Open Analytics</Link>
                </Button>
              </div>
              <OutcomeLedger limit={5} showViewAll followUpsHref="/approvals" />
            </section>
          </>
        )}
      </WorkspacePageFrame>
      <OutboundDialDialog open={showOutboundDial} onClose={() => setShowOutboundDial(false)} />
    </WorkspaceShell>
  );
}
