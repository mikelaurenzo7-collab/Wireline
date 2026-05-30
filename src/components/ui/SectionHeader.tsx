import React from "react";
import { cn } from "../../lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
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
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {eyebrow && (
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">{eyebrow}</p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display italic text-2xl text-ink leading-tight">{title}</h3>
          {description && (
            <p className="mt-1.5 text-[13px] text-muted max-w-prose">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
