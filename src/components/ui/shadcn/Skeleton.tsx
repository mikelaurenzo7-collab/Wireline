import { cn } from "../../../lib/utils";

/** Neutral loading primitive shared by public and authenticated surfaces. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md border border-black/5 bg-[linear-gradient(90deg,var(--color-muted)_25%,rgba(29,29,31,0.05)_50%,var(--color-muted)_75%)] dark:border-white/8",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
