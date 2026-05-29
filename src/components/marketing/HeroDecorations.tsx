/**
 * HeroDecorations — Places four RobotHead mascots in the corners of the hero.
 * Positioned absolutely, above the trust bar, below the main headline.
 * Responsive sizing + subtle entrance animation.
 */
import React from "react";
import {
  RobotHeadTopLeft,
  RobotHeadTopRight,
  RobotHeadBottomLeft,
  RobotHeadBottomRight,
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
      {/* Top Left — clear fixed header logo */}
      <div className="absolute left-10 top-20 opacity-55 hover:opacity-90 transition-all duration-500">
        <RobotHeadTopLeft size={66} animated />
      </div>

      {/* Top Right — clear fixed header "Start trial" button */}
      <div className="absolute right-10 top-24 opacity-45 hover:opacity-85 transition-all duration-500 delay-75">
        <RobotHeadTopRight size={58} animated />
      </div>

      {/* Bottom Left — breathing room from content */}
      <div className="absolute bottom-24 left-14 opacity-40 hover:opacity-80 transition-all duration-500 delay-150">
        <RobotHeadBottomLeft size={52} animated />
      </div>

      {/* Bottom Right — balanced anchor */}
      <div className="absolute bottom-20 right-12 opacity-50 hover:opacity-90 transition-all duration-500 delay-100">
        <RobotHeadBottomRight size={70} animated />
      </div>
      </div>
    </>
  );
}
