import { cn } from "../../lib/utils";

type WireSignalArtProps = {
  /**
   * `wave` — a voice waveform crossing a wire. The default, and the one that
   * reads instantly as "this product is a voice on a line".
   * `pulse` — the same wire carrying discrete packets, for pages about routing,
   * handoff, or integration rather than about the call itself.
   */
  variant?: "wave" | "pulse";
  className?: string;
};

/* Deterministic, not random: the silhouette is authored so the loud syllables
   land off-centre and the tail decays, which is what makes it read as speech
   rather than as an equaliser. A random array reads as noise every time. */
const WAVE_BARS = [
  6, 10, 17, 28, 41, 52, 34, 20, 12, 23, 38, 55, 64, 49, 30, 16, 8, 13, 25, 43, 59, 46, 28, 15, 9,
  19, 33, 24, 12, 7, 14, 27, 45, 61, 47, 29, 17, 10, 21, 36, 52, 38, 22, 13, 8, 15, 26, 18, 11, 6,
];

const PULSE_NODES = [0.08, 0.26, 0.44, 0.62, 0.8, 0.94];

/**
 * The Wireline signature graphic.
 *
 * Marketing pages that had thin content used to pad it with a second paragraph
 * restating the first. This is the alternative: one silent, on-brand image that
 * says "a voice, on a line" without spending a word, drawn at whatever size the
 * slot gives it.
 *
 * It is a plain inline SVG animated with CSS — no canvas, no animation frame,
 * no library, nothing to hydrate. Every moving part is a `transform` or an
 * `opacity`, so it composites on the GPU and costs no layout, and the whole
 * thing is `aria-hidden`: it is decoration, and a screen reader announcing
 * thirty bar heights would be worse than silence. Motion is disabled wholesale
 * under `prefers-reduced-motion` (see viewport-first-marketing.css), where it
 * settles into a still waveform that still carries the page.
 */
export default function WireSignalArt({ variant = "wave", className }: WireSignalArtProps) {
  return (
    <div className={cn("wire-signal-art", `wire-signal-art--${variant}`, className)} aria-hidden>
      <svg viewBox="0 0 600 72" fill="none" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="wire-signal-line" x1="0" y1="0" x2="600" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="18%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="82%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The wire. Every variant keeps it: it is the product's name. */}
        <line x1="0" y1="36" x2="600" y2="36" stroke="url(#wire-signal-line)" strokeWidth="0.75" />

        {variant === "wave"
          ? WAVE_BARS.map((height, index) => {
              const x = 6 + index * 12;
              return (
                <rect
                  key={x}
                  className="wire-signal-art__bar"
                  x={x}
                  y={36 - height / 2}
                  width="4"
                  height={height}
                  rx="2"
                  fill="currentColor"
                  style={{ ["--wire-bar-index" as string]: index }}
                />
              );
            })
          : PULSE_NODES.map((position, index) => (
              <circle
                key={position}
                className="wire-signal-art__node"
                cx={position * 600}
                cy="36"
                r="4"
                fill="currentColor"
                style={{ ["--wire-bar-index" as string]: index }}
              />
            ))}

        {/* The travelling signal — one packet crossing the wire, on a loop. */}
        <circle className="wire-signal-art__packet" cx="0" cy="36" r="2.5" fill="currentColor" />
      </svg>
    </div>
  );
}
