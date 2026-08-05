import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  // A badge is counts and one-word states; it never wraps internally. The
  // "Not connected" state wrapped to two lines inside the 340px Salesforce
  // summary card and collided with the card title.
  "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-text-primary)]",
        success:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
        warning:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)]",
        destructive:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] text-[var(--wireline-color-status-error)]",
        info: "border-[var(--wireline-color-feedback-info-border)] bg-[var(--wireline-color-feedback-info-surface)] text-[var(--wireline-color-status-info)]",
        outline:
          "border-[var(--wireline-color-border-default)] bg-transparent text-[var(--wireline-color-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
