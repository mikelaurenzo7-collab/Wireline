import { cn } from "../../lib/utils";
import { ShadButton } from "./shadcn/ShadButton";

export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
};

type SegmentStripProps<T extends string = string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** filled = brand pill (Insights day range); soft = inset tint (forms) */
  variant?: "filled" | "soft";
  /** Stretch options evenly — use on full-width form toggles */
  fullWidth?: boolean;
  "aria-label"?: string;
  /** Optional test id prefix for each option button */
  testIdPrefix?: string;
};

/**
 * Canonical segmented control — day ranges, channel pickers, compact toggles.
 * Uses app-segment-strip + app-segment-btn tokens from index.css.
 */
export function SegmentStrip<T extends string = string>({
  options,
  value,
  onChange,
  className,
  variant = "filled",
  fullWidth = false,
  "aria-label": ariaLabel = "Options",
  testIdPrefix,
}: SegmentStripProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("app-segment-strip", fullWidth && "flex w-full", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <ShadButton
            key={opt.value}
            type="button"
            disableAnimations
            variant={active && variant === "filled" ? "default" : "ghost"}
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
            className={cn(
              "app-segment-btn h-9 sm:h-7 px-3 rounded-full text-xs sm:text-[length:var(--wireline-typography-overline-size)] font-medium tracking-wide touch-press",
              fullWidth && "flex-1",
              variant === "filled" &&
                (active
                  ? "bg-brand text-on-brand shadow-sm shadow-brand/25"
                  : "text-muted hover:text-foreground"),
              variant === "soft" &&
                (active ? "bg-brand/15 text-brand" : "text-muted hover:text-foreground"),
            )}
          >
            {opt.label}
          </ShadButton>
        );
      })}
    </div>
  );
}
