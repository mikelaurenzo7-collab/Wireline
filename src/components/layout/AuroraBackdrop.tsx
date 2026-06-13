/**
 * AuthenticatedBackdrop — calm rich-cream canvas behind authenticated pages.
 *
 * Filename/export remain for compatibility with existing imports. The visual
 * intent is no longer aurora: use solid warm paper, subtle grain, and restrained
 * purple depth only where it helps hierarchy.
 */
export default function AuroraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden authenticated-canvas transition-colors duration-500"
    >
      {/* Light — rich editorial cream */}
      <div className="absolute inset-0 dark:hidden authenticated-canvas paper-texture" />

      {/* Dark — restrained velvet base */}
      <div className="absolute inset-0 hidden bg-velvet dark:block" />

      {/* Paper grain — barely perceptible tactility */}
      <div className="absolute inset-0 opacity-[0.28] dark:opacity-[0.10] paper-texture" />

      {/* Controlled top highlight — depth without color cast */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.30),transparent)] dark:bg-[linear-gradient(to_bottom,rgba(185,130,255,0.08),transparent)]" />
    </div>
  );
}
