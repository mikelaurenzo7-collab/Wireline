import type { SectionStickerSlot } from "./SectionStickers";

const AGENT_HALF = "20rem";
const WIDE_HALF = "40rem";

/** Hero slots live in HeroDecorations — section configs below. */

export const AGENT_DIRECTORY_STICKERS: SectionStickerSlot[] = [
  {
    variant: 1,
    pose: "on-call",
    size: 52,
    opacity: 0.44,
    side: "left",
    top: "12%",
    contentHalfRem: AGENT_HALF,
    delayMs: 0,
    floatMs: 4800,
  },
  {
    variant: 6,
    pose: "phone",
    size: 40,
    opacity: 0.3,
    side: "left",
    bottom: "8%",
    contentHalfRem: AGENT_HALF,
    delayMs: 180,
    floatMs: 5600,
  },
  {
    variant: 4,
    pose: "texting",
    size: 48,
    opacity: 0.36,
    side: "right",
    top: "38%",
    contentHalfRem: AGENT_HALF,
    delayMs: 90,
    floatMs: 5100,
  },
];

export const FINAL_CTA_STICKERS: SectionStickerSlot[] = [
  {
    variant: 3,
    pose: "texting",
    size: 50,
    opacity: 0.4,
    side: "left",
    top: "18%",
    contentHalfRem: "28rem",
    delayMs: 0,
    floatMs: 5400,
  },
  {
    variant: 2,
    pose: "on-call",
    size: 54,
    opacity: 0.42,
    side: "right",
    top: "24%",
    contentHalfRem: "28rem",
    delayMs: 120,
    floatMs: 4900,
  },
  {
    variant: 5,
    pose: "typing",
    size: 44,
    opacity: 0.28,
    side: "left",
    bottom: "12%",
    contentHalfRem: "28rem",
    delayMs: 200,
    floatMs: 5800,
  },
];

export const PROOF_SECTION_STICKERS: SectionStickerSlot[] = [
  {
    variant: 5,
    pose: "typing",
    size: 46,
    opacity: 0.34,
    side: "left",
    top: "50%",
    contentHalfRem: WIDE_HALF,
    delayMs: 0,
    floatMs: 5000,
  },
  {
    variant: 6,
    pose: "on-call",
    size: 48,
    opacity: 0.38,
    side: "right",
    top: "50%",
    contentHalfRem: WIDE_HALF,
    delayMs: 100,
    floatMs: 5300,
  },
];

export const FAQ_SECTION_STICKERS: SectionStickerSlot[] = [
  {
    variant: 4,
    pose: "typing",
    size: 42,
    opacity: 0.3,
    side: "left",
    top: "16%",
    narrow: true,
    delayMs: 0,
    floatMs: 5500,
  },
  {
    variant: 1,
    pose: "phone",
    size: 40,
    opacity: 0.28,
    side: "right",
    bottom: "14%",
    narrow: true,
    delayMs: 80,
    floatMs: 4700,
  },
  {
    variant: 3,
    pose: "texting",
    size: 38,
    opacity: 0.24,
    side: "left",
    bottom: "10%",
    narrow: true,
    delayMs: 160,
    floatMs: 5200,
  },
];
