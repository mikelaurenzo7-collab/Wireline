/**
 * Shared marketing backdrop — Rich Cream + Controlled Purple canvas.
 *
 * The public site uses warm cream paper with small, contained light-purple
 * highlights. Avoid aurora/multicolor gradients, drifting orbs, and full-page
 * purple bleed.
 */
export default function MarketingControlledBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-paper paper-texture" aria-hidden>
      <span className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(155,92,224,0.10),transparent_68%)] blur-2xl" />
      <span className="absolute left-[-10rem] top-[18rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(185,130,255,0.06),transparent_70%)] blur-2xl" />
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/20 to-transparent" />
    </div>
  );
}
