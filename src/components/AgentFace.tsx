/**
 * AgentFace — every Wireline agent gets a face.
 *
 * A tasteful, deterministic character avatar derived from the agent's
 * identity (id or name), so the same agent always wears the same face
 * across the studio, overview, call logs, and the browser widget. The
 * palette stays inside the Wireline world (warm skin tones on brand
 * gradients, a copper signal node from the Wire), so faces read as one
 * family rather than clip-art.
 *
 * This is the identity layer. A customer-selected face and a live video
 * presenter (HeyGen) drop in on top of the same slot later — `faceId`
 * lets a stored choice override the deterministic default.
 */
import { useId } from "react";

type Skin = { base: string; shade: string };
type Ground = [string, string];

// Warm, brand-harmonized skin tones — a deliberately small, cohesive set.
const SKINS: Skin[] = [
  { base: "#E7B48A", shade: "#C98F63" },
  { base: "#C88A5E", shade: "#A66B41" },
  { base: "#9A6842", shade: "#7C4F30" },
  { base: "#F0C9A6", shade: "#D6A57C" },
  { base: "#6E4A32", shade: "#553827" },
  { base: "#D89C6E", shade: "#B4774A" },
];

// Backgrounds pull from the dark brand palette — patina, copper, ink.
const GROUNDS: Ground[] = [
  ["#1E3A30", "#132420"],
  ["#3A2A1B", "#221812"],
  ["#22322C", "#15201C"],
  ["#33261A", "#1E1710"],
  ["#26302E", "#161d1b"],
];

const HAIR: string[] = ["#241C15", "#3B2A1C", "#12100C", "#4A3524", "#5B4A3A", "#2A2320"];

type HairStyle = "crop" | "bob" | "bun" | "waves" | "fade" | "sweep";
const HAIR_STYLES: HairStyle[] = ["crop", "bob", "bun", "waves", "fade", "sweep"];

// Stable string hash → deterministic face selection.
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type AgentFaceConfig = {
  skin: Skin;
  ground: Ground;
  hair: string;
  hairStyle: HairStyle;
  accent: string;
};

const ACCENTS = [
  "var(--wireline-color-action-secondary-default, #D4823F)",
  "var(--wireline-color-action-primary-default, #5BA98A)",
];

export function faceConfigFor(seed: string): AgentFaceConfig {
  const h = hash(seed || "agent");
  return {
    skin: SKINS[h % SKINS.length],
    ground: GROUNDS[(h >>> 3) % GROUNDS.length],
    hair: HAIR[(h >>> 6) % HAIR.length],
    hairStyle: HAIR_STYLES[(h >>> 9) % HAIR_STYLES.length],
    accent: ACCENTS[(h >>> 12) % ACCENTS.length],
  };
}

function HairShape({ style, color }: { style: HairStyle; color: string }) {
  switch (style) {
    case "bob":
      return (
        <>
          <path
            d="M27 44c0-13 9-21 21-21s21 8 21 21v11c0 2-2 3-4 2-1-8-2-17-2-17-5 5-19 6-30 0 0 0-1 9-2 17-2 1-4 0-4-2Z"
            fill={color}
          />
        </>
      );
    case "bun":
      return (
        <>
          <circle cx="48" cy="20" r="6" fill={color} />
          <path
            d="M28 42c0-12 9-20 20-20s20 8 20 20c0 3-1 5-1 5-3-8-8-12-19-12s-16 4-19 12c0 0-1-2-1-5Z"
            fill={color}
          />
        </>
      );
    case "waves":
      return (
        <path
          d="M27 44c0-13 9-22 21-22s21 9 21 22c-3-3-5-7-8-5-2 2-4 3-6 1s-4-4-7-2-4 4-7 2-4-3-6-1c-2 2-5 4-8 5Z"
          fill={color}
        />
      );
    case "fade":
      return (
        <path d="M30 40c1-10 8-17 18-17s17 7 18 17c-2-2-3-5-6-5H36c-3 0-4 3-6 5Z" fill={color} />
      );
    case "sweep":
      return (
        <path
          d="M28 43c0-13 9-21 20-21 8 0 14 4 17 11-6-3-13-4-20-2-6 2-11 6-13 13-2-1-4 0-4 0Z"
          fill={color}
        />
      );
    case "crop":
    default:
      return (
        <path d="M29 43c0-12 8-21 19-21s19 9 19 21c-3-6-9-10-19-10s-16 4-19 10Z" fill={color} />
      );
  }
}

export default function AgentFace({
  seed,
  faceId,
  size = 40,
  speaking = false,
  className,
  title,
}: {
  seed: string;
  /** Reserved: a stored customer-selected face overrides the deterministic default. */
  faceId?: string | null;
  size?: number;
  speaking?: boolean;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const cfg = faceConfigFor(faceId || seed);

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={`wl-agent-face${speaking ? " wl-agent-face--speaking" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={title || "Agent face"}
    >
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.ground[0]} />
          <stop offset="100%" stopColor={cfg.ground[1]} />
        </linearGradient>
        <linearGradient id={`s-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.skin.base} />
          <stop offset="100%" stopColor={cfg.skin.shade} />
        </linearGradient>
        <clipPath id={`c-${uid}`}>
          <rect x="0" y="0" width="96" height="96" rx="24" />
        </clipPath>
      </defs>

      <g clipPath={`url(#c-${uid})`}>
        <rect x="0" y="0" width="96" height="96" fill={`url(#g-${uid})`} />
        {/* shoulders / collar */}
        <path d="M20 96c0-14 12-22 28-22s28 8 28 22Z" fill={cfg.skin.shade} opacity="0.55" />
        <path d="M28 96c0-11 9-17 20-17s20 6 20 17Z" fill={cfg.accent} opacity="0.9" />
        {/* neck */}
        <rect x="42" y="58" width="12" height="18" rx="6" fill={`url(#s-${uid})`} />
        {/* head */}
        <ellipse cx="48" cy="46" rx="19" ry="21" fill={`url(#s-${uid})`} />
        {/* ears */}
        <circle cx="29" cy="47" r="3.4" fill={cfg.skin.shade} />
        <circle cx="67" cy="47" r="3.4" fill={cfg.skin.shade} />
        {/* eyes */}
        <g fill="#20140c">
          <ellipse className="wl-af-eye" cx="41" cy="46" rx="2.3" ry="3" />
          <ellipse className="wl-af-eye" cx="55" cy="46" rx="2.3" ry="3" />
        </g>
        {/* brows */}
        <g stroke={cfg.hair} strokeWidth="1.8" strokeLinecap="round">
          <line x1="37.5" y1="40" x2="44" y2="39.5" />
          <line x1="52" y1="39.5" x2="58.5" y2="40" />
        </g>
        {/* smile */}
        <path
          className="wl-af-mouth"
          d="M42 55c2 2.6 10 2.6 12 0"
          fill="none"
          stroke="#7c3f2a"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* hair on top */}
        <HairShape style={cfg.hairStyle} color={cfg.hair} />
        {/* the Wire signal node */}
        <circle
          cx="78"
          cy="18"
          r="4.5"
          fill="var(--wireline-color-action-secondary-default, #D4823F)"
        />
        <circle
          cx="78"
          cy="18"
          r="8"
          fill="var(--wireline-color-action-secondary-default, #D4823F)"
          opacity="0.2"
        />
      </g>
    </svg>
  );
}
