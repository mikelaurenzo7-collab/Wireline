import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Chip — the letterpress status pill. Wraps the `wl-chip` family so surfaces
 * stop hand-rolling `rounded-full border px-3 py-1.5` pills with mixed palettes.
 * Pass `tone` to pick a semantic variant; the optional `dot` renders the
 * status indicator dot. Honors reduced motion through the CSS layer.
 */
export const chipVariants = cva("wl-chip", {
  variants: {
    tone: {
      neutral: "",
      success: "wl-chip--success",
      warning: "wl-chip--warning",
      error: "wl-chip--error",
      info: "wl-chip--info",
      primary: "wl-chip--primary",
      wire: "wl-chip--wire",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">, VariantProps<typeof chipVariants> {
  /** Renders the status indicator dot. */
  dot?: boolean;
}

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone, dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="chip"
      data-tone={tone ?? "neutral"}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    >
      {dot ? <span className="wl-chip__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  ),
);
Chip.displayName = "Chip";

export { Chip };
