import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        success:
          "border-[var(--wl-success-border)] bg-[var(--wl-success-surface)] text-[var(--wl-success)]",
        warning:
          "border-[var(--wl-warning-border)] bg-[var(--wl-warning-surface)] text-[var(--wl-warning)]",
        destructive:
          "border-[var(--wl-error-border)] bg-[var(--wl-error-surface)] text-[var(--wl-error)]",
        info: "border-[var(--wl-info-border)] bg-[var(--wl-info-surface)] text-[var(--wl-info)]",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="badge"
    className={cn(badgeVariants({ variant }), className)}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
