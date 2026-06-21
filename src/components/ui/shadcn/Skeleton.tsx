import { cn } from "../../../lib/utils";

/** Neutral loading primitive — monochrome shimmer, shared across surfaces. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
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

export { Skeleton };
