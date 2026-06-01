import React from "react";
import { cn } from "../../lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
  /** Renders a delicate hairline divider beneath the header (default true for consistency) */
  divider?: boolean;
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
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {eyebrow && (
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-brand/65 mb-1">
          {eyebrow}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display italic text-[21px] leading-[1.05] text-ink tracking-[-0.01em]">
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-[13px] leading-snug text-muted max-w-prose">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0 self-start pt-0.5">{actions}</div>}
      </div>
      {divider && (
        <div className="mt-3 h-px w-full bg-gradient-to-r from-black/8 via-black/4 to-transparent dark:from-white/8 dark:via-white/4" />
      )}
    </div>
  );
}
