/**
 * HeroDecorations — six gutter robots (3 left, 3 right). Hero-only; no other
 * sections use sticker decorations.
 */
import { SectionStickers, type SectionStickerSlot } from "./SectionStickers";

interface HeroDecorationsProps {
  className?: string;
}

const MIN_TOP_REM = 7.5;

/** All slots use high opacity + phone/on-call/texting poses with strong props. */
export const HERO_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 1,
    pose: "on-call",
    size: 72,
    opacity: 0.92,
    side: "left",
    top: `max(${MIN_TOP_REM}rem, 16%)`,
    delayMs: 0,
    floatMs: 4600,
  },
  {
    variant: 5,
    pose: "phone",
    size: 64,
    opacity: 0.88,
    side: "left",
    top: "50%",
    delayMs: 140,
    floatMs: 5400,
  },
  {
    variant: 3,
    pose: "texting",
    size: 66,
    opacity: 0.9,
    side: "left",
    bottom: "10%",
    delayMs: 220,
    floatMs: 5100,
  },
  {
    variant: 2,
    pose: "phone",
    size: 70,
    opacity: 0.92,
    side: "right",
    top: `max(${MIN_TOP_REM}rem, 18%)`,
    delayMs: 70,
    floatMs: 4900,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 62,
    opacity: 0.88,
    side: "right",
    top: "50%",
    delayMs: 180,
    floatMs: 5700,
  },
  {
    variant: 4,
    pose: "phone",
    size: 68,
    opacity: 0.9,
    side: "right",
    bottom: "8%",
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
      vivid
    />
  );
}
