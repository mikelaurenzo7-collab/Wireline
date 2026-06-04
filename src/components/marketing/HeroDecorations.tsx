/**
 * HeroDecorations — six gutter robots (3 left, 3 right). Hero uses vivid treatment;
 * lower sections use LandingSectionDecorations (ghost tier).
 *
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
    size: 68,
    opacity: 0.92,
    side: "left",
    top: `max(${MIN_TOP_REM}rem, 14%)`,
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 0,
    floatMs: 4600,
  },
  {
    variant: 5,
    pose: "phone",
    size: 60,
    opacity: 0.88,
    side: "left",
    top: "28%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 140,
    floatMs: 5400,
  },
  {
    variant: 3,
    pose: "texting",
    size: 62,
    opacity: 0.9,
    side: "left",
    bottom: "16%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 220,
    floatMs: 5100,
  },
  {
    variant: 2,
    pose: "phone",
    size: 66,
    opacity: 0.92,
    side: "right",
    top: `max(${MIN_TOP_REM}rem, 15%)`,
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 70,
    floatMs: 4900,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 58,
    opacity: 0.88,
    side: "right",
    top: "30%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 180,
    floatMs: 5700,
  },
  {
    variant: 4,
    pose: "phone",
    size: 64,
    opacity: 0.9,
    side: "right",
    bottom: "14%",
    contentHalfRem: HERO_CORRIDOR_HALF,
    delayMs: 260,
    floatMs: 5200,
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
