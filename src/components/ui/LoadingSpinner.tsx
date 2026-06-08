import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { asStyle } from "@/src/lib/css-style";

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
      style={asStyle({ "--wl-spinner-size": `${size}px` }) as CSSProperties}
    />
  );
}
