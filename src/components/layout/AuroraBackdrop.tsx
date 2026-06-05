/**
 * AuroraBackdrop — calm cream canvas behind authenticated pages.
 *
 * Solid warm paper with optional subtle grain — no purple/teal aurora washes
 * that competed with data UI. Dark mode keeps a restrained velvet base.
 */
import { BRAND } from "../../constants/brand-colors";
import { WL_SIGNAL_CLASSES } from "../../lib/wireline-signal-design";

export default function AuroraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden authenticated-canvas transition-colors duration-500"
    >
      {/* Light — rich editorial cream (matches auth portal) */}
      <div className="absolute inset-0 dark:hidden authenticated-canvas paper-texture" />

      {/* Dark — deep editorial base */}
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background: `linear-gradient(180deg, #2D1A3E 0%, ${BRAND.purpleInk} 100%)`,
        }}
      />

      {/* Paper grain — barely perceptible tactility */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 30%, rgba(26,22,20,0.014) 0.6px, transparent 0.8px),
            radial-gradient(circle at 70% 65%, rgba(26,22,20,0.010) 0.5px, transparent 0.7px)
          `,
          backgroundSize: "48px 48px, 64px 64px",
        }}
      />

      {/* Soft top highlight — depth without color cast */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background: `radial-gradient(120% 70% at 50% -8%, color-mix(in srgb, ${BRAND.cream} 35%, white) 0%, transparent 42%)`,
        }}
      />

      {/* Corner dormant nodes — ambient fleet field, never behind dense data */}
      <div aria-hidden className={WL_SIGNAL_CLASSES.canvasConstellation} />
    </div>
  );
}
