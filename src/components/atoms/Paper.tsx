import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Paper — the letterpress surface primitive. Wraps the `wl-paper` family so
 * card surfaces stop mixing `studio-card`, `wl-panel`, and ad-hoc `border +
 * bg-card` patterns. The default variant reads as printed paper with a soft
 * inset highlight; `elevated` adds the deeper inset + md shadow; `recessed`
 * inverts to a deeper warm-black for consoles and wells.
 */
export const paperVariants = cva("wl-transition-press", {
  variants: {
    variant: {
      default: "wl-paper",
      elevated: "wl-paper-elevated",
      recessed: "wl-letterpress-recessed",
      letterpress: "wl-letterpress",
      raised: "wl-letterpress-raised",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface PaperProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof paperVariants> {
  /** Adds the press lift/hover affordance for click-through surfaces. */
  interactive?: boolean;
}

const Paper = React.forwardRef<HTMLDivElement, PaperProps>(
  ({ className, variant, interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="paper"
      data-variant={variant ?? "default"}
      className={cn(
        paperVariants({ variant }),
        interactive && "wl-press wl-focus-ring-halo",
        className,
      )}
      {...props}
    />
  ),
);
Paper.displayName = "Paper";

export { Paper };
