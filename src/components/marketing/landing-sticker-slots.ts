/**
 * Gutter robot placements for landing page sections below the hero.
 * Hero slots live in HeroDecorations.tsx (vivid treatment).
 *
 * Placement rules:
 * - Stats band: robots live ONLY in top/bottom padding gutters (never over the card).
 * - Tall sections: robots in header/footer margin zones only (top ≤14%, bottom ≤12%).
 * - Horizontal position uses corridor mask + pose-aware gutter insets.
 */
import type { SectionStickerSlot } from "./SectionStickers";

/** max-w-7xl stats card (80rem → 40rem half) + buffer. */
const STATS_CORRIDOR_HALF = "41rem";

/** max-w-5xl integrations block (64rem → 32rem half) + buffer. */
const INTEGRATIONS_CORRIDOR_HALF = "33rem";

/** max-w-3xl FAQ column (48rem → 24rem half) + buffer. */
const FAQ_CORRIDOR_HALF = "25rem";

/** Stats row — padding gutter only (paired with LandingStatsGutterDecorations). */
export const STATS_TOP_GUTTER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 3,
    pose: "texting",
    size: 40,
    opacity: 0.58,
    side: "left",
    bottom: "0.25rem",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 80,
    floatMs: 5400,
  },
  {
    variant: 5,
    pose: "on-call",
    size: 38,
    opacity: 0.54,
    side: "right",
    bottom: "0.25rem",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 140,
    floatMs: 5100,
  },
];

export const STATS_BOTTOM_GUTTER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 1,
    pose: "phone",
    size: 40,
    opacity: 0.56,
    side: "left",
    top: "0.25rem",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 120,
    floatMs: 5800,
  },
  {
    variant: 2,
    pose: "typing",
    size: 38,
    opacity: 0.52,
    side: "right",
    top: "0.25rem",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 200,
    floatMs: 5600,
  },
];

/** Cream margin between hero and stats — side gutters only. */
export const HERO_STATS_TRANSITION_SLOTS: SectionStickerSlot[] = [
  {
    variant: 4,
    pose: "phone",
    size: 44,
    opacity: 0.5,
    side: "left",
    top: "50%",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 60,
    floatMs: 5200,
  },
  {
    variant: 6,
    pose: "texting",
    size: 42,
    opacity: 0.48,
    side: "right",
    top: "50%",
    contentHalfRem: STATS_CORRIDOR_HALF,
    delayMs: 160,
    floatMs: 5700,
  },
];

export const STATS_CORRIDOR = STATS_CORRIDOR_HALF;
export const INTEGRATIONS_CORRIDOR = INTEGRATIONS_CORRIDOR_HALF;
export const FAQ_CORRIDOR = FAQ_CORRIDOR_HALF;

/** Header/footer margin zones — clear of logo grid and FAQ accordion. */
export const INTEGRATIONS_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 4,
    pose: "phone",
    size: 46,
    opacity: 0.56,
    side: "left",
    top: "9%",
    contentHalfRem: INTEGRATIONS_CORRIDOR_HALF,
    delayMs: 40,
    floatMs: 5200,
  },
  {
    variant: 6,
    pose: "texting",
    size: 42,
    opacity: 0.5,
    side: "right",
    top: "11%",
    contentHalfRem: INTEGRATIONS_CORRIDOR_HALF,
    delayMs: 100,
    floatMs: 5900,
  },
  {
    variant: 2,
    pose: "on-call",
    size: 44,
    opacity: 0.52,
    side: "left",
    bottom: "9%",
    contentHalfRem: INTEGRATIONS_CORRIDOR_HALF,
    delayMs: 180,
    floatMs: 5300,
  },
  {
    variant: 3,
    pose: "phone",
    size: 42,
    opacity: 0.48,
    side: "right",
    bottom: "11%",
    contentHalfRem: INTEGRATIONS_CORRIDOR_HALF,
    delayMs: 220,
    floatMs: 5700,
  },
];

export const FAQ_STICKER_SLOTS: SectionStickerSlot[] = [
  {
    variant: 5,
    pose: "typing",
    size: 42,
    opacity: 0.5,
    side: "left",
    top: "7%",
    narrow: true,
    delayMs: 40,
    floatMs: 5500,
  },
  {
    variant: 1,
    pose: "phone",
    size: 40,
    opacity: 0.46,
    side: "right",
    top: "9%",
    narrow: true,
    delayMs: 120,
    floatMs: 6000,
  },
  {
    variant: 4,
    pose: "texting",
    size: 42,
    opacity: 0.5,
    side: "left",
    bottom: "7%",
    narrow: true,
    delayMs: 200,
    floatMs: 5200,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 38,
    opacity: 0.44,
    side: "right",
    bottom: "9%",
    narrow: true,
    delayMs: 260,
    floatMs: 5800,
  },
];
