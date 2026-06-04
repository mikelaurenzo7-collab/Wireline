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
import { cn } from "../../lib/utils";
import CsvExportButton from "../CsvExportButton";
import GoalsView from "../GoalsView";
import PageShell from "../PageShell";
import WidgetBoundary from "../WidgetBoundary";
import ClientRouteViewport from "../layout/ClientRouteViewport";
import { ShadButton } from "../ui/shadcn/ShadButton";

// Domain sub-views — one file per tab.
import FunnelView from "./FunnelView";
import AttributionView from "./AttributionView";
import TopicsView from "./TopicsView";
import HeatmapView from "./HeatmapView";
import LeaderboardView from "./LeaderboardView";
import FailureModesView from "./FailureModesView";
import VoiceLatencyView from "./VoiceLatencyView";
import AISpendView from "./AISpendView";
import QualityView from "./QualityView";

export default function InsightsView() {
  const [days, setDays] = useState(30);

  const wrap = (label: string, node: React.ReactNode) => (
    <WidgetBoundary label={label}>
      <div className="h-full min-h-0 w-full scroll-viewport pr-1">{node}</div>
    </WidgetBoundary>
  );

  const DAY_OPTIONS = [7, 14, 30, 60, 90];

  return (
    <ClientRouteViewport>
      <PageShell
        title=""
        eyebrow=""
        subtitle=""
        actions={
          <>
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
    </ClientRouteViewport>
  );
}
