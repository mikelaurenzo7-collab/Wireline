/**
 * RobotHead — Creative brand mascot for Wireline landing page hero corners.
 * Minimalist line-art robot head with phone icon integrated at the "ear".
 * Matches brand palette: Deep purple (#4F1E7B), Emerald (#10B981), Cream accents.
 * Four variants for the four corners with subtle personality differences.
 */
import React from "react";

interface RobotHeadProps {
  variant?: 1 | 2 | 3 | 4;
  size?: number;
  className?: string;
  animated?: boolean;
}

// Brand colors via CSS variables for dark-mode future-proofing.
// Defaults match the current light hero. Override via :root or .dark.
const COLORS = {
  purple: "var(--wl-purple, #4F1E7B)",
  purpleLight: "var(--wl-purple-light, #6B2B99)",
  emerald: "var(--wl-emerald, #10B981)",
  cream: "var(--wl-cream, #F5F0E6)",
  ink: "var(--wl-ink, #1F2937)",
};

export function RobotHead({
  variant = 1,
  size = 64,
  className = "",
  animated = true,
  "aria-hidden": ariaHidden,
}: RobotHeadProps & { "aria-hidden"?: boolean }) {
  const strokeWidth = size / 32;
  const isLeft = variant === 1 || variant === 3;

  // Subtle rotation/position offsets per variant for visual interest
  const transforms = {
    1: "rotate(-8deg)",
    2: "rotate(6deg)",
    3: "rotate(4deg)",
    4: "rotate(-5deg)",
  }[variant];

  const phoneOffset = isLeft ? -size * 0.28 : size * 0.28;

  return (
    <>
      {animated && (
        <style>{`
          @keyframes wl-robot-breath {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(0.82); opacity: 0.7; }
          }
        `}</style>
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden={ariaHidden ?? true}
        style={{
          transform: transforms,
          transition: animated ? "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)" : undefined,
        }}
      >
      {/* Subtle glow */}
      <defs>
        <linearGradient id={`headGrad-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={COLORS.purple} stopOpacity="0.95" />
          <stop offset="100%" stopColor={COLORS.purpleLight} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`phoneGrad-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={COLORS.emerald} />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Robot Head — rounded square with antenna */}
      <rect
        x="12"
        y="14"
        width="40"
        height="36"
        rx="8"
        ry="8"
        fill={`url(#headGrad-${variant})`}
        stroke={COLORS.ink}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* Head highlight */}
      <rect
        x="15"
        y="17"
        width="34"
        height="12"
        rx="4"
        fill={COLORS.cream}
        fillOpacity="0.15"
      />

      {/* Eyes — expressive per variant */}
      {variant === 1 && (
        <>
          <circle cx="24" cy="30" r="4.5" fill={COLORS.cream} />
          <circle cx="40" cy="30" r="4.5" fill={COLORS.cream} />
          <circle cx="25" cy="29" r="1.8" fill={COLORS.purple} />
          <circle cx="41" cy="29" r="1.8" fill={COLORS.purple} />
        </>
      )}
      {variant === 2 && (
        <>
          <rect x="20" y="26" width="8" height="8" rx="2" fill={COLORS.cream} />
          <rect x="36" y="26" width="8" height="8" rx="2" fill={COLORS.cream} />
          <circle cx="24" cy="30" r="2" fill={COLORS.emerald} />
          <circle cx="40" cy="30" r="2" fill={COLORS.emerald} />
        </>
      )}
      {variant === 3 && (
        <>
          <circle cx="24" cy="30" r="3.5" fill={COLORS.cream} />
          <circle cx="40" cy="30" r="3.5" fill={COLORS.cream} />
          <circle cx="24" cy="30" r="1.5" fill={COLORS.purple} />
          <circle cx="40" cy="30" r="1.5" fill={COLORS.purple} />
        </>
      )}
      {variant === 4 && (
        <>
          <path d="M20 27 Q24 34 28 27" stroke={COLORS.cream} strokeWidth="3" strokeLinecap="round" />
          <path d="M36 27 Q40 34 44 27" stroke={COLORS.cream} strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* Antenna */}
      <line
        x1="32"
        y1="14"
        x2="32"
        y2="6"
        stroke={COLORS.ink}
        strokeWidth={strokeWidth * 1.2}
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="4"
        r="3"
        fill={COLORS.emerald}
        stroke={COLORS.ink}
        strokeWidth={strokeWidth}
        style={{
          animation: animated ? "wl-robot-breath 3.2s ease-in-out infinite" : undefined,
        }}
      />

      {/* Phone next to ear — creative touch */}
      <g transform={`translate(${phoneOffset}, 22)`}>
        {/* Phone body */}
        <rect
          x="0"
          y="0"
          width="9"
          height="16"
          rx="1.5"
          ry="1.5"
          fill={`url(#phoneGrad-${variant})`}
          stroke={COLORS.ink}
          strokeWidth={strokeWidth * 0.8}
        />
        {/* Phone screen */}
        <rect x="1.5" y="2" width="6" height="9" rx="0.5" fill={COLORS.cream} fillOpacity="0.9" />
        {/* Speaker dots */}
        <circle cx="4.5" cy="13" r="0.6" fill={COLORS.ink} />
        <circle cx="6" cy="13" r="0.4" fill={COLORS.ink} />
      </g>

      {/* Subtle mouth / expression line */}
      <path
        d={variant % 2 === 0 ? "M26 40 Q32 44 38 40" : "M27 41 Q32 43 37 41"}
        stroke={COLORS.cream}
        strokeWidth={strokeWidth * 0.9}
        strokeLinecap="round"
        fill="none"
      />
      </svg>
    </>
  );
}

// Four pre-configured instances for the corners
export const RobotHeadTopLeft = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={1} {...props} />
);
export const RobotHeadTopRight = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={2} {...props} />
);
export const RobotHeadBottomLeft = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={3} {...props} />
);
export const RobotHeadBottomRight = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={4} {...props} />
);
