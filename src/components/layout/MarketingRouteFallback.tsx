/**
 * Branded loading shell for public marketing routes.
 *
 * Replaces the flat `bg-card` Suspense placeholder used while lazy
 * marketing pages stream in. Reuses the gem Medallion + halo so the
 * first impression a prospect gets matches the rest of the marketing
 * surface (warm canvas + mono mark, crystalline glint) instead of a blank panel.
 *
 * The component intentionally renders WITHOUT the full MarketingChrome
 * (header/footer) — those modules are themselves async-loaded, so
 * pulling them into the fallback would defeat the streaming win we get
 * from React.lazy. Instead it paints a centered, reduced-motion-safe
 * medallion on the marketing surface.
 */

import { Compass } from "lucide-react";

import { Medallion } from "../ui/Medallion";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";

export default function MarketingRouteFallback() {
  return (
    <div
      className="marketing-surface min-h-dvh bg-card text-foreground flex items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <SignalOrbFrame size="md" withBloom refined={false}>
          <Medallion size="lg" variant="signature" withHalo={false}>
            <Compass className="w-6 h-6" strokeWidth={1.75} />
          </Medallion>
        </SignalOrbFrame>

        <span className="text-sm font-medium tracking-wide text-muted/90">One moment…</span>
      </div>
    </div>
  );
}
