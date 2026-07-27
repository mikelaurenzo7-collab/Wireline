import * as React from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const statusNoticeVariants = cva(
  "rounded-[var(--wireline-radius-lg)] border px-4 py-3 text-left text-sm text-[var(--wireline-color-text-primary)]",
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
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof statusNoticeVariants> {
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
  ({ tone = "info", title, icon, action, className, children, ...props }, ref) => {
    const resolvedTone = tone ?? "info";

    return (
      <div
        ref={ref}
        data-slot="status-notice"
        role={tone === "destructive" ? "alert" : "status"}
        className={cn(statusNoticeVariants({ tone: resolvedTone }), className)}
        {...props}
      >
        <div className="flex min-w-0 items-start gap-3">
          {icon ?? defaultIcon(resolvedTone)}
          <div className="min-w-0 flex-1 break-words">
            {title ? <p className="font-semibold leading-5 text-foreground">{title}</p> : null}
            <div
              className={cn(
                "max-w-prose break-words leading-5 text-muted-foreground",
                title && "mt-1",
              )}
            >
              {children}
            </div>
          </div>
        </div>
        {action ? (
          <div className="mt-3 w-full min-w-0 pl-7 [&>*]:w-full sm:ml-7 sm:w-auto sm:pl-0 sm:[&>*]:w-auto">
            {action}
          </div>
        ) : null}
      </div>
    );
  },
);
StatusNotice.displayName = "StatusNotice";

export { StatusNotice };