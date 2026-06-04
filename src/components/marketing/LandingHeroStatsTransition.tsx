import { SectionStickers } from "./SectionStickers";
import { HERO_STATS_TRANSITION_SLOTS, STATS_CORRIDOR } from "./landing-sticker-slots";

/** Side-gutter robots in the cream gap between hero and stats. */
export function LandingHeroStatsTransition() {
  return (
    <div
      className="landing-hero-stats-transition pointer-events-none relative hidden lg:block"
      aria-hidden="true"
      data-testid="hero-stats-transition-robots"
    >
      <SectionStickers
        slots={HERO_STATS_TRANSITION_SLOTS}
        layout="fill"
        corridorHalfRem={STATS_CORRIDOR}
      />
    </div>
  );
}
