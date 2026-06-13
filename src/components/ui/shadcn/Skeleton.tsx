import { cn } from "../../../lib/utils";

/**
 * Branded skeleton — uses the new editorial elevation + paper tactility
 * so loading states feel like part of the Rich Cream + Purple system rather than
 * generic gray blocks. Subtle brand pulse, respects dark velvet.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted paper-texture elev-1 border border-black/5 dark:border-white/8",
        "bg-[linear-gradient(90deg,var(--color-muted)_25%,rgba(139,63,214,0.04)_50%,var(--color-muted)_75%)]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
