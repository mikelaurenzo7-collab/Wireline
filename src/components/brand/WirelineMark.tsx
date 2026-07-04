type WirelineMarkProps = {
  className?: string;
  label?: string;
  /**
   * Render the central diamond as the copper signal node — the mark joining
   * the Wire (the W is the wire, the node is the signal). Opt-in so the
   * favicon and native adaptive icon stay monochrome; use on marketing
   * surfaces only.
   */
  signal?: boolean;
};

/**
 * Source-matched geometric W used across the current Stitch delivery and
 * native adaptive icon. It inherits `currentColor` so each surface can use
 * semantic tokens without maintaining separate logo assets. With `signal`,
 * the central node picks up copper (via .wl-mark-signal) while the W keeps
 * currentColor — the two-tone treatment reserved for public surfaces.
 */
export default function WirelineMark({ className = "", label, signal = false }: WirelineMarkProps) {
  return (
    <svg
      viewBox="0 0 108 108"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 fill-current ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M18 27h14l11.5 32.5L54 38l10.5 21.5L76 27h14L69.5 83 54 56 38.5 83Z"
      />
      <path
        fillRule="evenodd"
        d="m54 47 6 11-6 11-6-11Z"
        className={signal ? "wl-mark-signal" : undefined}
      />
    </svg>
  );
}
