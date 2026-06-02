/**
 * AnimatedCounter — count-up number that animates when scrolled into view.
 *
 * A premium, cinematic touch for client-facing pages: large figures (ROI
 * savings, stat tiles, proof numbers) tick up from a starting value to their
 * final value the first time they enter the viewport, then hold. The effect
 * draws the eye to the number that matters without distracting motion loops.
 *
 * Reduced-motion safe — when the visitor prefers reduced motion the final
 * value renders immediately with no animation. SSR/first-paint safe — the
 * formatted final value is the initial render so there is never a flash of
 * "0" for crawlers or no-JS environments.
 *
 * Usage:
 *   <AnimatedCounter value={31412} prefix="$" suffix="/yr" />
 *   <AnimatedCounter value={98} suffix="%" duration={1.4} />
 */
import React, { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion, animate } from "motion/react";

interface AnimatedCounterProps {
  /** Final value to count up to. */
  value: number;
  /** Value to start counting from. Default 0. */
  from?: number;
  /** Animation duration in seconds. Default 1.2. */
  duration?: number;
  /** Decimal places to render. Default 0. */
  decimals?: number;
  /** String rendered before the number (e.g. "$"). */
  prefix?: string;
  /** String rendered after the number (e.g. "%" or "/yr"). */
  suffix?: string;
  /** Use locale grouping separators (e.g. 31,412). Default true. */
  separator?: boolean;
  className?: string;
}

/**
 * Format a raw count into its display string. Pure and exported so the
 * formatting contract can be unit-tested without a DOM renderer.
 */
export function formatCount(value: number, decimals = 0, separator = true): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString(separator ? undefined : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: separator,
  });
}

export function AnimatedCounter({
  value,
  from = 0,
  duration = 1.2,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = true,
  className,
}: AnimatedCounterProps): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const prefersReducedMotion = useReducedMotion();

  // Render the final value on first paint so there is no flash of the start
  // value for crawlers, no-JS, or reduced-motion visitors.
  const [display, setDisplay] = useState<number>(() => (prefersReducedMotion ? value : from));

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }
    if (!inView) return;
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [inView, prefersReducedMotion, from, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatCount(display, decimals, separator)}
      {suffix}
    </span>
  );
}

export default AnimatedCounter;
