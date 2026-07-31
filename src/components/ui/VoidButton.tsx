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
import React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../atoms";

type VoidSize = "sm" | "md" | "lg";
type VoidVariant = "primary" | "secondary";

interface VoidButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "disableAnimations"
> {
  children: React.ReactNode;
  /** Size preset. Default "md". */
  size?: VoidSize;
  /** Variant. Default "primary". */
  variant?: VoidVariant;
}

const SIZE_CLASSES: Record<VoidSize, string> = {
  sm: "px-4 py-2 text-[length:var(--wireline-typography-overline-size)] gap-1.5",
  md: "px-6 py-3 text-[length:var(--wireline-typography-caption-size)] gap-2",
  lg: "px-8 py-4 text-[length:var(--wireline-typography-caption-size)] gap-2.5",
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
  return (
    <Button
      type="button"
      variant="ghost"
      disableAnimations
      data-uid="void"
      className={cn(
        "group relative inline-flex items-center justify-center font-semibold uppercase tracking-[0.12em] transition-all cursor-pointer overflow-hidden void-button h-auto rounded-none hover:bg-transparent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:opacity-40 disabled:pointer-events-none disabled:grayscale",
        SIZE_CLASSES[size],
        variant === "primary" && "text-white",
        variant === "secondary" && "text-foreground border border-ink/12",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {variant === "primary" && <span className="absolute inset-0 void-bg" aria-hidden="true" />}

      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 void-warp-ring"
        aria-hidden="true"
      />

      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 void-corona"
        aria-hidden="true"
      />

      <span className="absolute inset-0 void-shimmer-stripe" aria-hidden="true" />

      <span className="relative z-[1] inline-flex items-center gap-inherit">{children}</span>
    </Button>
  );
}
