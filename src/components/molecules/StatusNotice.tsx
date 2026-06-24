import * as React from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const statusNoticeVariants = cva(
  "flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm text-foreground",
  {
    variants: {
      tone: {
        info: "border-[var(--wl-info-border)] bg-[var(--wl-info-surface)]",
        success: "border-[var(--wl-success-border)] bg-[var(--wl-success-surface)]",
        warning: "border-[var(--wl-warning-border)] bg-[var(--wl-warning-surface)]",
        destructive: "border-[var(--wl-error-border)] bg-[var(--wl-error-surface)]",
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
}

function defaultIcon(tone: NonNullable<StatusNoticeProps["tone"]>) {
  if (tone === "success") return <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-success)]" />;
  if (tone === "warning") return <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-warning)]" />;
  if (tone === "destructive") return <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-error)]" />;
  return <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--wl-info)]" />;
}

const StatusNotice = React.forwardRef<HTMLDivElement, StatusNoticeProps>(
  ({ tone = "info", title, icon, className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="status-notice"
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(statusNoticeVariants({ tone }), className)}
      {...props}
    >
      {icon ?? defaultIcon(tone)}
      <div className="min-w-0">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className={title ? "mt-1 text-muted-foreground" : "text-muted-foreground"}>{children}</div>
      </div>
    </div>
  ),
);
StatusNotice.displayName = "StatusNotice";

export { StatusNotice };
