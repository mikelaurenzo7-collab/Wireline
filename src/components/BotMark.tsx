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
  "--wl-bot-mark-tint": string;
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
  size = 24,
  imageUrl,
  active = false,
  working = false,
  decorative = false,
  className = "",
  title,
}: {
  seed: string;
  name?: string | null;
  markKey?: BotMarkKey | string | null;
  size?: number;
  imageUrl?: string | null;
  active?: boolean;
  working?: boolean;
  decorative?: boolean;
  className?: string;
  title?: string;
}) {
  const mark = botMarkFor({ seed, name, markKey });
  const MarkIcon = MOTIF_ICONS[mark.motif];
  const accessibleLabel = title || `${name || "Bot"} mark`;
  const style: BotMarkStyle = {
    width: size,
    height: size,
    "--wl-bot-mark-tint": mark.palette.surfaceFrom,
  };

  return (
    <span
      className={`wl-bot-mark relative inline-flex shrink-0 items-center justify-center align-middle ${className}`.trim()}
      style={style}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      title={decorative ? undefined : accessibleLabel}
      data-active={active ? "true" : "false"}
      data-working={working ? "true" : "false"}
      data-mark-key={mark.key}
      data-motif={mark.motif}
    >
      <span className="wl-bot-mark__core">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="wl-bot-mark__image" />
        ) : (
          <MarkIcon className="wl-bot-mark__glyph" strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>
    </span>
  );
}
