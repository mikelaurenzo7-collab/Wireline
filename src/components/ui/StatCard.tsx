import React from "react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  icon?: React.ElementType;
  value: string | number;
  label: string;
  description?: string;
  variant?: "default" | "hero" | "compact";
  accent?: boolean;
  sparkline?: React.ReactNode;
  className?: string;
}

const StatCard = React.memo(function StatCard({
  icon: Icon,
  value,
  label,
  description,
  variant = "default",
  accent = false,
  sparkline,
  className,
}: StatCardProps) {
  if (variant === "compact") {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <span className={cn("font-display italic text-lg", accent ? "text-brand" : "text-ink")}>
          {value}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{label}</span>
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <span
          className={cn(
            "font-display italic text-3xl md:text-4xl",
            accent ? "text-brand" : "text-brand",
          )}
        >
          {value}
        </span>
        <span className="text-caption text-muted">{label}</span>
        {sparkline && <div className="mt-1">{sparkline}</div>}
      </div>
    );
  }

  return (
    <div className={cn("glass border border-black/8 rounded-2xl p-5 card-interactive", className)}>
      <div className="flex items-start gap-3.5">
        {Icon && (
          <div className="bg-gradient-to-br from-brand to-brand-deep text-on-brand w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm shadow-brand/25 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className={cn(
              "font-display italic text-2xl text-ink leading-tight",
              accent && "text-brand",
            )}
          >
            {value}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {label}
          </span>
          {description && <p className="text-[13px] text-ink/70">{description}</p>}
          {sparkline && <div className="mt-1">{sparkline}</div>}
        </div>
      </div>
    </div>
  );
});

export default StatCard;
