/**
 * Aurora Obsidian Skeleton System
 * Animated placeholder components that match the dark-glass design language.
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
  cyan:    "from-brand/0 via-brand/20 to-brand/0",
  violet:  "from-brand-2/0 via-brand-2/20 to-brand-2/0",
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
        className
      )}
    >
      <div
        className={cn(
          "skeleton-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r",
          ACCENT_SHIMMER[accent]
        )}
      />
    </div>
  );
}

/* ── Stat tile skeleton ───────────────────────────────────────────── */

export function StatTileSkeleton() {
  return (
    <div className="relative rounded-xl glass border border-black/8 p-4 overflow-hidden">
      <div className="flex items-start justify-between mb-2.5">
        <Skeleton className="h-2 w-20" accent="cyan" />
        <Skeleton className="w-7 h-7 rounded-lg" accent="violet" />
      </div>
      <Skeleton className="h-9 w-24 rounded-lg mb-2" accent="cyan" />
      <Skeleton className="h-2 w-16" accent="cyan" />
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

export function RowSkeleton({ showIcon = true, showValue = true }: RowSkeletonProps) {
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

/* ── Card grid skeleton ───────────────────────────────────────────── */

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl glass border border-black/8 p-5 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <Skeleton className="h-2 w-16" accent={i % 2 === 0 ? "cyan" : "violet"} />
            <Skeleton className="w-5 h-5 rounded-full" accent="magenta" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" accent="cyan" />
          <Skeleton className="h-1 w-full rounded-full" accent="violet" />
        </div>
      ))}
    </div>
  );
}

/* ── Chart skeleton ───────────────────────────────────────────────── */

export function ChartSkeleton({ className }: { className?: string }) {
  const bars = [40, 65, 45, 80, 70, 55, 35];
  return (
    <div className={cn("flex items-end justify-between gap-2 h-full px-2 pb-4", className)}>
      {bars.map((h, i) => (
        <div
          key={i}
          className={cn(
            "relative overflow-hidden flex-1 rounded-t-md bg-black/[0.07] border border-black/[0.05]"
          )}
          style={{ height: `${h}%` }}
        >
          <div
            className={cn(
              "skeleton-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r",
              ACCENT_SHIMMER[i % 3 === 0 ? "cyan" : i % 3 === 1 ? "violet" : "magenta"]
            )}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Full-page centered spinner fallback ─────────────────────────── */

export function PageSpinner() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4">
      <div className="relative w-14 h-14">
        <div
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: "conic-gradient(from 0deg, #0AC8D4, #9B59F5, #E040C0, #10B981, #0AC8D4)",
            filter: "blur(1px)",
            animation: "spin 2.4s linear infinite",
          }}
        />
        <div className="absolute inset-1.5 rounded-full bg-paper" />
        <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)", boxShadow: "0 0 12px #0AC8D4" }}
          />
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60 animate-pulse">Loading…</p>
    </div>
  );
}
