import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const metricCardVariants = cva("wl-panel flex min-w-0 flex-col gap-3 rounded-xl border p-4", {
  variants: {
    tone: {
      default: "border-border bg-card",
      positive: "border-emerald-500/20 bg-emerald-500/5",
      warning: "border-amber-500/20 bg-amber-500/5",
      danger: "border-destructive/20 bg-destructive/5",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof metricCardVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon,
  footer,
  tone,
  className,
  ...props
}: MetricCardProps) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

  return (
    <section data-slot="metric-card" className={cn(metricCardVariants({ tone }), className)} {...props}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <output className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </output>
        {delta && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
              trend === "up" && "text-emerald-700 dark:text-emerald-300",
              trend === "down" && "text-destructive",
              trend === "neutral" && "text-muted-foreground",
            )}
          >
            <TrendIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {delta}
          </span>
        )}
      </div>
      {footer && <div className="border-t border-border pt-3 text-xs text-muted-foreground">{footer}</div>}
    </section>
  );
}
