/**
 * InsightsView — Refactored Shell
 *
 * Previously a ~1900 LOC monolith. Each tab-view now lives in its own
 * file under /components/insights/. This shell only orchestrates the
 * day-range picker and the PageShell tab wiring.
 *
 * Extracted during the 2026 audit god-file slicing pass.
 */
import { useState } from "react";
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
} from "lucide-react";
import { cn } from "../lib/utils";
import CsvExportButton from "./CsvExportButton";
import GoalsView from "./GoalsView";
import PageShell from "./PageShell";
import WidgetBoundary from "./WidgetBoundary";

// Domain sub-views — one file per tab.
import FunnelView from "./insights/FunnelView";
import AttributionView from "./insights/AttributionView";
import TopicsView from "./insights/TopicsView";
import HeatmapView from "./insights/HeatmapView";
import LeaderboardView from "./insights/LeaderboardView";
import FailureModesView from "./insights/FailureModesView";
import VoiceLatencyView from "./insights/VoiceLatencyView";
import AISpendView from "./insights/AISpendView";
import QualityView from "./insights/QualityView";

export default function InsightsView() {
  const [days, setDays] = useState(30);

  const wrap = (label: string, node: React.ReactNode) => (
    <WidgetBoundary label={label}>
      <div className="h-full w-full overflow-y-auto scrollbar-hide pr-1">{node}</div>
    </WidgetBoundary>
  );

  const DAY_OPTIONS = [7, 14, 30, 60, 90];

  return (
    <PageShell
      eyebrow="Analytics · Business Intelligence"
      title="Insights"
      subtitle="Funnel analysis, topic clusters, heatmaps, leaderboards, and failure modes."
      actions={
        <>
          <div className="flex items-center gap-px p-1 rounded-full glass border border-black/8">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                data-testid={`insights-days-${d}`}
                className={cn(
                  "app-segment-btn h-9 sm:h-7 px-3 rounded-full text-xs sm:text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-95",
                  days === d
                    ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25"
                    : "text-muted hover:text-ink",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <CsvExportButton type="calls" label="CSV" />
        </>
      }
      tabs={[
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
      ]}
    />
  );
}
