import * as React from "react";
import { cn } from "../../../lib/utils";

/**
 * shadcn-style Slider.
 *
 * Wraps a native `<input type="range">` so feature code can render sliders
 * without re-growing the rawInput ratchet. We intentionally style the native
 * element rather than depending on @radix-ui/react-slider — the native range
 * input is keyboard-accessible, supports `min`/`max`/`step`/`value` props
 * with no extra plumbing, and the design system only needs a single track +
 * thumb. The thumb is themed via `--primary`; the track via `--input`.
 */
const Slider = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<"input">, "type">
>(({ className, ...props }, ref) => (
  <input
    type="range"
    ref={ref}
    className={cn(
      // Track: thin neutral bar that picks up the shadcn border token
      "h-2 w-full cursor-pointer appearance-none rounded-full bg-input accent-primary",
      // Thumb (webkit) — circular brand-coloured handle with subtle shadow
      "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
      "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
      "[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer",
      // Thumb (firefox)
      "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
      "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer",
      // Focus + disabled parity with the rest of the shadcn layer
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Slider.displayName = "Slider";

export { Slider };
