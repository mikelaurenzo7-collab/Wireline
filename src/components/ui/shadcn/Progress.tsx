import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../../../lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
}

/** Usage can exceed 100% (overage); the bar must still stop at the track end. */
function clampPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.min(100, Math.max(0, value as number));
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      {/*
        The indicator is w-full by design (Radix fills the track and the fill
        level is expressed as a transform). Without that transform it stayed
        visually full at every value: the Voice minutes meter on Settings ->
        Billing read "0 / 120 · 0% used" beside a completely full bar, and a
        tenant at 95% saw exactly the same bar. data-progress is decorative --
        no stylesheet reads it -- so nothing was compensating.
      */}
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - clampPercent(value)}%)` }}
        data-progress={`${clampPercent(value)}%`}
      />
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
