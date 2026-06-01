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

const COLOR_MAP: Record<PulseColor, { ring: string; core: string }> = {
  brand: {
    ring: "rgba(139, 63, 214, 0.25)",
    core: "rgba(139, 63, 214, 0.6)",
  },
  emerald: {
    ring: "rgba(16, 185, 129, 0.25)",
    core: "rgba(16, 185, 129, 0.6)",
  },
  destructive: {
    ring: "rgba(232, 70, 106, 0.25)",
    core: "rgba(232, 70, 106, 0.6)",
  },
  muted: {
    ring: "rgba(90, 83, 74, 0.15)",
    core: "rgba(90, 83, 74, 0.4)",
  },
};

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
  const { ring: ringColor, core: coreColor } = COLOR_MAP[color];
  const ringCount = Math.max(1, Math.min(5, rings));

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", SIZE_MAP[size], className)}
      aria-hidden="true"
    >
      {/* Concentric rings */}
      {Array.from({ length: ringCount }, (_, i) => {
        const scale = 0.4 + (i + 1) * (0.6 / ringCount);
        const delay = i * 0.4;
        const opacity = 1 - (i / ringCount) * 0.6;

        return (
          <span
            key={i}
            className="absolute inset-0 rounded-full"
            data-circular
            style={{
              border: `1.5px solid ${ringColor}`,
              opacity: active ? opacity : opacity * 0.3,
              transform: `scale(${scale})`,
              animation: active
                ? `pulse-ring-expand ${2 + ringCount * 0.3}s ease-out ${delay}s infinite`
                : undefined,
            }}
          />
        );
      })}

      {/* Core dot */}
      <span
        className="absolute rounded-full"
        data-circular
        style={{
          width: "30%",
          height: "30%",
          backgroundColor: coreColor,
          boxShadow: active ? `0 0 12px ${ringColor}` : undefined,
          opacity: active ? 1 : 0.5,
        }}
      />

      {/* Child content (centered) */}
      {children && (
        <span className="relative z-[1] inline-flex items-center justify-center">{children}</span>
      )}
    </div>
  );
}
