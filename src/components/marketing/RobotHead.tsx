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
 * Legacy placement-compatible marketing mark.
 * Keep it monochrome and quiet; do not reintroduce character art.
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
      aria-label={`Wireline ${poseLabel[pose]} agent`}
      style={{ opacity }}
    >
      <defs>
        <linearGradient id={`wireline-signal-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--wireline-color-action-primary-default, #A78BFA)" />
          <stop offset="100%" stopColor="var(--wireline-color-action-primary-pressed, #8B5CF6)" />
        </linearGradient>
      </defs>
      <rect
        x="8"
        y="8"
        width="80"
        height="80"
        rx="12"
        fill="var(--wireline-color-surface-default, #FFFFFF)"
        stroke="var(--wireline-color-border-default, #E8E7E3)"
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
          stroke="var(--wireline-color-action-primary-default, #A78BFA)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="70"
          cy="27"
          r="5"
          fill="var(--wireline-color-action-primary-container, rgba(167,139,250,.12))"
          className={pulseClass}
        />
      </g>
      <text
        x="48"
        y="82"
        textAnchor="middle"
        fill="var(--wireline-color-text-secondary, #6B6B65)"
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
