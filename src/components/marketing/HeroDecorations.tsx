/**
 * HeroDecorations — Scatters the robot mascot family around the hero: three
 * RobotHeads in the upper/left corners plus the phone-holding RobotWithPhone
 * anchoring the bottom-right (the "talk to the team" gag, made visual).
 * Positioned absolutely, above the trust bar, below the main headline.
 * Responsive sizing + subtle entrance animation.
 */
import React from "react";
import {
  RobotHeadTopLeft,
  RobotHeadTopRight,
  RobotHeadBottomLeft,
  RobotWithPhone,
} from "./RobotHead";

interface HeroDecorationsProps {
  className?: string;
}

export function HeroDecorations({ className = "" }: HeroDecorationsProps) {
  return (
    <>
      <style>{`
        @keyframes hero-decor-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className={`pointer-events-none absolute inset-0 z-10 hidden lg:block ${className}`}
        aria-hidden="true"
        data-testid="hero-robot-decorations"
        style={{
          animation: "hero-decor-fade 800ms cubic-bezier(0.23, 1, 0.32, 1) both",
        }}
      >
        {/* Top Left */}
        <div className="absolute left-8 top-8 opacity-60 hover:opacity-90 transition-all duration-500">
          <RobotHeadTopLeft size={72} animated />
        </div>

        {/* Top Right */}
        <div className="absolute right-8 top-12 opacity-50 hover:opacity-85 transition-all duration-500 delay-75">
          <RobotHeadTopRight size={64} animated />
        </div>

        {/* Bottom Left — slightly lower, playful */}
        <div className="absolute bottom-20 left-12 opacity-45 hover:opacity-80 transition-all duration-500 delay-150">
          <RobotHeadBottomLeft size={58} animated />
        </div>

        {/* Bottom Right — the phone-holding mascot anchors the composition */}
        <div className="absolute bottom-12 right-8 opacity-60 hover:opacity-95 transition-all duration-500 delay-100">
          <RobotWithPhone size={184} animated />
        </div>
      </div>
    </>
  );
}
