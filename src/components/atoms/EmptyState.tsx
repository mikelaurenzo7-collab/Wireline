import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const emptyStateVariants = cva("wl-empty wl-press-highlight", {
  variants: {
    density: {
      default: "py-8",
      compact: "py-4",
      hero: "py-12 min-h-[18rem]",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export interface EmptyStateProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Renders an inline wireline copper accent before the title. */
  accent?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  accent = false,
  density,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      className={cn(emptyStateVariants({ density }), className)}
      {...props}
    >
      {icon ? <div className="wl-empty__icon">{icon}</div> : null}
      {accent ? (
        <span className="wl-eyebrow wl-eyebrow--no-rule text-[10px]">Ready when you are</span>
      ) : null}
      <h2 className="wl-empty__title">{title}</h2>
      {description ? <p className="wl-empty__detail">{description}</p> : null}
      {action ? <div className="wl-empty__actions">{action}</div> : null}
    </section>
  );
}
