/**
 * AuroraBackdrop — calm cream canvas behind authenticated pages.
 *
 * Solid warm paper with optional subtle grain — no purple/teal aurora washes
 * that competed with data UI. Dark mode keeps a restrained velvet base.
 */
export default function AuroraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden authenticated-canvas transition-colors duration-500"
    >
      {/* Light — rich editorial cream (matches auth portal) */}
      <div className="absolute inset-0 dark:hidden authenticated-canvas paper-texture" />

      {/* Dark — deep editorial base */}
      <div className="absolute inset-0 hidden dark:block wl-aurora-dark-base" />

      {/* Paper grain — barely perceptible tactility */}
      <div className="absolute inset-0 opacity-[0.35] dark:opacity-[0.12] wl-aurora-grain" />

      {/* Soft top highlight — depth without color cast */}
      <div className="absolute inset-0 dark:hidden wl-aurora-top-highlight" />
    </div>
  );
}
