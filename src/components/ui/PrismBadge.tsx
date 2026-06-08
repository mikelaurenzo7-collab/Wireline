/**
 * PrismBadge — Holographic prismatic status badge.
 *
 * A premium badge/pill that refracts light across its surface with a
 * continuously-shifting holographic gradient. The iridescent shimmer
 * makes status indicators, feature tags, and tier labels feel high-end
 * and unmistakably Wireline.
 *
 * The holographic effect uses a conic-gradient that rotates via CSS
 * @property animation — pure CSS, zero JS paint cost, GPU-composited.
 *
 * Variants:
 *   "live"    — pulsing holographic (draws attention)
 *   "static"  — frozen holographic gradient (for labels)
 *   "ghost"   — subtle outline-only with faint holographic fill
 *
 * Usage:
 *   <PrismBadge variant="live">LIVE</PrismBadge>
 *   <PrismBadge variant="static" size="sm">Pro</PrismBadge>
 */
import React from "react";
import { cn } from "../../lib/utils";

type PrismVariant = "live" | "static" | "ghost";
type PrismSize = "xs" | "sm" | "md";

interface PrismBadgeProps {
  children: React.ReactNode;
  /** Visual variant. Default "static". */
  variant?: PrismVariant;
  /** Size preset. Default "sm". */
  size?: PrismSize;
  className?: string;
}

const SIZE_CLASSES: Record<PrismSize, string> = {
  xs: "px-1.5 py-0.5 wl-micro-badge",
  sm: "px-2.5 py-1 wl-micro-badge",
  md: "px-3.5 py-1.5 text-[11px]",
};

/**
 * PrismBadge — holographic iridescent badge primitive.
 */
export function PrismBadge({
  children,
  variant = "static",
  size = "sm",
  className,
}: PrismBadgeProps) {
  const isAnimated = variant === "live";

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center font-mono font-semibold uppercase tracking-[0.18em] rounded-full overflow-hidden prism-badge-surface",
        SIZE_CLASSES[size],
        variant === "ghost" && "prism-badge-ghost",
        className,
      )}
      data-circular
      data-variant={variant}
    >
      <span
        className={cn("absolute inset-0 prism-holo-layer", isAnimated && "prism-holo-animated")}
        aria-hidden="true"
      />

      <span className="absolute inset-0 prism-frost" aria-hidden="true" />

      <span
        className="absolute inset-0 rounded-full prism-specular-edge"
        aria-hidden="true"
        data-circular
      />

      <span className="relative z-[1] text-brand-deep mix-blend-multiply">{children}</span>
    </span>
  );
}
