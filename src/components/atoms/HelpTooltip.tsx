import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const helpTooltipVariants = cva(
  "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
  {
    variants: {
      align: {
        center: "left-1/2 -translate-x-1/2",
        start: "left-0 translate-x-0",
        end: "right-0 left-auto translate-x-0",
      },
    },
    defaultVariants: { align: "center" },
  },
);

export interface HelpTooltipProps extends VariantProps<typeof helpTooltipVariants> {
  content: React.ReactNode;
  label?: string;
  className?: string;
  triggerClassName?: string;
}

export function HelpTooltip({
  content,
  label = "More information",
  align,
  className,
  triggerClassName,
}: HelpTooltipProps) {
  const tooltipId = React.useId();

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName,
        )}
      >
        <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        data-slot="help-tooltip"
        className={cn(helpTooltipVariants({ align }), className)}
      >
        {content}
      </span>
    </span>
  );
}
