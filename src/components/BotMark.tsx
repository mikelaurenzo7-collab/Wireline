import type { CSSProperties } from "react";
import {
  Activity,
  Aperture,
  AudioWaveform,
  Compass,
  Dna,
  Gem,
  Infinity as InfinityIcon,
  Orbit,
  RadioTower,
  Route,
  ScanLine,
  Sparkles,
  SunMedium,
  Triangle,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { botMarkFor, type BotMarkKey, type BotMarkMotif } from "../lib/bot-mark";

type BotMarkStyle = CSSProperties & {
  "--wl-bot-mark-surface-from": string;
  "--wl-bot-mark-surface-to": string;
  "--wl-bot-mark-wire": string;
  "--wl-bot-mark-accent": string;
  "--wl-bot-mark-halo": string;
  "--wl-bot-mark-phase": string;
};

const MOTIF_ICONS: Record<BotMarkMotif, LucideIcon> = {
  orbit: Orbit,
  beacon: RadioTower,
  spark: Sparkles,
  prism: Gem,
  flow: Waypoints,
  pulse: Activity,
  compass: Compass,
  focus: ScanLine,
  aperture: Aperture,
  wave: AudioWaveform,
  helix: Dna,
  loop: InfinityIcon,
  nova: SunMedium,
  route: Route,
  vertex: Triangle,
};

export default function BotMark({
  seed,
  name,
  markKey,
  size = 32,
  imageUrl,
  active = false,
  className = "",
  title,
}: {
  seed: string;
  name?: string | null;
  markKey?: BotMarkKey | string | null;
  size?: number;
  imageUrl?: string | null;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const mark = botMarkFor({ seed, name, markKey });
  const MarkIcon = MOTIF_ICONS[mark.motif];
  const accessibleLabel = title || `${name || "Bot"} mark`;
  const style: BotMarkStyle = {
    width: size,
    height: size,
    "--wl-bot-mark-surface-from": mark.palette.surfaceFrom,
    "--wl-bot-mark-surface-to": mark.palette.surfaceTo,
    "--wl-bot-mark-wire": mark.palette.wire,
    "--wl-bot-mark-accent": mark.palette.accent,
    "--wl-bot-mark-halo": mark.palette.halo,
    "--wl-bot-mark-phase": `${mark.phaseMs}ms`,
  };

  return (
    <span
      className={`wl-bot-mark relative inline-flex shrink-0 items-center justify-center align-middle ${className}`.trim()}
      style={style}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-active={active ? "true" : "false"}
      data-mark-key={mark.key}
      data-motif={mark.motif}
    >
      <span className="wl-bot-mark__core">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="wl-bot-mark__image" />
        ) : (
          <MarkIcon className="wl-bot-mark__glyph" strokeWidth={2.15} aria-hidden="true" />
        )}
      </span>
      <span className="wl-bot-mark__rim" aria-hidden="true" />
      {active ? <span className="wl-bot-mark__pulse" aria-hidden="true" /> : null}
    </span>
  );
}
