import { cn } from "../../lib/utils";

export type SignalFrameSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<SignalFrameSize, string> = {
  sm: "size-14",
  md: "size-20",
  lg: "size-28",
  xl: "size-36",
};

const TICKS = [
  { x1: 50, y1: 8, x2: 50, y2: 18 },
  { x1: 92, y1: 50, x2: 82, y2: 50 },
  { x1: 50, y1: 92, x2: 50, y2: 82 },
  { x1: 8, y1: 50, x2: 18, y2: 50 },
];

export function SignalFrameRail({
  className,
  size = "lg",
  refined = true,
}: {
  className?: string;
  size?: SignalFrameSize;
  refined?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className={cn(
        "pointer-events-none absolute inset-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 text-foreground/20",
        SIZE_CLASS[size],
        refined ? "opacity-70" : "opacity-45",
        className,
      )}
      fill="none"
    >
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="0.75" />
      <circle cx="50" cy="50" r="47" stroke="currentColor" strokeWidth="0.4" opacity="0.35" />
      {TICKS.map((tick, index) => (
        <line
          key={index}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="0.9"
        />
      ))}
    </svg>
  );
}
