import * as React from "react";
import { CheckCircle2, CircleAlert, Clock3, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const conversationActivityVariants = cva(
  "flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm",
  {
    variants: {
      state: {
        pending:
          "border-[var(--wireline-color-feedback-info-border)] bg-[var(--wireline-color-feedback-info-surface)] text-foreground",
        active:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] text-foreground",
        complete:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground",
        failed:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] text-foreground",
      },
    },
    defaultVariants: { state: "pending" },
  },
);

export interface ConversationActivityProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof conversationActivityVariants> {
  title: React.ReactNode;
  detail?: React.ReactNode;
  timestamp?: React.ReactNode;
  icon?: React.ReactNode;
}

function defaultIcon(state: NonNullable<ConversationActivityProps["state"]>) {
  if (state === "complete")
    return (
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-success)]"
      />
    );
  if (state === "active")
    return (
      <Clock3
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-warning)]"
      />
    );
  if (state === "failed")
    return (
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-error)]"
      />
    );
  return (
    <Info
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-info)]"
    />
  );
}

const ConversationActivity = React.forwardRef<HTMLDivElement, ConversationActivityProps>(
  ({ state = "pending", title, detail, timestamp, icon, className, ...props }, ref) => {
    const resolvedState = state ?? "pending";

    return (
      <div
        ref={ref}
        data-slot="conversation-activity"
        data-state={resolvedState}
        className={cn(conversationActivityVariants({ state: resolvedState }), className)}
        {...props}
      >
        {icon ?? defaultIcon(resolvedState)}
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          {detail ? <p className="mt-1 leading-5 text-muted-foreground">{detail}</p> : null}
          {timestamp ? <p className="mt-2 text-xs text-muted-foreground">{timestamp}</p> : null}
        </div>
      </div>
    );
  },
);
ConversationActivity.displayName = "ConversationActivity";

export { ConversationActivity };
