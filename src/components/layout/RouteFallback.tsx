import { Compass } from "lucide-react";
import { Medallion } from "../ui/Medallion";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";

/**
 * RouteFallback — the lazy-route loading skeleton shown on every authenticated
 * navigation. Reads as a premium "page is materializing" moment rather than a
 * flat spinner:
 *
 *   • a brand progress sweep fires immediately on navigate,
 *   • the signature Medallion anchors an editorial header skeleton,
 *   • specular `.wl-panel` tiles cascade in with staggered shimmer so the grid
 *     feels like it's developing front-to-back, not blinking on at once.
 *
 * Decorative throughout (aria-hidden) with a polite live region for AT. The
 * `.skeleton-shimmer` sweep is disabled under prefers-reduced-motion in
 * index.css, leaving a calm static skeleton for motion-sensitive users.
 */
export default function RouteFallback() {
  return (
    <div
      className="h-full w-full flex flex-col"
      aria-live="polite"
      aria-busy="true"
      data-route-loading
    >
      <div className="shrink-0 h-px relative overflow-hidden mb-5" aria-hidden="true">
        <div className="route-progress-sweep-bar absolute inset-y-0 -left-1/3 w-1/3 rounded-full" />
      </div>

      <div className="shrink-0 flex items-center gap-3 mb-6" aria-hidden="true">
        <SignalOrbFrame size="sm" withBloom refined className="shrink-0">
          <Medallion size="sm" variant="instrument" withHalo={false} className="w-10 h-10">
            <Compass className="w-5 h-5 opacity-80" strokeWidth={1.75} />
          </Medallion>
        </SignalOrbFrame>
        <div className="space-y-2">
          <div className="h-2.5 w-32 rounded-full bg-brand/10 overflow-hidden relative">
            <div className="absolute inset-0 skeleton-shimmer" />
          </div>
          <div className="h-2 w-20 rounded-full bg-black/5 dark:bg-white/[0.06]" />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            data-index={i}
            className="route-fallback-tile wl-panel rounded-md h-32 overflow-hidden relative p-4 flex flex-col justify-between"
            aria-hidden="true"
          >
            {/* Travelling specular sweep, staggered per tile so the grid
                develops front-to-back rather than pulsing in unison. */}
            <div className="route-fallback-shimmer absolute inset-0 skeleton-shimmer opacity-50" />
            <div className="relative flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-brand/20 to-brand-deep/10" />
              <div className="space-y-1.5">
                <div className="h-2 w-20 rounded-full bg-black/8 dark:bg-white/[0.07]" />
                <div className="h-1.5 w-12 rounded-full bg-black/5 dark:bg-white/[0.05]" />
              </div>
            </div>
            <div className="relative space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/[0.05]" />
              <div className="h-1.5 w-3/4 rounded-full bg-black/5 dark:bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading page…</span>
    </div>
  );
}
