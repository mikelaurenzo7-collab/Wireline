/**
 * InlineEmpty — minimal inline empty-state indicator.
 *
 * Replaces the decorative full-panel EmptyState (Medallion + float animation)
 * in dense grid panels where vertical space is precious. Total height ≤ 48px.
 */
import React from "react";
import { cn } from "../../lib/utils";

interface InlineEmptyProps {
  /** Short message like "No hot leads" or "All clear" */
  label: string;
  /** Optional tiny Lucide icon (rendered at 14px) */
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Optional accent color for the icon */
  accent?: string;
  className?: string;
}

export function InlineEmpty({ label, icon: Icon, accent, className }: InlineEmptyProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-3 px-4 text-center", className)}>
      {Icon && (
        <Icon
          className="w-3.5 h-3.5 shrink-0 opacity-60"
          style={accent ? { color: accent } : undefined}
        />
      )}
      <span className="text-[11px] leading-snug text-muted">{label}</span>
    </div>
  );
}
