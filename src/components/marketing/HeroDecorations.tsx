/**
 * HeroDecorations — Six RobotHead mascots flanking the hero (top / middle / bottom
 * on each side). Sized and nudged inward/up so they frame the headline without
 * crowding the fixed header or CTAs.
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
  style: React.CSSProperties;
};

/** Left column mirrors right — percentages keep placement stable across hero heights. */
const SLOTS: DecorSlot[] = [
  {
    Component: RobotHeadTopLeft,
    size: 74,
    opacity: 0.58,
    delayMs: 0,
    style: { top: "11%", left: "11%" },
  },
  {
    Component: RobotHeadMiddleLeft,
    size: 58,
    opacity: 0.34,
    delayMs: 120,
    style: { top: "50%", left: "13%", transform: "translateY(-50%)" },
  },
  {
    Component: RobotHeadBottomLeft,
    size: 68,
    opacity: 0.46,
    delayMs: 200,
    style: { bottom: "17%", left: "12%" },
  },
  {
    Component: RobotHeadTopRight,
    size: 68,
    opacity: 0.52,
    delayMs: 60,
    style: { top: "13%", right: "11%" },
  },
  {
    Component: RobotHeadMiddleRight,
    size: 56,
    opacity: 0.32,
    delayMs: 160,
    style: { top: "50%", right: "13%", transform: "translateY(-50%)" },
  },
  {
    Component: RobotHeadBottomRight,
    size: 76,
    opacity: 0.5,
    delayMs: 240,
    style: { bottom: "15%", right: "11%" },
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
        className={`pointer-events-none absolute inset-0 z-10 hidden lg:block ${className}`}
        aria-hidden="true"
        data-testid="hero-robot-decorations"
      >
        {SLOTS.map(({ Component, size, opacity, delayMs, style }, index) => (
          <div
            key={index}
            className="absolute hover:opacity-90 transition-opacity duration-500"
            style={{
              ...style,
              ["--decor-opacity" as string]: opacity,
              opacity: 0,
              animation: `hero-decor-fade 900ms cubic-bezier(0.23, 1, 0.32, 1) ${delayMs}ms forwards`,
            }}
          >
            <Component size={size} animated />
          </div>
        ))}
      </div>
    </>
  );
}
