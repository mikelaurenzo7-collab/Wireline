// Official Wireline circuit-W glyph. This legacy component stays as a
// drop-in icon replacement for older chrome while the canonical public mark
// lives in src/components/brand/WirelineMark.tsx.

interface Props {
  /** Tailwind sizing (`w-4 h-4` etc.) — same convention as lucide icons. */
  className?: string;
  /** Stroke color. Default currentColor so parent tokens control the mark. */
  stroke?: string;
  /** Stroke width in the 128x96 viewbox space. */
  strokeWidth?: number;
}

export default function WirelineMark({
  className = "w-5 h-5",
  stroke = "currentColor",
  strokeWidth = 9,
}: Props) {
  return (
    <svg
      viewBox="0 0 128 96"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      fill="none"
    >
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
