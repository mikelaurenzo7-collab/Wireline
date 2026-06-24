import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        info: "border-primary/20 bg-primary/10 text-primary",
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
