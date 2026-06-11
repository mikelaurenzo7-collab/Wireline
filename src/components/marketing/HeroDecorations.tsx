/**
 * HeroDecorations — four top gutter robots (2 left, 2 right). Hero uses vivid treatment.
 * Vertical slots avoid the live-demo block (roughly 38–72% of hero height on desktop).
 */
import { SectionStickers, type SectionStickerSlot } from "./SectionStickers";

interface HeroDecorationsProps {
  className?: string;
}

const MIN_TOP_REM = 8;
/** max-w-2xl demo + headline buffer on desktop. */
const HERO_CORRIDOR_HALF = "31rem";

export const HERO_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 1,
    pose: "on-call",
    size: 92,
    opacity: 0.96,
    side: "left",
    top: `max(${MIN_TOP_REM}rem, 12%)`,
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 0,
    floatMs: 4600,
  },
  {
    variant: 5,
    pose: "phone",
    size: 76,
    opacity: 0.9,
    side: "left",
    top: "30%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 140,
    floatMs: 5600,
  },
  {
    variant: 3,
    pose: "typing",
    size: 64,
    opacity: 0.82,
    side: "left",
    top: "52%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 260,
    floatMs: 6200,
  },
  {
    variant: 2,
    pose: "phone",
    size: 88,
    opacity: 0.96,
    side: "right",
    top: `max(${MIN_TOP_REM}rem, 13%)`,
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 70,
    floatMs: 4900,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 72,
    opacity: 0.9,
    side: "right",
    top: "31%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 180,
    floatMs: 5200,
  },
  {
    variant: 4,
    pose: "texting",
    size: 62,
    opacity: 0.8,
    side: "right",
    top: "54%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 310,
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
