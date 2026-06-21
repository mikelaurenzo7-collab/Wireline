import { useId } from "react";

export type RobotPose = "phone" | "on-call" | "typing" | "texting";

interface RobotHeadProps {
  variant?: 1 | 2 | 3 | 4 | 5 | 6;
  pose?: RobotPose;
  size?: number;
  className?: string;
  animated?: boolean;
  vivid?: boolean;
  gutterSide?: "left" | "right";
}

const poseLabel: Record<RobotPose, string> = {
  phone: "Call",
  "on-call": "Active",
  typing: "Draft",
  texting: "Reply",
};

/**
 * Wireline’s marketing signal mark. The former violet robot illustration was
 * retired with the Stitch migration; this compact, high-contrast mark carries
 * the same placement API without introducing a competing visual language.
 */
export default function RobotHead({
  variant = 1,
  pose = "phone",
  size = 128,
  className,
  animated = false,
  vivid = false,
  gutterSide = "right",
}: RobotHeadProps) {
  const uid = useId().replace(/:/g, "");
  const mirrored = gutterSide === "left";
  const pulseClass = animated ? "robot-antenna-pulse" : undefined;
  const opacity = vivid ? 1 : 0.9;

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Wireline ${poseLabel[pose]} assistant`}
      style={{ opacity }}
    >
      <defs>
        <linearGradient id={`wireline-signal-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--wl-accent, #1A3C34)" />
          <stop offset="100%" stopColor="var(--wl-accent-deep, #01261F)" />
        </linearGradient>
      </defs>
      <rect
        x="8"
        y="8"
        width="80"
        height="80"
        rx="8"
        fill="var(--wl-surface, #FFFFFF)"
        stroke="var(--wl-line, #E5E5E1)"
      />
      <g transform={mirrored ? "translate(96 0) scale(-1 1)" : undefined}>
        <path
          d="M20 60V36C20 30.5 24.5 26 30 26H52C57.5 26 62 30.5 62 36V60C62 65.5 57.5 70 52 70H30C24.5 70 20 65.5 20 60Z"
          fill={`url(#wireline-signal-${uid})`}
        />
        <path
          d="M31 44H51M31 53H44"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M66 35C72 39 75 44 75 48C75 52 72 57 66 61"
          fill="none"
          stroke="var(--wl-accent, #1A3C34)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="70"
          cy="27"
          r="5"
          fill="var(--wl-accent-muted, #AACEC3)"
          className={pulseClass}
        />
      </g>
      <text
        x="48"
        y="82"
        textAnchor="middle"
        fill="var(--wl-muted, #6E6E73)"
        fontFamily="Inter, sans-serif"
        fontSize="7"
        fontWeight="700"
        letterSpacing="1.1"
      >
        {poseLabel[pose].toUpperCase()} {variant}
      </text>
    </svg>
  );
}

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
export const RobotHeadMiddleLeft = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={5} {...props} />
);
export const RobotHeadMiddleRight = (props: Omit<RobotHeadProps, "variant">) => (
  <RobotHead variant={6} {...props} />
);
