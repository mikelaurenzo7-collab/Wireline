import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  trend?: Trend;
  trendLabel?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

const trendMeta = {
  up: { icon: ArrowUpRight, tone: "text-[var(--wl-success)]" },
  down: { icon: ArrowDownRight, tone: "text-[var(--wl-error)]" },
  flat: { icon: Minus, tone: "text-muted-foreground" },
} as const;

export function MetricCard({ label, value, description, trend, trendLabel, icon, className }: MetricCardProps) {
  const TrendIcon = trend ? trendMeta[trend].icon : null;

  return (
    <section className={cn("rounded-[var(--radius-xl)] border border-border bg-card p-5 shadow-[var(--wl-shadow-sm)]", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="grid size-8 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p className="mt-5 font-[var(--wl-font-display)] text-3xl font-semibold tracking-[-0.04em] text-foreground">
        {value}
      </p>
      {description || trendLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-muted-foreground">
          {TrendIcon ? <TrendIcon aria-hidden="true" className={cn("size-4", trendMeta[trend!].tone)} /> : null}
          {trendLabel ? <span className={trend ? trendMeta[trend].tone : undefined}>{trendLabel}</span> : null}
          {description ? <span>{description}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
