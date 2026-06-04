import { SectionStickers } from "./SectionStickers";
import {
  FAQ_STICKER_SLOTS,
  INTEGRATIONS_STICKER_SLOTS,
  PROOF_STICKER_SLOTS,
} from "./landing-sticker-slots";

type LandingSectionDecorationsProps = {
  section: "proof" | "integrations" | "faq";
};

const SLOT_MAP = {
  proof: PROOF_STICKER_SLOTS,
  integrations: INTEGRATIONS_STICKER_SLOTS,
  faq: FAQ_STICKER_SLOTS,
} as const;

const TEST_ID_MAP = {
  proof: "proof-robot-decorations",
  integrations: "integrations-robot-decorations",
  faq: "faq-robot-decorations",
} as const;

/** Ghost-tier gutter robots for landing sections below the hero. */
export function LandingSectionDecorations({ section }: LandingSectionDecorationsProps) {
  return <SectionStickers slots={SLOT_MAP[section]} testId={TEST_ID_MAP[section]} />;
}
