/**
 * InsightsView — Refactored Shell
 *
 * Primary groups + secondary views live in WorkspaceTopBar (AppChromeSubTabs).
 * This shell renders the active view body only.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CsvExportButton from "../CsvExportButton";
import GoalsView from "../GoalsView";
import WidgetBoundary from "../WidgetBoundary";
import ClientRouteViewport from "../layout/ClientRouteViewport";
import ClientToolbar from "../layout/ClientToolbar";
import { SegmentStrip } from "../ui/SegmentStrip";
import { OPS_CHANNEL_TOOLBAR } from "../../lib/wireline-ops-design";
import {
  resolveAppPageSecondaryRoute,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
  resolveInsightsGroupForView,
} from "../../lib/page-sub-tabs";

import FunnelView from "./FunnelView";
import AttributionView from "./AttributionView";
import TopicsView from "./TopicsView";
import HeatmapView from "./HeatmapView";
import LeaderboardView from "./LeaderboardView";
import FailureModesView from "./FailureModesView";
import VoiceLatencyView from "./VoiceLatencyView";
import VoiceReliabilityView from "./VoiceReliabilityView";
import AISpendView from "./AISpendView";
import QualityView from "./QualityView";
import LearningMetricsView from "./LearningMetricsView";

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;

type InsightGroupId = "performance" | "reliability" | "quality" | "revenue";

const INSIGHTS_ROUTE = resolveAppPageSubTabRoute("/insights")!;

export default function InsightsView() {
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
      <div className="flex flex-col flex-1 min-h-0 w-full scroll-viewport scroll-pb-safe pr-1 pb-4">
        {node}
      </div>
    </WidgetBoundary>
  );

  const viewContent = useMemo(() => {
    const views: Record<string, React.ReactNode> = {
      funnel: wrap("Funnel", <FunnelView days={days} />),
      goals: wrap("Goals", <GoalsView />),
      attribution: wrap("Attribution", <AttributionView days={days} />),
      topics: wrap("Topics", <TopicsView />),
      heatmap: wrap("Heatmap", <HeatmapView days={days} />),
      leaderboard: wrap("Leaderboard", <LeaderboardView days={days} />),
      failures: wrap("Failures", <FailureModesView />),
      latency: wrap("Latency", <VoiceLatencyView days={days} />),
      reliability: wrap("Reliability", <VoiceReliabilityView days={days} />),
      spend: wrap("AI Spend", <AISpendView days={days} />),
      quality: wrap("Scorecards", <QualityView days={days} />),
      learning: wrap("Learning", <LearningMetricsView />),
    };
    return views[activeView] ?? views.funnel;
  }, [activeView, days]);

  const dayPicker = (
    <SegmentStrip
      aria-label="Insights date range"
      testIdPrefix="insights-days"
      options={DAY_OPTIONS.map((d) => ({ value: String(d), label: `${d}d` }))}
      value={String(days)}
      onChange={(v) => setDays(Number(v) as (typeof DAY_OPTIONS)[number])}
    />
  );

  return (
    <ClientRouteViewport>
      <ClientToolbar
        left={<span className="app-toolbar-stat">{OPS_CHANNEL_TOOLBAR.insights.stat(days)}</span>}
        actions={
          <>
            {dayPicker}
            <CsvExportButton type="calls" label={OPS_CHANNEL_TOOLBAR.insights.export} />
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
