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
import React from "react";
import { cn } from "../../lib/utils";

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
  const chars = text.split("");

  return (
    <Tag
      className={cn(
        "inline-flex overflow-hidden glyph-morph",
        `glyph-morph--${mode}`,
        mode === "breathe" && "glyph-morph-breathe",
        className,
      )}
      data-stagger={`${stagger}ms`}
      data-duration={`${duration}ms`}
      aria-label={text}
    >
      {chars.map((char, i) => (
        <span
          key={`${mode}-${i}-${char}`}
          className={cn("inline-block glyph-morph-char", mode === "glitch" && "glyph-morph-glitch")}
          data-index={i}
          aria-hidden="true"
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </Tag>
  );
}
