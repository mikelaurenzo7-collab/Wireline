/**
 * Monochrome Skeleton System
 * Minimal animated placeholders matching the warm neutral design system.
 * Use these instead of spinners for any data-loading state.
 */

import React from "react";
import { cn } from "../lib/utils";

/* ── Base pulse animation ──────────────────────────────────────────── */

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** Single skeleton line / block — the atom of the system. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading…"
      className={cn("relative overflow-hidden rounded-md bg-foreground/[0.06]", className)}
      {...props}
    >
      <div className="skeleton-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
    </div>
  );
}

/* ── Row skeleton (for lists) ─────────────────────────────────────── */

interface RowSkeletonProps {
  showIcon?: boolean;
  showValue?: boolean;
}

function RowSkeleton({ showIcon = true, showValue = true }: RowSkeletonProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {showIcon && <Skeleton className="w-9 h-9 rounded-lg shrink-0" />}
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/5 rounded" />
        <Skeleton className="h-2 w-4/5 rounded" />
      </div>
      {showValue && <Skeleton className="h-4 w-12 rounded shrink-0" />}
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
    <div className={cn("flex flex-col divide-y divide-border/40", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}
