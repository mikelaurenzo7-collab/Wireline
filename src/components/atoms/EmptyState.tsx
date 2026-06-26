import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const emptyStateVariants = cva(
  "wl-inline-empty flex flex-col items-center justify-center text-center",
  {
    variants: {
      density: {
        default: "py-8",
        compact: "py-4",
      },
    },
    defaultVariants: {
      density: "default",
    },
  },
);

export interface EmptyStateProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
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
      {icon && <div className="mb-3 text-2xl text-muted-foreground">{icon}</div>}
      <h2 className="wl-inline-empty__label text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
