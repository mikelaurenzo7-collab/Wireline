/**
 * Shared marketing backdrop — the Aurora Cream "majestic" canvas.
 *
 * Renders the warm cream paper plus three large, slowly-drifting brand-violet
 * aurora orbs (top-left, top-right, lower-center). They sit far behind content
 * (`z-0`, `pointer-events-none`) and stay deliberately soft so the cream still
 * dominates — the orbs read as intentional ambient light across every
 * marketing page rather than a corner smudge. All motion is CSS keyframes in
 * `wireline-design-system.css` (`.wl-aurora-*`), CSP-safe, and collapses to a
 * calm static field under `prefers-reduced-motion`.
 *
 * Consumed by both shared shells (`MarketingChrome`, `MarketingPageFrame`), so
 * one field unifies the entire public site. The landing page composes its own
 * hero field on top of the switchboard.
 */
export default function MarketingAuroraBackdrop() {
  return (
    <div className="wl-aurora-field pointer-events-none fixed inset-0 z-0 bg-paper" aria-hidden>
      <span className="wl-aurora-orb" />
      <span className="wl-aurora-orb" />
      <span className="wl-aurora-orb" />
    </div>
  );
}
