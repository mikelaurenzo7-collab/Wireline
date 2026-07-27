import React from "react";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { cn } from "../../lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  /** Renders a delicate hairline divider beneath the header. */
  divider?: boolean;
  /** Marketing retains the same Inter hierarchy at a larger scale. */
  tone?: "marketing" | "instrument";
  /** Page titles use display treatment; nested empties use UI sans to avoid competing headline stacks. */
  titleTone?: "display" | "ui";
}

/** Shared section hierarchy for product and marketing surfaces. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
  actions,
  divider = true,
  tone = "instrument",
  titleTone = "display",
}: SectionHeaderProps) {
  const marketing = tone === "marketing";

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {eyebrow && (
        <p className={cn(marketing ? "wl-stitch-eyebrow" : WL_APP_CLASSES.proEyebrow, "mb-1")}>
          {eyebrow}
        </p>
      )}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "max-w-full break-words text-balance",
              marketing
                ? "wl-stitch-headline text-[var(--wireline-typography-h3-size)]"
                : titleTone === "ui"
                  ? "text-base font-semibold tracking-tight text-foreground"
                  : WL_APP_CLASSES.proTitle,
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 max-w-prose break-words text-pretty text-[var(--wireline-typography-caption-size)] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="w-full min-w-0 shrink-0 [&>*]:w-full sm:w-auto sm:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
      {divider && <div className="mt-3 wl-divider" aria-hidden="true" />}
    </div>
  );
}