import { cn } from "../../lib/utils";
import { WL_STAT_CLASSES } from "../../lib/wireline-ops-design";
import { AnimatedCounter } from "./AnimatedCounter";

export type MetricStatTone = "brand" | "ink" | "rose" | "muted";

const TILE: Record<MetricStatTone, string> = {
  brand: WL_STAT_CLASSES.tileBrand,
  ink: WL_STAT_CLASSES.tileInk,
  rose: WL_STAT_CLASSES.tileRose,
  muted: WL_STAT_CLASSES.tileMuted,
};

const VALUE: Record<MetricStatTone, string> = {
  brand: WL_STAT_CLASSES.valueBrand,
  ink: WL_STAT_CLASSES.valueInk,
  rose: WL_STAT_CLASSES.valueRose,
  muted: WL_STAT_CLASSES.valueMuted,
};

type MetricStatTileProps = {
  label: string;
  value: number;
  tone?: MetricStatTone;
  className?: string;
};

/** Compact KPI tile — founder dashboard, insights grids, ops summaries. */
export function MetricStatTile({ label, value, tone = "brand", className }: MetricStatTileProps) {
  return (
    <div className={cn(TILE[tone], "wl-card-lift", className)}>
      <AnimatedCounter value={value} className={VALUE[tone]} />
      <div className={WL_STAT_CLASSES.label}>{label}</div>
    </div>
  );
}
