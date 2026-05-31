import React from "react";
import { cn } from "../../lib/utils";

interface MedallionProps {
  children: React.ReactNode;
  className?: string;
  /** Show the soft brand halo behind the medallion */
  withHalo?: boolean;
  /** Size preset — default is the 14x14 used in empty states */
  size?: "sm" | "md" | "lg";
  /**
   * Render the travelling crystalline glint + specular highlight so the
   * medallion reads like a cut gemstone catching the light. On by default —
   * it's the signature "gem" treatment of the Aurora Cream system.
   */
  shimmer?: boolean;
  /**
   * Optional accent override (hex/rgb). When provided the gradient + halo are
   * tinted to this colour instead of the brand purple. Used by callers that
   * theme empty states to a contextual accent.
   */
  accent?: string;
}

/**
 * Medallion — the signature gradient icon container used throughout the Aurora Cream system.
 * Use for empty states, section headers, identity markers, and status indicators.
 */
export function Medallion({
  children,
  className,
  withHalo = false,
  size = "md",
  shimmer = true,
  accent,
}: MedallionProps) {
  const sizeClasses = {
    sm: "w-9 h-9",
    md: "w-14 h-14",
    lg: "w-16 h-16",
  }[size];

  const accentStyle: React.CSSProperties | undefined = accent
    ? {
        backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 62%, #000))`,
      }
    : undefined;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {withHalo && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
          style={accent ? { backgroundColor: accent, opacity: 0.3 } : undefined}
        />
      )}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-sm shadow-brand/25",
          shimmer && "medallion-glint",
          sizeClasses,
        )}
        style={accentStyle}
      >
        <span className="relative z-[1] inline-flex items-center justify-center">{children}</span>
      </div>
    </div>
  );
}
