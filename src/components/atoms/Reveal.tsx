import * as React from "react";

import { cn } from "@/lib/utils";

export type RevealStep = 1 | 2 | 3 | 4 | 5;

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger index 1–5. Steps beyond 5 fall back to the base reveal. */
  step?: RevealStep;
  as?: React.ElementType;
}

/**
 * Reveal — gentle mount for lists, cards, and sections. Wraps `wl-reveal`
 * (and `wl-reveal-1..5`) so surfaces stop hand-rolling `style={{ animationDelay }}`.
 * Honors `prefers-reduced-motion` through the CSS layer. Wrap a list with
 * `Reveal` items rather than animating a parent.
 */
export const Reveal = React.forwardRef<HTMLDivElement, RevealProps>(
  ({ className, step, as: Tag = "div", children, ...props }, ref) => (
    <Tag
      ref={ref}
      data-slot="reveal"
      className={cn(
        "wl-reveal",
        step && step >= 1 && step <= 5 ? `wl-reveal-${step}` : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  ),
);
Reveal.displayName = "Reveal";
