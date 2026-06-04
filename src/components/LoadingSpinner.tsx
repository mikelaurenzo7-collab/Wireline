import type { CSSProperties } from "react";
import { cn } from "../lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
}

export default function LoadingSpinner({ className, size = 24 }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading..."
      className={cn("wl-brand-spinner shrink-0", className)}
      style={{ "--wl-spinner-size": `${size}px` } as CSSProperties}
    />
  );
}
