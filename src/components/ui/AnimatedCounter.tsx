import { useMotionValue, useSpring, useTransform, motion } from "motion/react";
import { useEffect } from "react";

interface AnimatedCounterProps {
  /** The target numeric value to animate toward. */
  value: number;
  /** Optional className forwarded to the wrapping `<span>`. */
  className?: string;
  /** Format function — defaults to `toLocaleString()`. */
  format?: (n: number) => string;
}

/**
 * AnimatedCounter — spring-physics number that rolls from 0 → value on mount,
 * and smoothly transitions between values on change. Uses `useSpring` from
 * `motion/react` so the counter inherits the Aurora Cream motion language
 * (no additional bundle cost — motion is already a dep).
 */
export function AnimatedCounter({
  value,
  className,
  format,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: 60,
    damping: 18,
    mass: 0.8,
  });
  const display = useTransform(spring, (v) =>
    format ? format(Math.round(v)) : Math.round(v).toLocaleString(),
  );

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
