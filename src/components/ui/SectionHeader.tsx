import React from "react";
import { cn } from "../../lib/utils";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
  /** Renders a delicate hairline divider beneath the header (default true for consistency) */
  divider?: boolean;
  /**
   * editorial — Fraunces display (marketing-forward).
   * instrument — sans semibold (authenticated product surfaces).
   */
  tone?: "editorial" | "instrument";
}

/**
 * SectionHeader — consistent editorial header used across the product.
 * Use for every major content block (empty states, panels, page sections).
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
  actions,
  divider = true,
  tone = "instrument",
}: SectionHeaderProps) {
  const editorial = tone === "editorial";

  return (
    <div className={cn("flex flex-col", className)}>
      {eyebrow && (
        <p
          className={cn(
            editorial ? "app-section-title text-brand/70" : WL_APP_CLASSES.proEyebrow,
            "mb-1",
          )}
        >
          {eyebrow}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3
            className={cn(
              editorial
                ? "font-display italic text-[21px] leading-[1.05] text-ink tracking-[-0.01em]"
                : WL_APP_CLASSES.proTitle,
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted max-w-prose text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0 self-start pt-0.5">{actions}</div>}
      </div>
      {divider && <div className="mt-3 aurora-divider" aria-hidden="true" />}
    </div>
  );
}
