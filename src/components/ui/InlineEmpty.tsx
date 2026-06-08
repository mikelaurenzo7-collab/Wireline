/**

 * InlineEmpty — minimal inline empty-state indicator.

 *

 * Replaces the decorative full-panel EmptyState (Medallion + float animation)

 * in dense grid panels where vertical space is precious. Total height ≤ 48px.

 */

import React from "react";

import { cn } from "../../lib/utils";

import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

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
    <div className={cn(WL_APP_CLASSES.inlineEmpty, className)}>
      {Icon && (
        <Icon
          className={cn("w-3.5 h-3.5 shrink-0 opacity-60", accent && "wl-accent-text")}
          data-accent={accent}
        />
      )}

      <span className={WL_APP_CLASSES.inlineEmptyLabel}>{label}</span>
    </div>
  );
}
