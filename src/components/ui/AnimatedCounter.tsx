import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

/**
 * formatCount — pure, SSR-safe number formatter shared by AnimatedCounter and
 * any caller that needs the same display contract.
 *
 * - groups thousands by default (`31412` → `"31,412"`)
 * - rounds to `decimals` places (`12.345, 2` → `"12.35"`)
 * - `group=false` disables the thousands separators
 * - non-finite input (NaN / Infinity) coerces to `"0"`
 */
export function formatCount(value: number, decimals = 0, group = true): string {
  if (!Number.isFinite(value)) return "0";
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: group,
  });
}

interface AnimatedCounterProps {
  /** The target numeric value to animate toward. */
  value: number;
  /** Optional className forwarded to the wrapping `<span>`. */
  className?: string;
  /** Format function — defaults to {@link formatCount} (grouped, `decimals` places). */
  format?: (n: number) => string;
  /** Decimal places for the default formatter. */
  decimals?: number;
  /** Starting value for the roll-up animation. */
  from?: number;
  /** Spring/tween duration in seconds. */
  duration?: number;
}

/**
 * AnimatedCounter — number that rolls from `from` → `value` the first time it
 * scrolls into view, and smoothly transitions on subsequent value changes.
 *
 * Accessibility: honors `prefers-reduced-motion`. Reduced-motion users see the
 * final value immediately (no roll, no flash of 0) — matching the app-wide
 * `MotionConfig reducedMotion="user"` contract.
 */
export function AnimatedCounter({
  value,
  className,
  format,
  decimals = 0,
  from = 0,
  duration = 1.1,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const prefersReducedMotion = useReducedMotion();
  // Reduced motion starts at the final value (no flash of 0); otherwise from `from`.
  const count = useMotionValue(prefersReducedMotion ? value : from);
  const display = useTransform(count, (v) =>
    format ? format(Math.round(v)) : formatCount(v, decimals),
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      count.set(value);
      return;
    }
    if (!inView) return;
    const controls = animate(count, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, prefersReducedMotion, duration, count]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
