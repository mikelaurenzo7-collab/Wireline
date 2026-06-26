import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/shadcn/Tooltip";
import { cn } from "@/lib/utils";

export const helpTooltipVariants = cva("max-w-xs whitespace-normal text-xs leading-relaxed", {
  variants: {
    align: {
      start: "",
      center: "",
      end: "",
    },
  },
  defaultVariants: { align: "center" },
});

export interface HelpTooltipProps extends VariantProps<typeof helpTooltipVariants> {
  content: React.ReactNode;
  title?: React.ReactNode;
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  triggerClassName?: string;
  children?: React.ReactElement;
}

export function HelpTooltip({
  content,
  title,
  label = "More information",
  side = "top",
  align,
  className,
  triggerClassName,
  children,
}: HelpTooltipProps) {
  const trigger = children ?? (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        triggerClassName,
      )}
    >
      <HelpCircle aria-hidden="true" className="size-3.5" />
    </button>
  );

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align ?? undefined}
          data-slot="help-tooltip"
          className={cn(helpTooltipVariants({ align }), className)}
        >
          {title ? <p className="mb-1 font-semibold text-foreground">{title}</p> : null}
          <div>{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
