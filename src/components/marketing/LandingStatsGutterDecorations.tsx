import { SectionStickers } from "./SectionStickers";
import {
  STATS_BOTTOM_GUTTER_SLOTS,
  STATS_CORRIDOR,
  STATS_TOP_GUTTER_SLOTS,
} from "./landing-sticker-slots";

/**
 * Stats band robots — confined to section padding above/below the stat card
 * so they never overlap the 24/7 · <10m · 0 grid on laptop or desktop.
 */
export function LandingStatsGutterDecorations() {
  return (
    <>
      <div
        className="landing-stats-gutter landing-stats-gutter--top pointer-events-none absolute inset-x-0 top-0 z-[1] hidden lg:block"
        aria-hidden="true"
      >
        <SectionStickers
          slots={STATS_TOP_GUTTER_SLOTS}
          layout="fill"
          corridorHalfRem={STATS_CORRIDOR}
          testId="proof-robot-decorations-top"
        />
      </div>
      <div
        className="landing-stats-gutter landing-stats-gutter--bottom pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden lg:block"
        aria-hidden="true"
      >
        <SectionStickers
          slots={STATS_BOTTOM_GUTTER_SLOTS}
          layout="fill"
          corridorHalfRem={STATS_CORRIDOR}
          testId="proof-robot-decorations-bottom"
        />
      </div>
    </>
  );
}
