/**
 * Branded loading shell for public marketing routes.
 *
 * Replaces the flat `bg-paper` Suspense placeholder used while lazy
 * marketing pages stream in. Reuses the gem Medallion + halo so the
 * first impression a prospect gets matches the rest of the marketing
 * surface (aurora cream, crystalline glint) instead of a blank panel.
 *
 * The component intentionally renders WITHOUT the full MarketingChrome
 * (header/footer) — those modules are themselves async-loaded, so
 * pulling them into the fallback would defeat the streaming win we get
 * from React.lazy. Instead it paints a centered, reduced-motion-safe
 * medallion on the marketing surface.
 */

import { Compass } from "lucide-react";

import { Medallion } from "../ui/Medallion";

export default function MarketingRouteFallback() {
  return (
    <div
      className="marketing-surface min-h-dvh bg-paper text-ink flex items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 rounded-full bg-brand/25 blur-2xl scale-[1.8] animate-pulse"
          />
          <span
            aria-hidden="true"
            className="absolute -inset-3 rounded-full border border-brand/20 animate-[spin_8s_linear_infinite]"
          />
          <Medallion size="lg" withHalo={false} shimmer>
            <Compass className="w-6 h-6 animate-pulse" />
          </Medallion>
        </div>

        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted animate-pulse">
          Loading…
        </span>
      </div>
    </div>
  );
}
