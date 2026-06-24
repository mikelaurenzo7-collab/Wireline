import * as React from "react";
import { CheckCircle2, CircleAlert, Clock3, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const conversationActivityVariants = cva(
  "flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm",
  {
    variants: {
      state: {
        pending: "border-[var(--wl-info-border)] bg-[var(--wl-info-surface)] text-foreground",
        active: "border-[var(--wl-warning-border)] bg-[var(--wl-warning-surface)] text-foreground",
        complete: "border-[var(--wl-success-border)] bg-[var(--wl-success-surface)] text-foreground",
        failed: "border-[var(--wl-error-border)] bg-[var(--wl-error-surface)] text-foreground",
      },
    },
    defaultVariants: { state: "pending" },
  },
);

export interface ConversationActivityProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof conversationActivityVariants> {
  title: React.ReactNode;
  detail?: React.ReactNode;
  timestamp?: React.ReactNode;
  icon?: React.ReactNode;
}

function defaultIcon(state: NonNullable<ConversationActivityProps["state"]>) {
  if (state === "complete") return <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-success)]" />;
  if (state === "active") return <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-warning)]" />;
  if (state === "failed") return <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-error)]" />;
  return <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-info)]" />;
}

const ConversationActivity = React.forwardRef<HTMLDivElement, ConversationActivityProps>(
  ({ state = "pending", title, detail, timestamp, icon, className, ...props }, ref) => (
    <div ref={ref} data-slot="conversation-activity" data-state={state} className={cn(conversationActivityVariants({ state }), className)} {...props}>
      {icon ?? defaultIcon(state)}
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {detail ? <p className="mt-1 leading-5 text-muted-foreground">{detail}</p> : null}
        {timestamp ? <p className="mt-2 text-xs text-muted-foreground">{timestamp}</p> : null}
      </div>
    </div>
  ),
);
ConversationActivity.displayName = "ConversationActivity";

export { ConversationActivity };
