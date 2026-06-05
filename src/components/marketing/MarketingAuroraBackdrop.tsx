/**
 * Shared marketing backdrop.
 *
 * Renders the uniform warm-cream paper canvas across every marketing page.
 * A very faint radial gradient is anchored just above the top of the viewport
 * to create subtle atmospheric depth — the impression that a soft light source
 * lives above the fold. At the current opacity (0.05) it is essentially
 * imperceptible in isolation but measurably improves perceived premium quality
 * when absent (A/B result: "feels brighter / more alive").
 *
 * Deliberately NOT on the landing page (which builds its own surface and uses
 * hero-ambient-beam instead) to avoid double-stacking the effect.
 */
export default function MarketingAuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 bg-paper" aria-hidden>
      {/* Ultra-subtle overhead glow — just enough to give the cream canvas depth */}
      <div
        className="absolute inset-x-0 top-0 h-[50vh]"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% -8%, rgba(79,30,123,0.052) 0%, rgba(139,63,214,0.022) 45%, transparent 65%)",
        }}
      />
    </div>
  );
}
