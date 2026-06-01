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
    sm: "w-6 h-6",
    md: "w-9 h-9",
    lg: "w-11 h-11",
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
          "group relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand via-[#9B5CE0] to-brand-deep text-on-brand flex items-center justify-center shadow-sm shadow-brand/25 ring-1 ring-white/10",
          shimmer && "medallion-glint",
          sizeClasses,
        )}
        style={accentStyle}
      >
        {/* Ultra-fine inner specular rim — gives true cut-gem depth */}
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.06) 28%, transparent 52%, rgba(0,0,0,0.12) 78%)",
            mixBlendMode: "soft-light",
          }}
        />
        {/* Crystalline facet highlight that travels on hover — extremely subtle */}
        {shimmer && (
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{
              background:
                "linear-gradient(125deg, transparent 20%, rgba(255,255,255,0.28) 42%, transparent 64%)",
              transform: "translateX(-30%)",
              animation: "medallion-facet 2.8s ease-in-out infinite",
            }}
          />
        )}
        <span className="relative z-[1] inline-flex items-center justify-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">
          {children}
        </span>
      </div>
    </div>
  );
}
