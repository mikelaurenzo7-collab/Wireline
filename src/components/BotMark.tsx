import type { CSSProperties } from "react";

import { botMarkFor, type BotMarkMotif } from "../lib/bot-mark";

type BotMarkStyle = CSSProperties & {
  "--wl-bot-mark-wire": string;
  "--wl-bot-mark-accent": string;
  "--wl-bot-mark-ink": string;
  "--wl-bot-mark-halo": string;
  "--wl-bot-mark-phase": string;
};

const MOTIF_PATHS: Record<BotMarkMotif, readonly string[]> = {
  orbit: [
    "M7.2 18.5C9.5 10.4 18.6 7.7 24.8 12.1",
    "M8.7 22.4C14.2 25.1 21.9 21.8 24.4 15.8",
  ],
  relay: [
    "M7.5 10.8C12 7.3 17.8 8.2 19.4 12.2C21.6 17.5 17 20 13.1 19.3C9.9 18.8 8.2 21.1 10 24",
  ],
  split: ["M8 23C11.2 17.7 12.8 14.6 15.8 10", "M15.8 10C18.2 13.1 20.5 14.7 24 15.7"],
  loop: [
    "M8.2 16C8.2 11.7 11.7 8.2 16 8.2C20.3 8.2 23.8 11.7 23.8 16C23.8 20.3 20.3 23.8 16 23.8C12.1 23.8 9.2 21.4 8.3 18.4",
  ],
  pulse: ["M6.7 17H10.8L13.5 11.1L17 21.6L20.1 14.1H25.3"],
  weave: ["M7 21C10 13 13.1 11 16 16C18.9 21 22 19 25 11"],
};

function WireGlyph({
  motif,
  rotation,
  mirror,
  anchor,
}: {
  motif: BotMarkMotif;
  rotation: number;
  mirror: boolean;
  anchor: { x: number; y: number };
}) {
  const transform = `translate(16 16) rotate(${rotation}) scale(${mirror ? -1 : 1} 1) translate(-16 -16)`;

  return (
    <svg
      aria-hidden="true"
      className="wl-bot-mark__glyph"
      viewBox="0 0 32 32"
      focusable="false"
    >
      <g transform={transform}>
        {MOTIF_PATHS[motif].map((path) => (
          <path key={path} d={path} />
        ))}
        <circle className="wl-bot-mark__anchor" cx={anchor.x} cy={anchor.y} r="1.35" />
      </g>
    </svg>
  );
}

export default function BotMark({
  seed,
  name,
  size = 32,
  imageUrl,
  active = false,
  className = "",
  title,
}: {
  seed: string;
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const mark = botMarkFor({ seed, name });
  const accessibleLabel = title || `${name || "Bot"} mark`;
  const showMicroMonogram = !imageUrl && size >= 28;
  const style: BotMarkStyle = {
    width: size,
    height: size,
    "--wl-bot-mark-wire": mark.palette.wire,
    "--wl-bot-mark-accent": mark.palette.accent,
    "--wl-bot-mark-ink": mark.palette.ink,
    "--wl-bot-mark-halo": mark.palette.halo,
    "--wl-bot-mark-phase": `${mark.phaseMs}ms`,
  };
  const coreStyle: CSSProperties = {
    background: `radial-gradient(circle at ${mark.glowX}% ${mark.glowY}%, color-mix(in srgb, ${mark.palette.accent} 32%, transparent), transparent 42%), linear-gradient(145deg, ${mark.palette.surfaceFrom}, ${mark.palette.surfaceTo} 72%)`,
  };

  return (
    <span
      className={`wl-bot-mark relative inline-flex shrink-0 items-center justify-center align-middle ${className}`.trim()}
      style={style}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-active={active ? "true" : "false"}
      data-motif={mark.motif}
    >
      <span className="wl-bot-mark__core absolute inset-0 overflow-hidden rounded-full" style={coreStyle}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="wl-bot-mark__sheen" aria-hidden="true" />
            <WireGlyph
              motif={mark.motif}
              rotation={mark.rotation}
              mirror={mark.mirror}
              anchor={mark.anchor}
            />
            {showMicroMonogram ? (
              <span
                aria-hidden="true"
                className="wl-bot-mark__monogram"
                style={{ fontSize: Math.max(7, Math.round(size * 0.23)) }}
              >
                {mark.initial}
              </span>
            ) : null}
          </>
        )}
      </span>
      <span className="wl-bot-mark__rim absolute inset-0 rounded-full" aria-hidden="true" />
      {active ? <span className="wl-bot-mark__pulse absolute inset-0 rounded-full" aria-hidden="true" /> : null}
    </span>
  );
}
