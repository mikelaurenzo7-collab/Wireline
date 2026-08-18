import { useId } from "react";

type WirelineMarkProps = {
  className?: string;
  label?: string;
  /** Render the violet-to-platinum brand treatment. Defaults to true. */
  signal?: boolean;
  /**
   * Retained for source compatibility with the retired monoline mark.
   * The folded-ribbon identity uses filled geometry instead of a stroke.
   */
  strokeWidth?: number;
};

/**
 * Official Wireline mark.
 *
 * Four precision-cut ribbons form one forward-moving W: violet carries the
 * first conversation, the shadowed crossover records continuity, and the
 * platinum finish represents work completed. Filled geometry keeps the mark
 * crisp from a 16px favicon through full-size campaign artwork.
 */
export default function WirelineMark({
  className = "",
  label,
  signal = true,
  strokeWidth,
}: WirelineMarkProps) {
  void strokeWidth;

  const instanceId = useId().replace(/:/g, "");
  const purpleDownId = `wireline-purple-down-${instanceId}`;
  const purpleUpId = `wireline-purple-up-${instanceId}`;
  const foldId = `wireline-fold-${instanceId}`;
  const silverId = `wireline-silver-${instanceId}`;
  const purpleHighlightId = `wireline-purple-highlight-${instanceId}`;
  const silverHighlightId = `wireline-silver-highlight-${instanceId}`;

  const purpleDown = signal ? `url(#${purpleDownId})` : "currentColor";
  const purpleUp = signal ? `url(#${purpleUpId})` : "currentColor";
  const fold = signal ? `url(#${foldId})` : "currentColor";
  const silver = signal ? `url(#${silverId})` : "currentColor";

  return (
    <svg
      viewBox="0 0 180 120"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
    >
      {signal ? (
        <defs>
          <linearGradient
            id={purpleDownId}
            x1="14"
            y1="14"
            x2="68"
            y2="106"
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
          >
            <stop offset="0" stopColor="#C8B5FF" />
            <stop offset="0.38" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#5221D6" />
          </linearGradient>
          <linearGradient
            id={purpleUpId}
            x1="42"
            y1="106"
            x2="100"
            y2="14"
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
          >
            <stop offset="0" stopColor="#5B24E8" />
            <stop offset="0.55" stopColor="#7040F2" />
            <stop offset="1" stopColor="#B69AFF" />
          </linearGradient>
          <linearGradient
            id={foldId}
            x1="76"
            y1="14"
            x2="132"
            y2="106"
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
          >
            <stop offset="0" stopColor="#2F2B3D" />
            <stop offset="0.46" stopColor="#625D72" />
            <stop offset="1" stopColor="#C8CAD4" />
          </linearGradient>
          <linearGradient
            id={silverId}
            x1="108"
            y1="106"
            x2="166"
            y2="14"
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
          >
            <stop offset="0" stopColor="#BCC0CB" />
            <stop offset="0.48" stopColor="#E4E6ED" />
            <stop offset="1" stopColor="#FFFFFF" />
          </linearGradient>
          <linearGradient
            id={purpleHighlightId}
            x1="14"
            y1="14"
            x2="47"
            y2="101"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={silverHighlightId}
            x1="166"
            y1="14"
            x2="128"
            y2="106"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}

      <path d="M76 14H100L132 106H108Z" fill={fold} opacity={signal ? 1 : 0.42} />
      <path d="M14 14H40L68 106H42Z" fill={purpleDown} />
      <path d="M42 106H68L100 14H74Z" fill={purpleUp} />
      <path d="M108 106H134L166 14H140Z" fill={silver} />

      {signal ? (
        <>
          <path d="M14 14H20L47 101H42Z" fill={`url(#${purpleHighlightId})`} />
          <path d="M158 14H166L134 106H128Z" fill={`url(#${silverHighlightId})`} />
        </>
      ) : null}
    </svg>
  );
}
