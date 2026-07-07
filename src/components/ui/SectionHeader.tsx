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
}

/** Shared Stitch-style section hierarchy for product and marketing surfaces. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
  actions,
  divider = true,
  tone = "instrument",
}: SectionHeaderProps) {
  const marketing = tone === "marketing";

  return (
    <div className={cn("flex flex-col", className)}>
      {eyebrow && (
        <p className={cn(marketing ? "wl-stitch-eyebrow" : WL_APP_CLASSES.proEyebrow, "mb-1")}>
          {eyebrow}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3
            className={cn(
              marketing
                ? "wl-stitch-headline text-[var(--wireline-typography-h3-size)]"
                : WL_APP_CLASSES.proTitle,
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 max-w-prose text-[var(--wireline-typography-caption-size)] leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 self-start pt-0.5">{actions}</div>}
      </div>
      {divider && <div className="mt-3 wl-divider" aria-hidden="true" />}
    </div>
  );
}
