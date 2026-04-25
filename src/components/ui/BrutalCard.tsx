import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

/**
 * Brutalist card primitive. Wraps the `brutal-card` utility class in a typed
 * component so callers stop reimplementing `border-2 border-ink shadow-...`
 * inline. The variants intentionally mirror the patterns currently in use
 * across DashboardHome, AuthPortal, etc. so the migration is mechanical.
 */
type BrutalCardSurface = "default" | "ink" | "brand" | "muted";
type BrutalCardSize = "sm" | "md" | "lg" | "xl" | "none";
type BrutalCardShadow = "none" | "sm" | "md" | "lg" | "xl";

export interface BrutalCardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: BrutalCardSurface;
  size?: BrutalCardSize;
  shadow?: BrutalCardShadow;
  /** When true, removes built-in padding so callers can supply their own. */
  flush?: boolean;
}

const SURFACE_CLASSES: Record<BrutalCardSurface, string> = {
  default: "bg-white",
  ink: "bg-ink text-white",
  brand: "bg-brand text-ink",
  muted: "bg-slate-50",
};

const SIZE_CLASSES: Record<BrutalCardSize, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8 md:p-10",
  xl: "p-10 md:p-14",
};

const SHADOW_CLASSES: Record<BrutalCardShadow, string> = {
  none: "shadow-none",
  sm: "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
  md: "shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
  lg: "shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
  xl: "shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]",
};

export const BrutalCard = forwardRef<HTMLDivElement, BrutalCardProps>(function BrutalCard(
  { surface = "default", size = "md", shadow, flush, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "border-2 border-ink transition-all",
        SURFACE_CLASSES[surface],
        flush ? "p-0" : SIZE_CLASSES[size],
        shadow ? SHADOW_CLASSES[shadow] : SHADOW_CLASSES.sm,
        className
      )}
      {...rest}
    />
  );
});
