/**
 * InsightsView — Refactored Shell
 *
 * Previously a ~1900 LOC monolith. Each tab-view now lives in its own
 * file under /components/insights/. This shell orchestrates the
 * day-range picker, tab groups, and PageShell tab wiring.
 */
import { useMemo, useState } from "react";
import {
  TrendingUp,
  Layers,
  Calendar,
  Trophy,
  AlertOctagon,
  Gauge,
  Receipt,
  Star,
  Megaphone,
  Target,
  BarChart3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import CsvExportButton from "../CsvExportButton";
import GoalsView from "../GoalsView";
import PageShell from "../PageShell";
import WidgetBoundary from "../WidgetBoundary";
import ClientRouteViewport from "../layout/ClientRouteViewport";
import ClientToolbar from "../layout/ClientToolbar";
import ClientSubTabs from "../layout/ClientSubTabs";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { OPS_CHANNEL_TOOLBAR, OPS_INSIGHTS_GROUPS } from "../../lib/wireline-ops-design";

import FunnelView from "./FunnelView";
import AttributionView from "./AttributionView";
import TopicsView from "./TopicsView";
import HeatmapView from "./HeatmapView";
import LeaderboardView from "./LeaderboardView";
import FailureModesView from "./FailureModesView";
import VoiceLatencyView from "./VoiceLatencyView";
import AISpendView from "./AISpendView";
import QualityView from "./QualityView";

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;

const INSIGHT_GROUP_TABS = [
  { id: "performance", label: "Performance", icon: BarChart3 },
  { id: "quality", label: "Quality", icon: Star },
  { id: "revenue", label: "Revenue", icon: Receipt },
] as const;

type InsightGroupId = (typeof INSIGHT_GROUP_TABS)[number]["id"];

export default function InsightsView() {
  const [days, setDays] = useState(30);
  const [activeGroup, setActiveGroup] = useState<InsightGroupId>("performance");

  const wrap = (label: string, node: React.ReactNode) => (
    <WidgetBoundary label={label}>
      <div className="flex-1 min-h-0 w-full scroll-viewport scroll-pb-safe pr-1 pb-4">{node}</div>
    </WidgetBoundary>
  );

  const allTabs = useMemo(
    () => [
      {
        id: "funnel",
        label: "Funnel",
        icon: TrendingUp,
        content: wrap("Funnel", <FunnelView days={days} />),
      },
      {
        id: "goals",
        label: "Goals",
        icon: Target,
        content: wrap("Goals", <GoalsView />),
      },
      {
        id: "attribution",
        label: "Attribution",
        icon: Megaphone,
        content: wrap("Attribution", <AttributionView days={days} />),
      },
      { id: "topics", label: "Topics", icon: Layers, content: wrap("Topics", <TopicsView />) },
      {
        id: "heatmap",
        label: "Heatmap",
        icon: Calendar,
        content: wrap("Heatmap", <HeatmapView days={days} />),
      },
      {
        id: "leaderboard",
        label: "Leaderboard",
        icon: Trophy,
        content: wrap("Leaderboard", <LeaderboardView days={days} />),
      },
      {
        id: "failures",
        label: "Failures",
        icon: AlertOctagon,
        content: wrap("Failures", <FailureModesView />),
      },
      {
        id: "latency",
        label: "Latency",
        icon: Gauge,
        content: wrap("Latency", <VoiceLatencyView days={days} />),
      },
      {
        id: "spend",
        label: "AI Spend",
        icon: Receipt,
        content: wrap("AI Spend", <AISpendView days={days} />),
      },
      {
        id: "quality",
        label: "Quality",
        icon: Star,
        content: wrap("Quality", <QualityView days={days} />),
      },
    ],
    [days],
  );

  const groupTabIds =
    OPS_INSIGHTS_GROUPS.find((g) => g.id === activeGroup)?.tabs ?? OPS_INSIGHTS_GROUPS[0].tabs;

  const visibleTabs = allTabs.filter((tab) => (groupTabIds as readonly string[]).includes(tab.id));

  const dayPicker = (
    <div className="flex items-center gap-px p-1 rounded-full border border-black/8 bg-black/[0.03]">
      {DAY_OPTIONS.map((d) => (
        <ShadButton
          key={d}
          type="button"
          disableAnimations
          variant={days === d ? "default" : "ghost"}
          size="sm"
          onClick={() => setDays(d)}
          data-testid={`insights-days-${d}`}
          className={cn(
            "app-segment-btn h-9 sm:h-7 px-3 rounded-full text-xs sm:text-[11px] font-medium tracking-wide",
            days === d
              ? "bg-brand text-on-brand shadow-sm shadow-brand/25"
              : "text-muted hover:text-ink",
          )}
        >
          {d}d
        </ShadButton>
      ))}
    </div>
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

      <ClientSubTabs
        tabs={[...INSIGHT_GROUP_TABS]}
        activeId={activeGroup}
        onChange={(id) => setActiveGroup(id as InsightGroupId)}
        aria-label="Insights categories"
        layoutIdPrefix="insights-group"
      />

      <PageShell
        key={activeGroup}
        title=""
        eyebrow=""
        subtitle=""
        defaultTab={visibleTabs[0]?.id}
        tabs={visibleTabs}
      />
    </ClientRouteViewport>
  );
}
