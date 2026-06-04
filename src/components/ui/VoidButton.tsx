/**
 * VoidButton — Gravity-warping button with event-horizon hover state.
 *
 * The signature CTA for Wireline's most important actions. On hover, the
 * button's surface warps inward like light bending around a black hole,
 * then snaps back on release. The "event horizon" is a dark-mode-aware
 * ring that expands outward from the centre.
 *
 * Physics: spring-based transform with a custom cubic-bezier that
 * overshoots slightly for organic weight. Inner glow intensifies on
 * hover to simulate gravitational luminosity.
 *
 * Accessibility: full keyboard support, focus-visible ring, reduced
 * motion degrades to simple opacity transition.
 *
 * Usage:
 *   <VoidButton onClick={...}>Deploy Agent</VoidButton>
 *   <VoidButton size="sm" variant="secondary">Cancel</VoidButton>
 */
import React, { useId } from "react";
import { cn } from "../../lib/utils";
import { ShadButton } from "./shadcn/ShadButton";

type VoidSize = "sm" | "md" | "lg";
type VoidVariant = "primary" | "secondary";

interface VoidButtonProps extends Omit<
  React.ComponentProps<typeof ShadButton>,
  "variant" | "size" | "disableAnimations"
> {
  children: React.ReactNode;
  /** Size preset. Default "md". */
  size?: VoidSize;
  /** Variant. Default "primary". */
  variant?: VoidVariant;
}

const SIZE_CLASSES: Record<VoidSize, string> = {
  sm: "px-4 py-2 text-[11px] gap-1.5",
  md: "px-6 py-3 text-[12px] gap-2",
  lg: "px-8 py-4 text-[13px] gap-2.5",
};

/**
 * VoidButton — event-horizon CTA with gravitational hover physics.
 */
export function VoidButton({
  children,
  size = "md",
  variant = "primary",
  className,
  disabled,
  ...props
}: VoidButtonProps) {
  const uid = useId().replace(/:/g, "");

  return (
    <ShadButton
      type="button"
      variant="ghost"
      disableAnimations
      className={cn(
        "group relative inline-flex items-center justify-center font-semibold uppercase tracking-[0.12em] transition-all cursor-pointer overflow-hidden void-button h-auto rounded-none hover:bg-transparent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:opacity-40 disabled:pointer-events-none disabled:grayscale",
        SIZE_CLASSES[size],
        variant === "primary" && "text-white",
        variant === "secondary" && "text-ink border border-ink/12",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {/* Event-horizon background */}
      {variant === "primary" && (
        <span
          className="absolute inset-0 void-bg"
          aria-hidden="true"
          style={{
            background: `radial-gradient(ellipse 120% 100% at 50% 110%, #3B154C 0%, #8B3FD6 45%, #6B2B99 100%)`,
            transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease",
          }}
        />
      )}

      {/* Gravitational warp ring — expands on hover */}
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 void-warp-ring"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 50% 50%, transparent 30%, rgba(139, 63, 214, 0.3) 60%, transparent 70%)`,
          transform: "scale(0.5)",
          transition: "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease",
        }}
      />

      {/* Inner specular corona */}
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,255,255,0.2) 0%, transparent 50%)",
          transition: "opacity 0.4s ease",
        }}
      />

      {/* Surface shimmer stripe */}
      <span
        className={`absolute inset-0 void-shimmer-${uid}`}
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
          transform: "translateX(-100%)",
          animation: `void-shimmer-sweep-${uid} 3.5s ease-in-out 1s infinite`,
        }}
      />

      {/* Button content */}
      <span className="relative z-[1] inline-flex items-center gap-inherit">{children}</span>

      <style>{`
        .void-button:hover .void-bg {
          transform: scale(1.03);
          filter: brightness(1.12) saturate(1.2);
        }
        .void-button:active .void-bg {
          transform: scale(0.97);
          filter: brightness(0.92);
        }
        .void-button:hover .void-warp-ring {
          transform: scale(2.2) !important;
        }
        @keyframes void-shimmer-sweep-${uid} {
          0% { transform: translateX(-100%); }
          30% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .void-button:hover .void-bg {
            transform: none;
          }
          .void-button:active .void-bg {
            transform: none;
          }
          .void-button:hover .void-warp-ring {
            transform: none !important;
          }
          .void-shimmer-${uid} {
            animation: none !important;
          }
        }
      `}</style>
    </ShadButton>
  );
}
