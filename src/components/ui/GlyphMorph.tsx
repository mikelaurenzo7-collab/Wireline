/**
 * GlyphMorph — Kinetic typographic identity primitive.
 *
 * Renders the Wireline brand text with per-character staggered animations
 * that create a mesmerizing "materializing" effect. Each glyph fades in,
 * shifts vertically, and gains opacity with unique timing — giving the
 * wordmark a sense of intelligence and intentionality.
 *
 * Modes:
 *   "reveal"  — Characters cascade in from below (entry animation)
 *   "breathe" — Continuous subtle wave across characters (ambient)
 *   "glitch"  — Occasional micro-displacement for edgy tech feel
 *
 * Reduced-motion safe — renders static text immediately.
 *
 * Usage:
 *   <GlyphMorph text="Wireline" mode="reveal" />
 *   <GlyphMorph text="LIVE" mode="breathe" className="text-brand" />
 */
import React, { useId } from "react";
import { cn } from "../../lib/utils";
import { asStyle } from "@/src/lib/css-style";

type MorphMode = "reveal" | "breathe" | "glitch";

interface GlyphMorphProps {
  /** Text to render with per-character animation. */
  text: string;
  /** Animation mode. Default "reveal". */
  mode?: MorphMode;
  /** Stagger delay between characters in ms. Default 60. */
  stagger?: number;
  /** Total animation duration per character in ms. Default 600. */
  duration?: number;
  className?: string;
  /** Element tag to render. Default "span". */
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
}

/**
 * GlyphMorph — kinetic typographic identity animation.
 */
export function GlyphMorph({
  text,
  mode = "reveal",
  stagger = 60,
  duration = 600,
  className,
  as: Tag = "span",
}: GlyphMorphProps) {
  const uid = useId().replace(/:/g, "");

  const chars = text.split("");

  return (
    <Tag
      className={cn(
        "inline-flex overflow-hidden",
        mode === "breathe" && "glyph-morph-breathe",
        className,
      )}
      aria-label={text}
    >
      {chars.map((char, i) => (
        <span
          key={`${uid}-${i}`}
          className={cn("inline-block glyph-morph-char", mode === "glitch" && "glyph-morph-glitch")}
          style={asStyle({
            animationName:
              mode === "reveal"
                ? `glyph-reveal-${uid}`
                : mode === "breathe"
                  ? `glyph-breathe-${uid}`
                  : `glyph-glitch-${uid}`,
            animationDuration: `${duration}ms`,
            animationDelay: `${i * stagger}ms`,
            animationFillMode: "both",
            animationTimingFunction:
              mode === "glitch" ? "steps(2, jump-none)" : "cubic-bezier(0.22, 1, 0.36, 1)",
            animationIterationCount: mode === "reveal" ? 1 : "infinite",
          })}
          aria-hidden="true"
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}

      <style>{`
        @keyframes glyph-reveal-${uid} {
          0% {
            opacity: 0;
            transform: translateY(40%) rotateX(-45deg) scale(0.85);
            filter: blur(4px);
          }
          60% {
            opacity: 1;
            filter: blur(0px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) rotateX(0deg) scale(1);
            filter: blur(0px);
          }
        }
        @keyframes glyph-breathe-${uid} {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.85;
          }
          50% {
            transform: translateY(-6%);
            opacity: 1;
          }
        }
        @keyframes glyph-glitch-${uid} {
          0%, 90%, 100% {
            transform: translate(0, 0) skewX(0deg);
            opacity: 1;
          }
          92% {
            transform: translate(-2px, 1px) skewX(-2deg);
            opacity: 0.8;
          }
          94% {
            transform: translate(2px, -1px) skewX(1deg);
            opacity: 0.9;
          }
          96% {
            transform: translate(-1px, 0) skewX(0deg);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .glyph-morph-char {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `}</style>
    </Tag>
  );
}
