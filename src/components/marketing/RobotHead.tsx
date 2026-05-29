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
  purpleDeep: "var(--wl-purple-deep, #3B154C)",
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
        <rect x="15" y="17" width="34" height="12" rx="4" fill={COLORS.cream} fillOpacity="0.15" />

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
            <path
              d="M20 27 Q24 34 28 27"
              stroke={COLORS.cream}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M36 27 Q40 34 44 27"
              stroke={COLORS.cream}
              strokeWidth="3"
              strokeLinecap="round"
            />
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

/**
 * RobotWithPhone — Full-body brand mascot literally holding a phone to its
 * ear: the "talk to the team" gag made visual. Shares the RobotHead palette
 * (CSS-variable driven for dark-mode future-proofing) so the two read as one
 * family. Decorative only — callers should wrap in an aria-hidden container.
 */
export function RobotWithPhone({
  size = 205,
  className = "",
  animated = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  // viewBox is 148×205; scale height to `size` and keep the aspect ratio.
  const width = (148 / 205) * size;
  return (
    <>
      {animated && (
        <style>{`
          @keyframes wl-robot-phone-breath {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(0.82); opacity: 0.7; }
          }
        `}</style>
      )}
      <svg
        width={width}
        height={size}
        viewBox="0 0 148 205"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Antenna */}
        <line
          x1="62"
          y1="24"
          x2="62"
          y2="8"
          stroke={COLORS.ink}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle
          cx="62"
          cy="5"
          r="5"
          fill={COLORS.emerald}
          stroke={COLORS.ink}
          strokeWidth="1.5"
          style={{
            transformOrigin: "62px 5px",
            animation: animated ? "wl-robot-phone-breath 3.2s ease-in-out infinite" : undefined,
          }}
        />

        {/* Head */}
        <rect
          x="16"
          y="24"
          width="92"
          height="58"
          rx="11"
          fill={COLORS.purple}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />
        <rect x="22" y="28" width="80" height="16" rx="4" fill={COLORS.cream} fillOpacity="0.12" />

        {/* Eyes */}
        <circle cx="46" cy="50" r="10" fill={COLORS.cream} />
        <circle cx="78" cy="50" r="10" fill={COLORS.cream} />
        <circle cx="48" cy="49" r="4" fill={COLORS.purple} />
        <circle cx="80" cy="49" r="4" fill={COLORS.purple} />
        <circle cx="49.5" cy="47.5" r="1.5" fill={COLORS.cream} />
        <circle cx="81.5" cy="47.5" r="1.5" fill={COLORS.cream} />

        {/* Mouth */}
        <path
          d="M44 68 Q62 76 80 68"
          stroke={COLORS.cream}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Body */}
        <rect
          x="20"
          y="86"
          width="84"
          height="74"
          rx="10"
          fill={COLORS.purple}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />
        <rect x="27" y="92" width="70" height="16" rx="4" fill={COLORS.cream} fillOpacity="0.12" />

        {/* Chest panel */}
        <circle cx="45" cy="126" r="9" fill={COLORS.purpleDeep} />
        <circle cx="45" cy="126" r="5.5" fill={COLORS.emerald} />
        <rect x="60" y="118" width="16" height="18" rx="3" fill={COLORS.purpleDeep} />
        <line
          x1="63"
          y1="123"
          x2="73"
          y2="123"
          stroke={COLORS.cream}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
        <line
          x1="63"
          y1="127"
          x2="71"
          y2="127"
          stroke={COLORS.cream}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
        <line
          x1="63"
          y1="131"
          x2="69"
          y2="131"
          stroke={COLORS.cream}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />

        {/* Left arm */}
        <rect
          x="2"
          y="90"
          width="16"
          height="58"
          rx="7"
          fill={COLORS.purple}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />

        {/* Right arm raised to hold phone — ink outline under purple fill */}
        <path
          d="M104 96 C110 84 118 64 124 46"
          stroke={COLORS.ink}
          strokeWidth="23"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M104 96 C110 84 118 64 124 46"
          stroke={COLORS.purple}
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />

        {/* Phone */}
        <rect
          x="116"
          y="10"
          width="24"
          height="40"
          rx="5"
          fill={COLORS.emerald}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />
        <rect x="120" y="14" width="16" height="24" rx="2" fill={COLORS.cream} fillOpacity="0.9" />
        {/* Signal waves on screen */}
        <path
          d="M122 19 Q128 16 134 19"
          stroke={COLORS.purple}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M120 24 Q128 19 136 24"
          stroke={COLORS.purple}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Home button */}
        <circle cx="128" cy="44" r="2.5" fill={COLORS.purpleDeep} />

        {/* Legs */}
        <rect
          x="34"
          y="158"
          width="24"
          height="42"
          rx="8"
          fill={COLORS.purple}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />
        <rect
          x="66"
          y="158"
          width="24"
          height="42"
          rx="8"
          fill={COLORS.purple}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />

        {/* Feet */}
        <rect
          x="26"
          y="192"
          width="38"
          height="12"
          rx="5"
          fill={COLORS.purpleDeep}
          stroke={COLORS.ink}
          strokeWidth="1.5"
        />
        <rect
          x="62"
          y="192"
          width="38"
          height="12"
          rx="5"
          fill={COLORS.purpleDeep}
          stroke={COLORS.ink}
          strokeWidth="1.5"
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
