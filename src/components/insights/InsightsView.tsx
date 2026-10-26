/**
 * InsightsView — Refactored Shell
 *
 * Primary groups + secondary views live in WorkspaceTopBar (AppChromeSubTabs).
 * This shell renders the active view body only.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { TrendingUp } from "lucide-react";
import CallOpsOverview from "../CallOpsOverview";
import CsvExportButton from "../CsvExportButton";
import GoalsView from "../GoalsView";
import WidgetBoundary from "../WidgetBoundary";
import { PanelSkeleton } from "../atoms/skeleton-presets";
import ClientRouteViewport from "../layout/ClientRouteViewport";
import ClientToolbar from "../layout/ClientToolbar";
import { SegmentStrip } from "../ui/SegmentStrip";
import {
  resolveAppPageSecondaryRoute,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
  resolveInsightsGroupForView,
} from "../../lib/page-sub-tabs";

import { useAgents } from "../../contexts/AgentsContext";
import { InsightEmpty } from "./shared";
import FunnelView from "./FunnelView";
import AttributionView from "./AttributionView";
import TopicsView from "./TopicsView";
import HeatmapView from "./HeatmapView";
import LeaderboardView from "./LeaderboardView";
import FailureModesView from "./FailureModesView";
import LearningMetricsView from "./LearningMetricsView";

// Reliability and Scorecards are the only two of these views that draw
// with Recharts, and they are not the default tab. Imported eagerly they put the
// whole charting library on the critical path for everyone who opens Insights.
// Loading them on demand keeps that cost with the tabs that actually spend it.
const VoiceReliabilityView = lazy(() => import("./VoiceReliabilityView"));
const QualityView = lazy(() => import("./QualityView"));

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
// Only these views pass the selected window into their API requests.
const WINDOWED_VIEWS = new Set([
  "funnel",
  "attribution",
  "heatmap",
  "leaderboard",
  "reliability",
  "quality",
]);
const FIXED_PERIOD_LABELS: Record<string, string> = {
  calls: "Today and all-time",
  goals: "This month",
  topics: "Recent calls",
  failures: "Recent qualifying calls",
  learning: "Saved learning",
};

type InsightGroupId = "performance" | "reliability" | "quality" | "revenue";

const INSIGHTS_ROUTE = resolveAppPageSubTabRoute("/insights")!;

export default function InsightsView() {
  const { agents, loading: agentsLoading, degraded: agentsDegraded } = useAgents();
  const firstRun = !agentsLoading && agents.length === 0 && !agentsDegraded;
  const [days, setDays] = useState(30);
  const [searchParams] = useSearchParams();
  const routeGroup = resolveAppPageSubTabId(
    INSIGHTS_ROUTE,
    searchParams.get("tab"),
  ) as InsightGroupId;

  const secondaryRoute = resolveAppPageSecondaryRoute("/insights", routeGroup);
  const activeView = secondaryRoute
    ? resolveAppPageSecondaryTabId(secondaryRoute, searchParams.get("view"))
    : "funnel";
  const activeGroup = (resolveInsightsGroupForView(activeView) ?? routeGroup) as InsightGroupId;

  const wrap = (label: string, node: React.ReactNode) => (
    <WidgetBoundary label={label}>
      <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto overscroll-contain scroll-viewport scroll-pb-safe pr-1 pb-4">
        {/* Only one view renders at a time, so a single boundary here covers
            whichever of them is lazy without each view declaring its own. */}
        <Suspense fallback={<PanelSkeleton rows={6} />}>{node}</Suspense>
      </div>
    </WidgetBoundary>
  );

  const viewContent = useMemo(() => {
    const views: Record<string, React.ReactNode> = {
      funnel: wrap("Activity totals", <FunnelView days={days} />),
      calls: wrap("Call analytics", <CallOpsOverview />),
      goals: wrap("Goals", <GoalsView />),
      attribution: wrap("Attribution", <AttributionView days={days} />),
      topics: wrap("Topics", <TopicsView />),
      heatmap: wrap("Heatmap", <HeatmapView days={days} />),
      leaderboard: wrap("Leaderboard", <LeaderboardView days={days} />),
      failures: wrap("Failures", <FailureModesView />),
      reliability: wrap("Reliability", <VoiceReliabilityView days={days} />),
      quality: wrap("Scorecards", <QualityView days={days} />),
      learning: wrap("Learning", <LearningMetricsView />),
    };
    return views[activeView] ?? views.funnel;
  }, [activeView, days]);

  // Account spend and budget remain available before creation or after deleting every Bot.
  if (agentsDegraded && agents.length === 0) {
    return (
      <ClientRouteViewport>
        <InsightEmpty
          configKey="funnel"
          icon={TrendingUp}
          titleOverride="Bot Status Could Not Be Loaded"
        />
      </ClientRouteViewport>
    );
  }

  if (firstRun) {
    return (
      <ClientRouteViewport>
        <InsightEmpty configKey="funnel" icon={TrendingUp} />
      </ClientRouteViewport>
    );
  }

  const periodControl = WINDOWED_VIEWS.has(activeView) ? (
    <SegmentStrip
      aria-label="Insights date range"
      testIdPrefix="insights-days"
      options={DAY_OPTIONS.map((d) => ({ value: String(d), label: `${d}d` }))}
      value={String(days)}
      onChange={(v) => setDays(Number(v) as (typeof DAY_OPTIONS)[number])}
      variant="soft"
    />
  ) : FIXED_PERIOD_LABELS[activeView] ? (
    <span className="text-xs font-medium text-muted-foreground">
      {FIXED_PERIOD_LABELS[activeView]}
    </span>
  ) : null;

  return (
    <ClientRouteViewport>
      <ClientToolbar
        actions={
          <>
            {periodControl}
            <CsvExportButton type="calls" label="Export all calls" />
          </>
        }
      />

      <div
        key={`${activeGroup}-${activeView}`}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {viewContent}
      </div>
    </ClientRouteViewport>
  );
}
