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
   * signature — crystalline glint (marketing, celebration moments).
   * instrument — static specular; no travelling sweep (authenticated app).
   */
  variant?: "signature" | "instrument";
  /** @deprecated Prefer `variant="instrument"` — glint sweep off when false */
  shimmer?: boolean;
  /**
   * Optional accent override (hex/rgb). When provided the gradient + halo are
   * tinted to this colour instead of the mono accent. Used by callers that
   * theme empty states to a contextual accent.
   */
  accent?: string;
}

/**
 * Medallion — gradient icon container for empty states, headers, and markers.
 */
export function Medallion({
  children,
  className,
  withHalo = false,
  size = "md",
  variant = "instrument",
  shimmer,
  accent,
}: MedallionProps) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  }[size];

  const signature = variant === "signature" || shimmer === true;
  const showSweep = signature && shimmer !== false;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      data-accent={accent}
    >
      {withHalo && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 -z-10 rounded-full blur-2xl scale-150",
            accent ? "medallion-accent-halo" : "bg-brand/20",
          )}
        />
      )}
      <div
        className={cn(
          "group relative overflow-hidden rounded-md text-on-brand flex items-center justify-center ring-1 ring-white/12",
          accent
            ? "medallion-accent-face"
            : "bg-gradient-to-br from-brand via-brand/85 to-brand-deep",
          signature ? "shadow-sm shadow-brand/25" : "shadow-[var(--wireline-elevation-xs)]",
          showSweep && "medallion-glint",
          !signature && "medallion-instrument",
          sizeClasses,
        )}
      >
        <span aria-hidden className="absolute inset-0 pointer-events-none medallion-specular" />
        {showSweep && (
          <span
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none medallion-facet-hover"
          />
        )}
        <span className="relative z-[1] inline-flex items-center justify-center">{children}</span>
      </div>
    </div>
  );
}
