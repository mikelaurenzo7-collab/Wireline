import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type EyebrowTone = "neutral" | "primary" | "muted";

const toneClass: Record<EyebrowTone, string> = {
  neutral: "",
  primary: "wl-eyebrow--primary",
  muted: "wl-eyebrow--muted",
};

export interface EyebrowProps {
  children: ReactNode;
  className?: string;
  /** Hide the copper wire rule. Default: show the rule. */
  noRule?: boolean;
  tone?: EyebrowTone;
  as?: ElementType;
}

/**
 * Eyebrow — the letterpress section kicker. Wraps `wl-eyebrow` (mono label +
 * copper wire rule) so surfaces stop hand-rolling `font-mono text-[10px]
 * uppercase tracking-[...]` wrappers. Use `tone="primary"` for patina, or
 * `tone="muted"` when the kicker sits under a heavier heading.
 *
 * Note: the wired variant (`wl-eyebrow--wired`) lives in `WiredEyebrow` and
 * carries the marketing wire-pulse; use that for public marketing surfaces
 * and `Eyebrow` for authenticated workspace surfaces.
 */
export function Eyebrow({
  children,
  className,
  noRule = false,
  tone = "neutral",
  as: Tag = "p",
}: EyebrowProps) {
  return (
    <Tag className={cn("wl-eyebrow", toneClass[tone], noRule && "wl-eyebrow--no-rule", className)}>
      {children}
    </Tag>
  );
}
