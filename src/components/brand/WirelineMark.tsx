import { useId } from "react";

type WirelineMarkProps = {
  className?: string;
  label?: string;
  /**
   * Public/marketing treatment: the mark carries the Aurora signal gradient.
   * Product/native surfaces can keep the mark monochrome by omitting this.
   */
  signal?: boolean;
  /** Stroke width in the 48x48 viewBox. */
  strokeWidth?: number;
};

/**
 * Official Wireline mark: one continuous line, two ports.
 *
 * A single unbroken stroke enters from the left, traces a W, and exits right —
 * the product name drawn literally. The filled terminals are the line's two
 * ports: the call that arrives, and the outcome that leaves.
 *
 * Geometry notes, because they are load-bearing rather than taste:
 *
 * - The artboard is square. Every slot the mark has to survive is square —
 *   favicon, PWA icon, app icon, avatar — and the previous 128x96 board
 *   letterboxed in all of them.
 * - The W is symmetric about x=24: the outer arms span 8 units either side of
 *   center, the inner arms 5. The middle apex sits at y=21, five units under
 *   the 16 cap line, which is the ordinary optical correction for a W; level
 *   with the cap it reads as a crown.
 * - The leads stop 7 units out. Longer and the top edge fuses into one
 *   horizontal bar that reads as a strikethrough; shorter and the line looks
 *   clipped rather than continuous.
 * - No `vector-effect="non-scaling-stroke"`. It pins the stroke to screen
 *   pixels regardless of render size, which thickened the mark into a blob at
 *   favicon sizes — the exact place a mark has to stay legible.
 */
export default function WirelineMark({
  className = "",
  label,
  signal = false,
  strokeWidth = 5,
}: WirelineMarkProps) {
  const gradientId = `wireline-mark-${useId().replace(/:/g, "")}`;
  const stroke = signal ? `url(#${gradientId})` : "currentColor";

  return (
    <svg
      viewBox="0 0 48 48"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
    >
      {signal && (
        <defs>
          <linearGradient
            id={gradientId}
            x1="4"
            y1="14"
            x2="44"
            y2="34"
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
          >
            <stop offset="0" stopColor="#8B5CF6" />
            <stop offset="0.34" stopColor="#A78BFA" />
            <stop offset="0.7" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#C4B5FD" />
          </linearGradient>
        </defs>
      )}
      <g stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 16H11L19 32L24 21L29 32L37 16H44" />
        <circle cx="4" cy="16" r="3.7" fill={stroke} stroke="none" />
        <circle cx="44" cy="16" r="3.7" fill={stroke} stroke="none" />
      </g>
    </svg>
  );
}
