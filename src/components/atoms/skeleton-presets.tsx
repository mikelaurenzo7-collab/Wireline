import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";

export interface RowSkeletonProps {
  showIcon?: boolean;
  showValue?: boolean;
  className?: string;
}

/** List-row loading placeholder — uses wl-skeleton atoms. */
export function RowSkeleton({ showIcon = true, showValue = true, className }: RowSkeletonProps) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)} aria-busy="true">
      {showIcon ? <Skeleton className="h-9 w-9 shrink-0" shape="surface" /> : null}
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/5" shape="text" />
        <Skeleton className="h-2 w-4/5" shape="text" />
      </div>
      {showValue ? <Skeleton className="h-4 w-12 shrink-0" shape="text" /> : null}
    </div>
  );
}

export interface PanelSkeletonProps {
  rows?: number;
  className?: string;
}

/** Panel-body loading placeholder — canonical list skeleton. */
export function PanelSkeleton({ rows = 4, className }: PanelSkeletonProps) {
  return (
    <div
      className={cn("flex flex-col divide-y divide-border/40", className)}
      aria-busy="true"
      aria-label="Loading…"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Compact card-row skeleton for call logs and dense lists. */
export function CardRowSkeleton({ rows = 4, className }: PanelSkeletonProps) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)} aria-busy="true" aria-label="Loading…">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index}>
          <Skeleton className="h-[76px] rounded-[var(--wireline-radius-lg)]" shape="surface" />
        </li>
      ))}
    </ul>
  );
}
