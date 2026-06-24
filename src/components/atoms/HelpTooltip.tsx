import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/Tooltip";
import { cn } from "@/lib/utils";

export interface HelpTooltipProps {
  content: React.ReactNode;
  label?: string;
  className?: string;
}

export function HelpTooltip({ content, label = "More information", className }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
              className,
            )}
          >
            <HelpCircle aria-hidden="true" size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-normal leading-5">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
