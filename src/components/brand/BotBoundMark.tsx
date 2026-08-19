import { useId } from "react";

type BotBoundMarkProps = {
  className?: string;
  label?: string;
  /** Violet/platinum production treatment. Set false for single-color contexts. */
  signal?: boolean;
};

/**
 * Canonical BotBound mark: a friendly operator Bot actively on the phone.
 *
 * The silhouette is deliberately compact: antenna + visor establish the Bot,
 * while the violet receiver hugs the left ear and stays readable at favicon
 * scale. The mark uses filled geometry rather than thin detail so it survives
 * 16px, dark mode, light mode, printing, and billing surfaces.
 */
export default function BotBoundMark({
  className = "",
  label,
  signal = true,
}: BotBoundMarkProps) {
  const instanceId = useId().replace(/:/g, "");
  const shellId = `botbound-shell-${instanceId}`;
  const phoneId = `botbound-phone-${instanceId}`;
  const glowId = `botbound-glow-${instanceId}`;

  const shell = signal ? `url(#${shellId})` : "currentColor";
  const phone = signal ? `url(#${phoneId})` : "currentColor";
  const visor = signal ? "#08080D" : "var(--wireline-color-surface-default)";
  const eye = signal ? "#A78BFA" : "currentColor";

  return (
    <svg
      viewBox="0 0 128 128"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      data-botbound-mark="phone-bot"
    >
      {signal ? (
        <defs>
          <linearGradient id={shellId} x1="38" y1="18" x2="92" y2="108" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="0.55" stopColor="#F0EDFF" />
            <stop offset="1" stopColor="#B9A4FF" />
          </linearGradient>
          <linearGradient id={phoneId} x1="13" y1="30" x2="47" y2="91" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#C4B5FD" />
            <stop offset="0.42" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#6D3DEB" />
          </linearGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#A78BFA" stopOpacity="0.38" />
            <stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
          </radialGradient>
        </defs>
      ) : null}

      {signal ? <ellipse cx="65" cy="107" rx="43" ry="12" fill={`url(#${glowId})`} /> : null}

      {/* Antenna */}
      <rect x="61" y="12" width="6" height="14" rx="3" fill={phone} />
      <circle cx="64" cy="10" r="6" fill={phone} />

      {/* Torso */}
      <path d="M39 82c0-10 8-18 18-18h16c10 0 18 8 18 18v27H39V82Z" fill={shell} />
      <path d="M48 91c10 5 22 5 33 0v18H48V91Z" fill={signal ? "#D9D0FF" : "currentColor"} opacity={signal ? 0.7 : 1} />

      {/* Head and ear pieces */}
      <rect x="31" y="24" width="66" height="57" rx="24" fill={shell} />
      <rect x="27" y="42" width="9" height="24" rx="4.5" fill={phone} />
      <rect x="92" y="42" width="9" height="24" rx="4.5" fill={phone} />
      <rect x="39" y="34" width="50" height="31" rx="15.5" fill={visor} />

      {/* Friendly expression */}
      <path d="M49 49c3-5 8-5 11 0" fill="none" stroke={eye} strokeWidth="4" strokeLinecap="round" />
      <path d="M68 49c3-5 8-5 11 0" fill="none" stroke={eye} strokeWidth="4" strokeLinecap="round" />
      <path d="M59 70c3 3 8 3 11 0" fill="none" stroke={signal ? "#5B556B" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" />

      {/* Receiver held to the Bot's ear */}
      <path
        d="M24 34c-5 7-8 16-8 27 0 12 3 22 9 29"
        fill="none"
        stroke={phone}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M20 35l10 5M21 89l11-6" fill="none" stroke={phone} strokeWidth="9" strokeLinecap="round" />
      <circle cx="33" cy="78" r="8" fill={shell} />
      <path d="M29 76c4-4 9-4 13-1" fill="none" stroke={signal ? "#8B5CF6" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
