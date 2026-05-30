/**
 * RobotHead — Wireline landing mascot.
 * Editorial line-art robot with pose-specific accessories (phone, on-call,
 * texting, typing). Each instance uses unique gradient IDs via useId().
 */
import React, { useId } from "react";

export type RobotPose = "phone" | "on-call" | "typing" | "texting";

interface RobotHeadProps {
  variant?: 1 | 2 | 3 | 4 | 5 | 6;
  pose?: RobotPose;
  size?: number;
  className?: string;
  animated?: boolean;
  /** Hero gutter: richer fills and no extra SVG shadow (parent applies halo). */
  vivid?: boolean;
}

const COLORS = {
  purple: "var(--wl-purple, #4F1E7B)",
  purpleLight: "var(--wl-purple-light, #6B2B99)",
  purpleDeep: "var(--wl-purple-deep, #3B154C)",
  emerald: "var(--wl-emerald, #10B981)",
  emeraldSoft: "var(--wl-emerald-soft, #34D399)",
  cream: "var(--wl-cream, #F5F0E6)",
  paper: "var(--wl-paper, #EFE9DC)",
  ink: "var(--wl-ink, #1F2937)",
};

const POSE_LAYOUT: Record<RobotPose, { viewBox: string; heightRatio: number }> = {
  phone: { viewBox: "0 0 64 64", heightRatio: 1 },
  "on-call": { viewBox: "0 0 64 64", heightRatio: 1 },
  texting: { viewBox: "0 0 64 70", heightRatio: 1.09 },
  typing: { viewBox: "0 0 64 76", heightRatio: 1.19 },
};

function gazeForPose(pose: RobotPose, variant: number): { dx: number; dy: number } {
  if (pose === "texting") return { dx: 0.5, dy: 2.8 };
  if (pose === "typing") return { dx: 0, dy: 3.2 };
  if (pose === "on-call") return { dx: variant % 2 === 1 ? -0.6 : 0.6, dy: -0.4 };
  return { dx: variant === 1 || variant === 6 ? 0.8 : 0, dy: 0 };
}

function Eyes({
  variant,
  pose,
  strokeWidth,
}: {
  variant: 1 | 2 | 3 | 4 | 5 | 6;
  pose: RobotPose;
  strokeWidth: number;
}) {
  const { dx, dy } = gazeForPose(pose, variant);
  const squint = pose === "on-call" && variant !== 4;

  if (variant === 2) {
    const h = squint ? 6 : 8;
    const y = squint ? 27 : 26;
    return (
      <>
        <rect x="20" y={y} width="8" height={h} rx="2" fill={COLORS.cream} />
        <rect x="36" y={y} width="8" height={h} rx="2" fill={COLORS.cream} />
        <circle cx={24 + dx} cy={30 + dy} r="2" fill={COLORS.emerald} />
        <circle cx={40 + dx} cy={30 + dy} r="2" fill={COLORS.emerald} />
        <circle cx={25 + dx} cy={29 + dy} r="0.7" fill="white" fillOpacity="0.85" />
        <circle cx={41 + dx} cy={29 + dy} r="0.7" fill="white" fillOpacity="0.85" />
      </>
    );
  }

  if (variant === 4) {
    return (
      <>
        <ellipse cx="24" cy="30" rx="5.5" ry="5" fill={COLORS.cream} />
        <ellipse cx="40" cy="30" rx="5.5" ry="5" fill={COLORS.cream} />
        <circle cx="24" cy="30" r="1.75" fill={COLORS.emerald} />
        <circle cx="40" cy="30" r="1.75" fill={COLORS.emerald} />
        <path
          d={squint ? "M20 28 Q24 32 28 28" : "M20 27 Q24 34 28 27"}
          stroke={COLORS.purpleDeep}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
        <path
          d={squint ? "M36 28 Q40 32 44 28" : "M36 27 Q40 34 44 27"}
          stroke={COLORS.purpleDeep}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </>
    );
  }

  const r = variant === 3 ? 3.5 : variant === 5 ? 4 : 4.5;
  const pr = variant === 3 || variant === 5 ? 1.6 : 1.8;
  const pupil = variant === 5 || pose === "on-call" ? COLORS.emerald : COLORS.purple;
  const lx = variant === 1 || variant === 6 ? 25 : 24;
  const rx = variant === 1 || variant === 6 ? 41 : 40;

  return (
    <>
      <circle cx="24" cy="30" r={r} fill={COLORS.cream} />
      <circle cx="40" cy="30" r={r} fill={COLORS.cream} />
      <circle cx={lx + dx} cy={29 + dy} r={pr} fill={pupil} />
      <circle cx={rx + dx} cy={29 + dy} r={pr} fill={pupil} />
      <circle cx={lx + dx + 0.6} cy={28 + dy} r="0.65" fill="white" fillOpacity="0.9" />
      <circle cx={rx + dx + 0.6} cy={28 + dy} r="0.65" fill="white" fillOpacity="0.9" />
      {pose === "on-call" && (
        <>
          <path
            d="M22 24 Q24 22 26 24"
            stroke={COLORS.cream}
            strokeWidth={strokeWidth * 0.7}
            strokeLinecap="round"
          />
          <path
            d="M38 24 Q40 22 42 24"
            stroke={COLORS.cream}
            strokeWidth={strokeWidth * 0.7}
            strokeLinecap="round"
          />
        </>
      )}
    </>
  );
}

function HeadShell({ strokeWidth, uid }: { strokeWidth: number; uid: string }) {
  return (
    <>
      <ellipse cx="32" cy="52" rx="18" ry="4" fill={COLORS.purple} fillOpacity="0.06" />
      <rect
        x="12"
        y="14"
        width="40"
        height="36"
        rx="8"
        fill={`url(#headGrad-${uid})`}
        stroke={COLORS.ink}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <rect x="15" y="17" width="34" height="12" rx="4" fill={COLORS.cream} fillOpacity="0.18" />
      <rect x="18" y="19" width="14" height="3" rx="1.5" fill="white" fillOpacity="0.12" />
      <circle cx="14" cy="22" r="1.2" fill={COLORS.ink} fillOpacity="0.25" />
      <circle cx="50" cy="22" r="1.2" fill={COLORS.ink} fillOpacity="0.25" />
      <circle cx="20" cy="38" r="2.2" fill={COLORS.emerald} fillOpacity="0.08" />
      <circle cx="44" cy="38" r="2.2" fill={COLORS.emerald} fillOpacity="0.08" />
    </>
  );
}

function Antenna({
  uid,
  strokeWidth,
  animated,
}: {
  uid: string;
  strokeWidth: number;
  animated: boolean;
}) {
  return (
    <>
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
          animation: animated ? `wl-antenna-${uid} 3.2s ease-in-out infinite` : undefined,
        }}
      />
      <circle cx="32" cy="4" r="1.2" fill="white" fillOpacity="0.45" />
    </>
  );
}

function PhoneBody({
  uid,
  strokeWidth,
  x,
  y,
  scale = 1,
  screenMode,
  animated,
}: {
  uid: string;
  strokeWidth: number;
  x: number;
  y: number;
  scale?: number;
  screenMode: "idle" | "call" | "sms" | "wave";
  animated: boolean;
}) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <rect
        x="0"
        y="0"
        width="10"
        height="17"
        rx="2"
        fill={`url(#phoneGrad-${uid})`}
        stroke={COLORS.ink}
        strokeWidth={strokeWidth * 0.75}
      />
      <rect x="3" y="1.2" width="4" height="1.2" rx="0.6" fill={COLORS.ink} fillOpacity="0.35" />
      <rect
        x="1.5"
        y="3.5"
        width="7"
        height="9.5"
        rx="0.6"
        fill={COLORS.cream}
        fillOpacity="0.94"
      />
      {screenMode === "call" && (
        <path d="M3.5 7.5 Q5 6 6.5 7.5 Q5 9 3.5 7.5" fill={COLORS.emerald} fillOpacity="0.85" />
      )}
      {screenMode === "sms" && (
        <>
          <rect
            x="2.5"
            y="5.5"
            width="5"
            height="2"
            rx="0.5"
            fill={COLORS.purple}
            fillOpacity="0.35"
          />
          <rect
            x="2.5"
            y="8.5"
            width="3.5"
            height="2"
            rx="0.5"
            fill={COLORS.emerald}
            fillOpacity="0.5"
          />
        </>
      )}
      {screenMode === "wave" &&
        [0, 1, 2].map((i) => (
          <rect
            key={i}
            x={2.8 + i * 2.2}
            y="7"
            width="1.4"
            height="4"
            rx="0.4"
            fill={COLORS.purple}
            fillOpacity="0.55"
            style={{
              animation: animated
                ? `wl-wave-bar-${uid} 1.2s ease-in-out ${i * 0.15}s infinite`
                : undefined,
              transformOrigin: `${3.5 + i * 2.2}px 11px`,
            }}
          />
        ))}
      <circle cx="5" cy="14.5" r="0.65" fill={COLORS.ink} fillOpacity="0.5" />
    </g>
  );
}

function SidePhonePose({
  uid,
  strokeWidth,
  phoneOffset,
  phoneY,
  phoneSide,
  pose,
  animated,
}: {
  uid: string;
  strokeWidth: number;
  phoneOffset: number;
  phoneY: number;
  /** Which side of the head the phone sits on (toward page center for gutter stickers). */
  phoneSide: "left" | "right";
  pose: "phone" | "on-call";
  animated: boolean;
}) {
  const scale = pose === "on-call" ? 1.18 : 1;
  const screenMode = pose === "on-call" ? "call" : "wave";
  const phoneOnRight = phoneSide === "right";

  return (
    <>
      {pose === "on-call" &&
        [0, 1, 2].map((i) => (
          <path
            key={i}
            d={
              phoneOnRight
                ? `M${phoneOffset - 4 + i * 2} 20 Q${phoneOffset + 6 + i * 3} 26 ${phoneOffset + 10 + i} 32`
                : `M${phoneOffset + 14 - i * 2} 20 Q${phoneOffset + 4 - i * 3} 26 ${phoneOffset + 2 - i} 32`
            }
            stroke={COLORS.emerald}
            strokeWidth={1.4 - i * 0.25}
            strokeLinecap="round"
            fill="none"
            opacity={0.75 - i * 0.2}
            style={{
              animation: animated
                ? `wl-call-wave-${uid} 2.6s ease-in-out ${i * 0.35}s infinite`
                : undefined,
            }}
          />
        ))}
      <PhoneBody
        uid={uid}
        strokeWidth={strokeWidth}
        x={phoneOffset}
        y={phoneY}
        scale={scale}
        screenMode={screenMode}
        animated={animated}
      />
      {pose === "on-call" && (
        <circle
          cx={phoneOffset + 5}
          cy={29}
          r="9"
          fill={COLORS.emerald}
          fillOpacity="0.06"
          style={{
            animation: animated ? `wl-call-glow-${uid} 2.4s ease-in-out infinite` : undefined,
          }}
        />
      )}
    </>
  );
}

function TextingPose({
  uid,
  strokeWidth,
  animated,
  vivid = false,
}: {
  uid: string;
  strokeWidth: number;
  animated: boolean;
  vivid?: boolean;
}) {
  return (
    <g transform="translate(18, 34)">
      <path
        d="M8 22 Q14 24 20 22"
        stroke={COLORS.cream}
        strokeWidth={strokeWidth * 0.8}
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <PhoneBody
        uid={uid}
        strokeWidth={strokeWidth}
        x={6}
        y={8}
        scale={1.05}
        screenMode="sms"
        animated={animated}
      />
      <g transform="translate(20, 0)">
        <rect
          x="0"
          y="0"
          width="22"
          height="12"
          rx="4"
          fill={COLORS.cream}
          fillOpacity="0.97"
          stroke={COLORS.ink}
          strokeWidth={strokeWidth * 0.55}
        />
        <path
          d="M4 12 L2 15 L7 12"
          fill={COLORS.cream}
          stroke={COLORS.ink}
          strokeWidth={strokeWidth * 0.4}
        />
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={8 + i * 4.5}
            cy="6"
            r="1.15"
            fill={COLORS.purple}
            style={{
              animation: animated
                ? `wl-text-dot-${uid} 1.35s ease-in-out ${i * 0.2}s infinite`
                : undefined,
            }}
          />
        ))}
      </g>
      <g transform="translate(2, 18)">
        <rect
          x="0"
          y="0"
          width="16"
          height="9"
          rx="3"
          fill={COLORS.emerald}
          fillOpacity={vivid ? 0.5 : 0.22}
          stroke={COLORS.emerald}
          strokeWidth={strokeWidth * 0.45}
        />
        <rect
          x="3"
          y="3"
          width="8"
          height="1.5"
          rx="0.5"
          fill={COLORS.purpleDeep}
          fillOpacity="0.45"
        />
        <rect
          x="3"
          y="5.5"
          width="5"
          height="1.5"
          rx="0.5"
          fill={COLORS.purpleDeep}
          fillOpacity="0.35"
        />
      </g>
    </g>
  );
}

function TypingPose({
  uid,
  strokeWidth,
  animated,
}: {
  uid: string;
  strokeWidth: number;
  animated: boolean;
}) {
  const keys = [
    { x: 4, y: 26, i: 0 },
    { x: 14, y: 26, i: 1 },
    { x: 24, y: 26, i: 2 },
    { x: 34, y: 26, i: 3 },
    { x: 9, y: 33, i: 4 },
    { x: 19, y: 33, i: 5 },
    { x: 29, y: 33, i: 6 },
  ];

  return (
    <g transform="translate(10, 44)">
      <path
        d="M0 18 L44 18 L40 24 L4 24 Z"
        fill={COLORS.ink}
        fillOpacity="0.14"
        stroke={COLORS.ink}
        strokeWidth={strokeWidth * 0.55}
        strokeLinejoin="round"
      />
      <rect
        x="2"
        y="0"
        width="40"
        height="18"
        rx="2"
        fill={COLORS.purpleDeep}
        fillOpacity="0.92"
        stroke={COLORS.ink}
        strokeWidth={strokeWidth * 0.55}
      />
      <rect x="4" y="2" width="36" height="12" rx="1" fill={COLORS.purple} fillOpacity="0.55" />
      {[5, 9, 13].map((y, i) => (
        <rect
          key={y}
          x={6 + i * 2}
          y={y}
          width={22 - i * 4}
          height="1.2"
          rx="0.4"
          fill={COLORS.emeraldSoft}
          fillOpacity={0.35 + i * 0.12}
        />
      ))}
      <rect
        x="28"
        y="12"
        width="1.2"
        height="3"
        rx="0.3"
        fill={COLORS.cream}
        style={{
          animation: animated ? `wl-cursor-${uid} 1s step-end infinite` : undefined,
        }}
      />
      {keys.map(({ x, y, i }) => (
        <rect
          key={i}
          x={x}
          y={y}
          width="8"
          height="5"
          rx="0.6"
          fill={COLORS.cream}
          fillOpacity="0.88"
          stroke={COLORS.ink}
          strokeWidth={strokeWidth * 0.35}
          style={{
            animation: animated
              ? `wl-key-${uid} 2.4s ease-in-out ${i * 0.28}s infinite`
              : undefined,
          }}
        />
      ))}
    </g>
  );
}

function Mouth({
  variant,
  pose,
  strokeWidth,
}: {
  variant: number;
  pose: RobotPose;
  strokeWidth: number;
}) {
  const d =
    pose === "on-call"
      ? "M25 40 Q32 47 39 40"
      : pose === "texting"
        ? "M28 41 Q32 43.5 36 41"
        : pose === "typing"
          ? "M27 40 Q32 42 37 40"
          : variant % 2 === 0
            ? "M26 40 Q32 44 38 40"
            : "M27 41 Q32 43 37 41";

  return (
    <path
      d={d}
      stroke={COLORS.cream}
      strokeWidth={strokeWidth * 0.9}
      strokeLinecap="round"
      fill="none"
    />
  );
}

export function RobotHead({
  variant = 1,
  pose = "phone",
  size = 64,
  className = "",
  animated = true,
  vivid = false,
  "aria-hidden": ariaHidden,
}: RobotHeadProps & { "aria-hidden"?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const strokeWidth = size / 32;
  // Left-gutter variants (1, 3, 5) hold the phone on the right side of the
  // head (toward page center). Right-gutter variants hold it on the left.
  const isLeftGutterVariant = variant === 1 || variant === 3 || variant === 5;
  const phoneSide: "left" | "right" = isLeftGutterVariant ? "right" : "left";
  const phoneOffset = phoneSide === "right" ? 47 : 7.5;
  const phoneY = pose === "on-call" ? 20 : 21;
  const layout = POSE_LAYOUT[pose];

  const transforms = {
    1: "rotate(-8deg)",
    2: "rotate(6deg)",
    3: "rotate(4deg)",
    4: "rotate(-5deg)",
    5: "rotate(-2deg)",
    6: "rotate(2deg)",
  }[variant];

  return (
    <>
      {animated && (
        <style>{`
          @keyframes wl-antenna-${uid} {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(0.86); opacity: 0.78; }
          }
          @keyframes wl-text-dot-${uid} {
            0%, 70%, 100% { opacity: ${vivid ? 0.45 : 0.2}; transform: translateY(0); }
            35% { opacity: 1; transform: translateY(-1px); }
          }
          @keyframes wl-key-${uid} {
            0%, 100% { fill-opacity: ${vivid ? 0.72 : 0.55}; transform: translateY(0); }
            12%, 24% { fill-opacity: 1; transform: translateY(0.5px); }
          }
          @keyframes wl-cursor-${uid} {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0; }
          }
          @keyframes wl-call-wave-${uid} {
            0%, 100% { opacity: ${vivid ? 0.45 : 0.2}; }
            50% { opacity: 0.95; }
          }
          @keyframes wl-call-glow-${uid} {
            0%, 100% { opacity: ${vivid ? 0.08 : 0.04}; transform: scale(0.95); }
            50% { opacity: ${vivid ? 0.2 : 0.12}; transform: scale(1.05); }
          }
          @keyframes wl-wave-bar-${uid} {
            0%, 100% { transform: scaleY(0.55); opacity: ${vivid ? 0.65 : 0.45}; }
            50% { transform: scaleY(1); opacity: 0.95; }
          }
        `}</style>
      )}
      <svg
        width={size}
        height={size * layout.heightRatio}
        viewBox={layout.viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden={ariaHidden ?? true}
        style={{
          transform: transforms,
          transition: animated ? "transform 0.45s cubic-bezier(0.23, 1, 0.32, 1)" : undefined,
          overflow: "visible",
          filter: vivid ? undefined : "drop-shadow(0 3px 10px rgba(79, 30, 123, 0.12))",
        }}
      >
        <defs>
          <linearGradient id={`headGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.purple} stopOpacity={vivid ? 1 : 0.98} />
            <stop offset="55%" stopColor={COLORS.purpleLight} stopOpacity={vivid ? 0.98 : 0.9} />
            <stop offset="100%" stopColor={COLORS.purpleDeep} stopOpacity={vivid ? 0.96 : 0.88} />
          </linearGradient>
          <linearGradient id={`phoneGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={COLORS.emeraldSoft} />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        <HeadShell strokeWidth={strokeWidth} uid={uid} />
        <Eyes variant={variant} pose={pose} strokeWidth={strokeWidth} />
        <Antenna uid={uid} strokeWidth={strokeWidth} animated={animated} />

        {(pose === "phone" || pose === "on-call") && (
          <SidePhonePose
            uid={uid}
            strokeWidth={strokeWidth}
            phoneOffset={phoneOffset}
            phoneY={phoneY}
            phoneSide={phoneSide}
            pose={pose}
            animated={animated}
          />
        )}

        {pose === "texting" && (
          <TextingPose uid={uid} strokeWidth={strokeWidth} animated={animated} vivid={vivid} />
        )}

        {pose === "typing" && (
          <TypingPose uid={uid} strokeWidth={strokeWidth} animated={animated} />
        )}

        <Mouth variant={variant} pose={pose} strokeWidth={strokeWidth} />
      </svg>
    </>
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
