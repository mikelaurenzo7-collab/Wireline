/**
 * SignalThread — Animated data-flow visualization for live connections.
 *
 * Renders a dynamic SVG path with travelling light pulses that represent
 * data flowing through Wireline's infrastructure. Used as an ambient
 * decoration on dashboards and live-ops panels to communicate that the
 * system is alive and processing.
 *
 * The "thread" is a curved Bézier path with configurable tension. Light
 * pulses travel along it using SVG `<animateMotion>`, creating a fiber-
 * optic data-stream aesthetic unique to Wireline.
 *
 * Reduced-motion safe — renders a static gradient stroke when disabled.
 *
 * Usage:
 *   <SignalThread direction="left-to-right" pulses={3} />
 *   <SignalThread direction="top-to-bottom" tension={0.6} color="brand" />
 */
import React, { useId, useMemo } from "react";
import { cn } from "../../lib/utils";

type ThreadDirection = "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
type ThreadColor = "brand" | "emerald" | "rose" | "muted";

interface SignalThreadProps {
  /** Flow direction. Default "left-to-right". */
  direction?: ThreadDirection;
  /** Number of travelling pulses. Default 2. */
  pulses?: number;
  /** Curve tension 0–1 (0 = straight, 1 = very curved). Default 0.4. */
  tension?: number;
  /** Pulse travel duration in seconds. Default 2.5. */
  speed?: number;
  /** Color theme. Default "brand". */
  color?: ThreadColor;
  /** Height of the SVG container. Default "48px". */
  height?: string;
  className?: string;
  /** Seed for deterministic curve variance. Default 13. */
  seed?: number;
}

const COLOR_MAP: Record<ThreadColor, { stroke: string; pulse: string; glow: string }> = {
  brand: {
    stroke: "rgba(139, 63, 214, 0.2)",
    pulse: "#8B3FD6",
    glow: "rgba(139, 63, 214, 0.6)",
  },
  emerald: {
    stroke: "rgba(16, 185, 129, 0.2)",
    pulse: "#10b981",
    glow: "rgba(16, 185, 129, 0.6)",
  },
  rose: {
    stroke: "rgba(232, 70, 106, 0.2)",
    pulse: "#E8466A",
    glow: "rgba(232, 70, 106, 0.6)",
  },
  muted: {
    stroke: "rgba(90, 83, 74, 0.15)",
    pulse: "#5A534A",
    glow: "rgba(90, 83, 74, 0.4)",
  },
};

function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePath(direction: ThreadDirection, tension: number, seed: number): string {
  const rng = seededRng(seed);
  const variance = tension * 25;

  switch (direction) {
    case "left-to-right":
      return `M 0 50 C ${25 + rng() * 10} ${50 - variance + rng() * variance * 2}, ${75 - rng() * 10} ${50 + variance - rng() * variance * 2}, 100 50`;
    case "right-to-left":
      return `M 100 50 C ${75 - rng() * 10} ${50 - variance + rng() * variance * 2}, ${25 + rng() * 10} ${50 + variance - rng() * variance * 2}, 0 50`;
    case "top-to-bottom":
      return `M 50 0 C ${50 - variance + rng() * variance * 2} ${25 + rng() * 10}, ${50 + variance - rng() * variance * 2} ${75 - rng() * 10}, 50 100`;
    case "bottom-to-top":
      return `M 50 100 C ${50 - variance + rng() * variance * 2} ${75 - rng() * 10}, ${50 + variance - rng() * variance * 2} ${25 + rng() * 10}, 50 0`;
  }
}

/**
 * SignalThread — data-flow fiber-optic visualization.
 */
export function SignalThread({
  direction = "left-to-right",
  pulses = 2,
  tension = 0.4,
  speed = 2.5,
  color = "brand",
  height = "48px",
  className,
  seed = 13,
}: SignalThreadProps) {
  const uid = useId().replace(/:/g, "");
  const pulseCount = Math.max(1, Math.min(6, pulses));
  const colors = COLOR_MAP[color];

  const pathD = useMemo(() => generatePath(direction, tension, seed), [direction, tension, seed]);

  return (
    <div
      className={cn("pointer-events-none select-none w-full", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={`signal-glow-${uid}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base thread path */}
        <path
          d={pathD}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Travelling pulses */}
        {Array.from({ length: pulseCount }, (_, i) => (
          <g key={i} filter={`url(#signal-glow-${uid})`}>
            <circle r="2" fill={colors.pulse} className="signal-thread-pulse">
              <animateMotion
                dur={`${speed}s`}
                repeatCount="indefinite"
                begin={`${(i / pulseCount) * speed}s`}
                path={pathD}
              />
            </circle>
            {/* Trailing glow */}
            <circle r="4" fill={colors.glow} opacity="0.3" className="signal-thread-pulse">
              <animateMotion
                dur={`${speed}s`}
                repeatCount="indefinite"
                begin={`${(i / pulseCount) * speed}s`}
                path={pathD}
              />
            </circle>
          </g>
        ))}
      </svg>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .signal-thread-pulse {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
