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
import React, { useId } from "react";
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
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-2.5 py-1 text-[10px]",
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
  const uid = useId().replace(/:/g, "");
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
      style={{
        background: variant === "ghost" ? "transparent" : undefined,
      }}
    >
      {/* Holographic gradient layer */}
      <span
        className={cn("absolute inset-0 prism-holo-layer", isAnimated && "prism-holo-animated")}
        aria-hidden="true"
        style={{
          background: `conic-gradient(
            from var(--prism-angle-${uid}, 0deg),
            rgba(139, 63, 214, 0.6),
            rgba(214, 63, 150, 0.5),
            rgba(88, 28, 135, 0.6),
            rgba(139, 63, 214, 0.4),
            rgba(183, 63, 214, 0.5),
            rgba(139, 63, 214, 0.6)
          )`,
          filter: "blur(6px) saturate(150%)",
          opacity: variant === "ghost" ? 0.25 : 0.7,
          animation: isAnimated ? `prism-rotate-${uid} 4s linear infinite` : undefined,
        }}
      />

      {/* Frosted overlay for text legibility */}
      <span
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            variant === "ghost" ? "rgba(239, 233, 220, 0.6)" : "rgba(239, 233, 220, 0.45)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Specular edge highlight */}
      <span
        className="absolute inset-0 rounded-full"
        aria-hidden="true"
        data-circular
        style={{
          border: "1px solid rgba(255, 255, 255, 0.4)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.05)",
        }}
      />

      {/* Text content */}
      <span className="relative z-[1] text-brand-deep mix-blend-multiply">{children}</span>

      <style>{`
        @keyframes prism-rotate-${uid} {
          0% { --prism-angle-${uid}: 0deg; }
          100% { --prism-angle-${uid}: 360deg; }
        }
        @property --prism-angle-${uid} {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        .dark .prism-badge-surface {
          color: #f3e8ff;
        }
        .dark .prism-badge-surface .prism-holo-layer {
          opacity: 0.5;
        }
        @media (prefers-reduced-motion: reduce) {
          .prism-holo-animated {
            animation: none !important;
          }
        }
      `}</style>
    </span>
  );
}
