import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const metricCardVariants = cva(
  "wl-panel flex min-w-0 flex-col gap-3 rounded-xl border p-4",
  {
    variants: {
      tone: {
        default: "border-border bg-card",
        positive:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)]",
        warning:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)]",
        danger:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

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
  const trendClass =
    trend === "up"
      ? "text-[var(--wireline-color-status-success)]"
      : trend === "down"
        ? "text-[var(--wireline-color-status-error)]"
        : "text-muted-foreground";

  return (
    <section
      data-slot="metric-card"
      className={cn(metricCardVariants({ tone }), "transition-colors", className)}
      {...props}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium tracking-[0.005em] text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <output className="min-w-0 truncate text-[26px] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
          {value}
        </output>
        {delta ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
              trendClass,
            )}
          >
            <TrendIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {delta}
          </span>
        ) : null}
      </div>
      {footer ? (
        <div className="border-t border-border/70 pt-2.5 text-[12px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
