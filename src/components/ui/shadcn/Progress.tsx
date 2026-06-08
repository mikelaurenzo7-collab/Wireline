import * as React from "react";
import type { CSSProperties } from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../../../lib/utils";
import { asStyle } from "@/src/lib/css-style";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary transition-all wl-progress-indicator",
          indicatorClassName,
        )}
        style={asStyle({ "--progress-pct": `${value || 0}%` }) as CSSProperties}
      />
    </ProgressPrimitive.Root>
  ),
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
