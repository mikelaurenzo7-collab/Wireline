import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * MetricTile — the letterpress KPI/stat tile. Wraps `wl-metric-tile` so the
 * four hand-rolled KPI rows (Overview, CallLogs, Knowledge, StudioCanvas)
 * stop re-implementing the same surface. Uses the display serif for the
 * value, the mono caption for the label, and the copper top wireline glow.
 * Optionally stagger the mount with `reveal` (1–5).
 */
export interface MetricTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** Optional 1–5 stagger index for the `wl-reveal` mount. */
  reveal?: 1 | 2 | 3 | 4 | 5;
}

const MetricTile = React.forwardRef<HTMLDivElement, MetricTileProps>(
  ({ className, label, value, detail, reveal, children, ...props }, ref) => (
    <article
      ref={ref}
      data-slot="metric-tile"
      className={cn(
        "wl-metric-tile",
        reveal ? `wl-reveal wl-reveal-${reveal}` : undefined,
        className,
      )}
      {...props}
    >
      <p className="wl-metric-tile__label">{label}</p>
      <div className="wl-metric-tile__value">{value}</div>
      {detail ? <p className="wl-metric-tile__detail">{detail}</p> : null}
      {children}
    </article>
  ),
);
MetricTile.displayName = "MetricTile";

export { MetricTile };
