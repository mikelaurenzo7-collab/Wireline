/**
 * PulseRing — Concentric ripple animation primitive.
 *
 * Renders expanding concentric rings emanating from a center point.
 * Used for status emphasis, attention anchoring, and focus states.
 * Each ring fades and scales outward with staggered timing for a
 * sonar/ripple effect.
 *
 * The rings are pure CSS — no JS animation frames needed. GPU-composited
 * via transform + opacity on separate layers.
 *
 * Usage:
 *   <PulseRing rings={3} color="brand" size="md" />
 *   <PulseRing rings={2} color="emerald" active={isLive} />
 */
import React from "react";
import { cn } from "../../lib/utils";

type PulseColor = "brand" | "emerald" | "destructive" | "muted";
type PulseSize = "sm" | "md" | "lg";

interface PulseRingProps {
  /** Number of concentric rings (1–5). Default 3. */
  rings?: number;
  /** Color preset. Default "brand". */
  color?: PulseColor;
  /** Size of the outermost ring. Default "md". */
  size?: PulseSize;
  /** Whether the pulse is active. When false, rings are static and muted. */
  active?: boolean;
  /** Optional child content rendered at the center. */
  children?: React.ReactNode;
  className?: string;
}

const SIZE_MAP: Record<PulseSize, string> = {
  sm: "w-8 h-8",
  md: "w-14 h-14",
  lg: "w-24 h-24",
};

/**
 * PulseRing — concentric sonar ripple for status emphasis.
 */
export function PulseRing({
  rings = 3,
  color = "brand",
  size = "md",
  active = true,
  children,
  className,
}: PulseRingProps) {
  const ringCount = Math.max(1, Math.min(5, rings));

  return (
    <div
      className={cn(
        "pulse-ring relative inline-flex items-center justify-center",
        `pulse-ring--${color}`,
        active && "pulse-ring--active",
        SIZE_MAP[size],
        className,
      )}
      data-rings={ringCount}
      aria-hidden="true"
    >
      {Array.from({ length: ringCount }, (_, i) => (
        <span
          key={i}
          className="pulse-ring__ring absolute inset-0 rounded-full"
          data-circular
          data-index={i}
        />
      ))}

      <span className="pulse-ring__core absolute rounded-full" data-circular />

      {children && (
        <span className="relative z-[1] inline-flex items-center justify-center">{children}</span>
      )}
    </div>
  );
}
