import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full border font-mono text-[0.6875rem] font-semibold leading-4 tracking-[0.06em] uppercase",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        info: "border-[var(--wl-info-border)] bg-[var(--wl-info-surface)] text-[var(--wl-info)]",
        success: "border-[var(--wl-success-border)] bg-[var(--wl-success-surface)] text-[var(--wl-success)]",
        warning: "border-[var(--wl-warning-border)] bg-[var(--wl-warning-surface)] text-[var(--wl-warning)]",
        danger: "border-[var(--wl-error-border)] bg-[var(--wl-error-surface)] text-[var(--wl-error)]",
        accent: "border-primary/20 bg-primary/10 text-primary",
      },
      size: {
        sm: "px-2 py-0.5",
        md: "px-2.5 py-1",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Backwards-compatible alias retained during migration. */
  variant?: "default" | "success" | "warning" | "destructive";
}

const legacyTone: Record<NonNullable<BadgeProps["variant"]>, NonNullable<BadgeProps["tone"]>> = {
  default: "neutral",
  success: "success",
  warning: "warning",
  destructive: "danger",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone: tone ?? (variant ? legacyTone[variant] : undefined), size }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
