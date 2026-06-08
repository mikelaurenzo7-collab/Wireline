import { cn } from "../../lib/utils";

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
      data-spinner-size={`${size}px`}
    />
  );
}
