/**
 * Aurora Cream Skeleton System
 * Animated placeholder components that match the frosted-glass design language.
 * Use these instead of spinners for any data-loading state.
 */

import { cn } from "../lib/utils";

/* ── Base pulse animation ──────────────────────────────────────────── */

interface SkeletonProps {
  className?: string;
  /** Accent color for the shimmer — defaults to the brand cyan */
  accent?: "cyan" | "violet" | "magenta" | "emerald";
}

const ACCENT_SHIMMER: Record<string, string> = {
  cyan: "from-brand/0 via-brand/20 to-brand/0",
  violet: "from-brand-2/0 via-brand-2/20 to-brand-2/0",
  magenta: "from-brand-3/0 via-brand-3/20 to-brand-3/0",
  emerald: "from-emerald-500/0 via-emerald-500/20 to-emerald-500/0",
};

/** Single skeleton line / block — the atom of the system. */
export function Skeleton({ className, accent = "cyan" }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading…"
      className={cn(
        "relative overflow-hidden rounded-lg bg-black/[0.07] border border-black/[0.05]",
        className,
      )}
    >
      <div
        className={cn(
          "skeleton-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r",
          ACCENT_SHIMMER[accent],
        )}
      />
    </div>
  );
}

/* ── Row skeleton (for lists) ─────────────────────────────────────── */

interface RowSkeletonProps {
  /** Show an icon slot on the left. Default true. */
  showIcon?: boolean;
  /** Show a right-side value. Default true. */
  showValue?: boolean;
}

function RowSkeleton({ showIcon = true, showValue = true }: RowSkeletonProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {showIcon && <Skeleton className="w-9 h-9 rounded-xl shrink-0" accent="violet" />}
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/5 rounded" accent="cyan" />
        <Skeleton className="h-2 w-4/5 rounded" accent="cyan" />
      </div>
      {showValue && <Skeleton className="h-4 w-12 rounded shrink-0" accent="magenta" />}
    </div>
  );
}

/* ── Panel skeleton (the whole panel body) ───────────────────────── */

interface PanelSkeletonProps {
  rows?: number;
  className?: string;
}

export function PanelSkeleton({ rows = 4, className }: PanelSkeletonProps) {
  return (
    <div className={cn("flex flex-col divide-y divide-white/5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}
