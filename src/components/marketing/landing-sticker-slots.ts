/**
 * Gutter robot placements for landing page sections below the hero.
 * Hero slots live in HeroDecorations.tsx (vivid treatment).
 */
import type { SectionStickerSlot } from "./SectionStickers";

/** max-w-7xl content corridor (80rem → 40rem half). */
const PROOF_HALF = "40rem";

/** max-w-5xl content corridor (64rem → 32rem half). */
const INTEGRATIONS_HALF = "32rem";

export const PROOF_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 3,
    pose: "texting",
    size: 58,
    opacity: 0.62,
    side: "left",
    top: "18%",
    contentHalfRem: PROOF_HALF,
    delayMs: 80,
    floatMs: 5400,
  },
  {
    variant: 1,
    pose: "phone",
    size: 52,
    opacity: 0.56,
    side: "left",
    bottom: "14%",
    contentHalfRem: PROOF_HALF,
    delayMs: 200,
    floatMs: 5800,
  },
  {
    variant: 5,
    pose: "on-call",
    size: 56,
    opacity: 0.6,
    side: "right",
    top: "20%",
    contentHalfRem: PROOF_HALF,
    delayMs: 120,
    floatMs: 5100,
  },
  {
    variant: 2,
    pose: "typing",
    size: 50,
    opacity: 0.54,
    side: "right",
    bottom: "12%",
    contentHalfRem: PROOF_HALF,
    delayMs: 240,
    floatMs: 5600,
  },
];

export const INTEGRATIONS_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 4,
    pose: "phone",
    size: 50,
    opacity: 0.58,
    side: "left",
    top: "22%",
    contentHalfRem: INTEGRATIONS_HALF,
    delayMs: 60,
    floatMs: 5200,
  },
  {
    variant: 6,
    pose: "texting",
    size: 46,
    opacity: 0.52,
    side: "left",
    bottom: "16%",
    contentHalfRem: INTEGRATIONS_HALF,
    delayMs: 180,
    floatMs: 5900,
  },
  {
    variant: 2,
    pose: "on-call",
    size: 52,
    opacity: 0.56,
    side: "right",
    top: "28%",
    contentHalfRem: INTEGRATIONS_HALF,
    delayMs: 100,
    floatMs: 5300,
  },
  {
    variant: 3,
    pose: "phone",
    size: 48,
    opacity: 0.5,
    side: "right",
    bottom: "18%",
    contentHalfRem: INTEGRATIONS_HALF,
    delayMs: 220,
    floatMs: 5700,
  },
];

export const FAQ_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 5,
    pose: "typing",
    size: 46,
    opacity: 0.5,
    side: "left",
    top: "10%",
    narrow: true,
    delayMs: 40,
    floatMs: 5500,
  },
  {
    variant: 1,
    pose: "phone",
    size: 44,
    opacity: 0.46,
    side: "left",
    bottom: "6%",
    narrow: true,
    delayMs: 160,
    floatMs: 6000,
  },
  {
    variant: 4,
    pose: "texting",
    size: 48,
    opacity: 0.52,
    side: "right",
    top: "14%",
    narrow: true,
    delayMs: 90,
    floatMs: 5200,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 42,
    opacity: 0.44,
    side: "right",
    bottom: "8%",
    narrow: true,
    delayMs: 210,
    floatMs: 5800,
  },
];
