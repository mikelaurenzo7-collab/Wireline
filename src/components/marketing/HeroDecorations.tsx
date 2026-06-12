/**
 * HeroDecorations — four gutter robots (2 left, 2 right). Hero uses vivid treatment.
 * Top pair sits in the hero's empty top strip (above the headline baseline);
 * mid pair hugs the screen edges below the fold line so neither column is covered.
 */
import { SectionStickers, type SectionStickerSlot } from "./SectionStickers";

interface HeroDecorationsProps {
  className?: string;
}

/** Keeps robots clear of the two-column hero content at wide viewports. */
const HERO_CORRIDOR_HALF = "46rem";

export const HERO_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 1,
    pose: "on-call",
    size: 84,
    opacity: 0.96,
    side: "left",
    top: "1.25rem",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 0,
    floatMs: 4600,
  },
  {
    variant: 3,
    pose: "typing",
    size: 62,
    opacity: 0.82,
    side: "left",
    top: "46%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 220,
    floatMs: 6200,
  },
  {
    variant: 2,
    pose: "phone",
    size: 80,
    opacity: 0.96,
    side: "right",
    top: "1.5rem",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 90,
    floatMs: 4900,
  },
  {
    variant: 4,
    pose: "texting",
    size: 60,
    opacity: 0.8,
    side: "right",
    top: "48%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 320,
    floatMs: 6800,
  },
];

export function HeroDecorations({ className = "" }: HeroDecorationsProps) {
  return (
    <SectionStickers
      slots={HERO_STICKER_SLOTS}
      className={className}
      testId="hero-robot-decorations"
      corridorHalfRem={HERO_CORRIDOR_HALF}
      vivid
    />
  );
}
