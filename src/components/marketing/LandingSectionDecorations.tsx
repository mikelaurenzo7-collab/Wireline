import { SectionStickers } from "./SectionStickers";
import {
  FAQ_CORRIDOR,
  FAQ_STICKER_SLOTS,
  INTEGRATIONS_CORRIDOR,
  INTEGRATIONS_STICKER_SLOTS,
} from "./landing-sticker-slots";

type LandingSectionDecorationsProps = {
  section: "integrations" | "faq";
};

const SLOT_MAP = {
  integrations: INTEGRATIONS_STICKER_SLOTS,
  faq: FAQ_STICKER_SLOTS,
} as const;

const CORRIDOR_MAP = {
  integrations: INTEGRATIONS_CORRIDOR,
  faq: FAQ_CORRIDOR,
} as const;

const TEST_ID_MAP = {
  integrations: "integrations-robot-decorations",
  faq: "faq-robot-decorations",
} as const;

/** Ghost-tier gutter robots for tall landing sections (integrations, FAQ). */
export function LandingSectionDecorations({ section }: LandingSectionDecorationsProps) {
  return (
    <SectionStickers
      slots={SLOT_MAP[section]}
      testId={TEST_ID_MAP[section]}
      corridorHalfRem={CORRIDOR_MAP[section]}
    />
  );
}
