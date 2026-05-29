/**
 * Shared marketing backdrop.
 *
 * Previously rendered two soft radial "aurora" blobs (a purple one anchored
 * off the top-left edge, a terracotta one bottom-right). On the warm cream
 * paper those blobs read as an accidental purple/cream smudge in the corner
 * rather than an intentional accent — and the landing page, which builds its
 * own surface, never had them, so the public site looked inconsistent
 * page-to-page. The brand's aurora gradients were flattened to solid brand
 * ink pre-launch (see `.text-aurora` in index.css); this backdrop now matches
 * that decision with a clean, uniform paper canvas across every marketing
 * page.
 */
export default function MarketingAuroraBackdrop() {
  return <div className="pointer-events-none fixed inset-0 z-0 bg-paper" aria-hidden />;
}
