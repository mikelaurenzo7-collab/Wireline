import { useId } from "react";

type WirelineMarkProps = {
  className?: string;
  label?: string;
  /**
   * Public/marketing treatment: the mark carries the Aurora signal gradient.
   * Product/native surfaces can keep the mark monochrome by omitting this.
   */
  signal?: boolean;
  /** Stroke width in the 128x96 viewBox. */
  strokeWidth?: number;
};

/**
 * Official Wireline circuit-W mark.
 *
 * The glyph is intentionally simple: a W built from routed wire, with three
 * terminal nodes for signal in, routing, and outcome. It reads as a brand mark
 * at favicon size while still carrying the product story on public pages.
 */
export default function WirelineMark({
  className = "",
  label,
  signal = false,
  strokeWidth = 9,
}: WirelineMarkProps) {
  const gradientId = `wireline-mark-${useId().replace(/:/g, "")}`;
  const stroke = signal ? `url(#${gradientId})` : "currentColor";

  return (
    <svg
      viewBox="0 0 128 96"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 overflow-visible ${className}`}
      fill="none"
    >
      {signal && (
        <defs>
          <linearGradient id={gradientId} x1="14" y1="18" x2="122" y2="78" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--wireline-color-action-secondary-default, #C7CCD6)" />
            <stop offset="0.28" stopColor="var(--wireline-color-action-primary-default, #A78BFA)" />
            <stop offset="0.58" stopColor="#6D28D9" />
            <stop offset="1" stopColor="#C084FC" />
          </linearGradient>
        </defs>
      )}
      <g
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        <path d="M21 31H25L44 73C47 80 53 80 56 74L82 25" />
        <path d="M51 33H63C68 33 71 36 73 40L90 73C94 80 100 80 103 74L115 33H122" />
        <circle cx="14" cy="31" r="6.5" />
        <circle cx="82" cy="18" r="6.5" />
        <circle cx="122" cy="33" r="6.5" />
      </g>
    </svg>
  );
}
