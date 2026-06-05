import { cn } from "../../lib/utils";

interface LoadingDotsProps {
  className?: string;
}

export default function LoadingDots({ className }: LoadingDotsProps) {
  return (
    <div className={cn("wl-loading-dots", className)}>
      <span />
      <span />
      <span />
    </div>
  );
}
