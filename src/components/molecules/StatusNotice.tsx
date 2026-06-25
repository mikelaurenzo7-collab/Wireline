import * as React from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const statusNoticeVariants = cva(
  "flex items-start gap-3 rounded-[var(--wireline-radius-lg)] border px-4 py-3 text-sm text-[var(--wireline-color-text-primary)]",
  {
    variants: {
      tone: {
        info: "border-[var(--wireline-color-feedback-info-border)] bg-[var(--wireline-color-feedback-info-surface)]",
        success:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)]",
        warning:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)]",
        destructive:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)]",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  },
);

export interface StatusNoticeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof statusNoticeVariants> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

function defaultIcon(tone: NonNullable<StatusNoticeProps["tone"]>) {
  if (tone === "success")
    return (
      <CircleCheck
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-success)]"
      />
    );
  if (tone === "warning")
    return (
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-warning)]"
      />
    );
  if (tone === "destructive")
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

const StatusNotice = React.forwardRef<HTMLDivElement, StatusNoticeProps>(
  ({ tone = "info", title, icon, action, className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="status-notice"
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(statusNoticeVariants({ tone }), className)}
      {...props}
    >
      {icon ?? defaultIcon(tone)}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className={title ? "mt-1 text-muted-foreground" : "text-muted-foreground"}>
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  ),
);
StatusNotice.displayName = "StatusNotice";

export { StatusNotice };
