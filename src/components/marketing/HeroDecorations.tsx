/**
 * HeroDecorations — Six RobotHead mascots in the left/right gutters only.
 *
 * Horizontal positions are computed from the centered max-w-4xl (56rem) copy
 * column so robots never sit under headline, CTAs, or trust badges. Vertical
 * bands are top / middle / bottom of the hero with header clearance on the
 * top row. Shown from xl (1280px+) where side gutters are wide enough.
 */
import React from "react";
import {
  RobotHeadTopLeft,
  RobotHeadTopRight,
  RobotHeadMiddleLeft,
  RobotHeadMiddleRight,
  RobotHeadBottomLeft,
  RobotHeadBottomRight,
} from "./RobotHead";

interface HeroDecorationsProps {
  className?: string;
}

type DecorSlot = {
  Component: React.ComponentType<{ size?: number; animated?: boolean }>;
  size: number;
  opacity: number;
  delayMs: number;
  side: "left" | "right";
  /** Vertical anchor within the hero (percent of section height). */
  top?: string;
  bottom?: string;
};

/** Gap between robot edge and the headline/CTA column (px). */
const CONTENT_GAP_PX = 28;

/** min distance from viewport top — clears fixed h-16 header + hero pt-28. */
const MIN_TOP_REM = 7.5;

/**
 * Place the robot fully outside the centered 56rem content corridor.
 * 50% − half content width − robot width − breathing room.
 */
function gutterInset(side: "left" | "right", sizePx: number): React.CSSProperties {
  const offset = `max(1.25rem, calc(50% - min(28rem, 50% - 1.5rem) - ${sizePx + CONTENT_GAP_PX}px))`;
  return side === "left" ? { left: offset } : { right: offset };
}

const SLOTS: DecorSlot[] = [
  {
    Component: RobotHeadTopLeft,
    size: 64,
    opacity: 0.55,
    delayMs: 0,
    side: "left",
    top: `max(${MIN_TOP_REM}rem, 17%)`,
  },
  {
    Component: RobotHeadMiddleLeft,
    size: 52,
    opacity: 0.32,
    delayMs: 120,
    side: "left",
    top: "50%",
  },
  {
    Component: RobotHeadBottomLeft,
    size: 58,
    opacity: 0.42,
    delayMs: 200,
    side: "left",
    bottom: "11%",
  },
  {
    Component: RobotHeadTopRight,
    size: 62,
    opacity: 0.5,
    delayMs: 60,
    side: "right",
    top: `max(${MIN_TOP_REM}rem, 19%)`,
  },
  {
    Component: RobotHeadMiddleRight,
    size: 50,
    opacity: 0.3,
    delayMs: 160,
    side: "right",
    top: "50%",
  },
  {
    Component: RobotHeadBottomRight,
    size: 66,
    opacity: 0.48,
    delayMs: 240,
    side: "right",
    bottom: "9%",
  },
];

export function HeroDecorations({ className = "" }: HeroDecorationsProps) {
  return (
    <>
      <style>{`
        @keyframes hero-decor-fade {
          from { opacity: 0; }
          to { opacity: var(--decor-opacity, 0.5); }
        }
      `}</style>
      <div
        className={`pointer-events-none absolute inset-0 z-[1] hidden xl:block ${className}`}
        aria-hidden="true"
        data-testid="hero-robot-decorations"
      >
        {SLOTS.map(({ Component, size, opacity, delayMs, side, top, bottom }, index) => {
          const isCenter = top === "50%";
          const isBottom = bottom != null;
          return (
            <div
              key={index}
              className={`absolute hover:opacity-90 transition-opacity duration-500${isCenter ? " -translate-y-1/2" : ""}`}
              style={{
                ...gutterInset(side, size),
                ...(top != null ? { top } : {}),
                ...(isBottom ? { bottom, top: "auto" } : {}),
                ["--decor-opacity" as string]: opacity,
                opacity: 0,
                animation: `hero-decor-fade 900ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms forwards`,
              }}
            >
              <Component size={size} animated />
            </div>
          );
        })}
      </div>
    </>
  );
}
