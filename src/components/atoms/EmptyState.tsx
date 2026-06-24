import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const emptyStateVariants = cva(
  "flex flex-col items-center justify-center text-center",
  {
    variants: {
      density: {
        inline:
          "rounded-[var(--radius-lg)] border border-dashed border-[var(--wl-line-strong)] bg-[var(--wl-surface-subtle)] px-4 py-5",
        panel:
          "min-h-[280px] rounded-[var(--radius-xl)] border border-dashed border-[var(--wl-line)] bg-[var(--wl-surface)] px-6 py-10",
        compact: "px-3 py-4",
      },
    },
    defaultVariants: {
      density: "inline",
    },
  },
);

export interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  density,
}: EmptyStateProps) {
  return (
    <section className={cn(emptyStateVariants({ density }), className)} aria-label={title}>
      {icon ? <div className="mb-3 text-primary [&_svg]:size-5" aria-hidden="true">{icon}</div> : null}
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
