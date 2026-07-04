/**
 * AgentFace — every Wireline agent gets a face.
 *
 * A tasteful, deterministic character avatar derived from the agent's
 * identity, so the same agent always wears the same face across the studio,
 * overview, call logs, browser widget, and video-presenter fallback.
 *
 * The palette and provider-agnostic presenter policy live in
 * `lib/agent-identity` so a customer-selected face or live video provider can
 * override this SVG without changing every surface that renders an agent.
 */
import { useId } from "react";

import { faceConfigFor, type HairStyle } from "../lib/agent-identity";

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
          <ellipse cx="41" cy="46" rx="2.3" ry="3" />
          <ellipse cx="55" cy="46" rx="2.3" ry="3" />
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
