/**
 * AuroraBackdrop — the living ambient field behind every authenticated page.
 *
 * Composed in strict back-to-front order:
 *   1. base editorial gradient (warm cream / deep aubergine in dark)
 *   2. three slow-drifting aurora orbs (brand purple + signal teal) that
 *      breathe on offset durations so the motion never reads as synchronized
 *   3. a wide aurora sheen that pans laterally across the whole field
 *   4. structural grid lines for alignment + a soft top-down specular vignette
 *
 * Everything is purely decorative (the container is pointer-events-none and the
 * whole subtree is aria-hidden), GPU-composited via transform/opacity only, and
 * fully reduced-motion safe — the `.animate-aurora-*` keyframes are disabled
 * under `prefers-reduced-motion: reduce` in index.css, leaving a calm static
 * gradient for visitors who opt out of motion.
 */
export default function AuroraBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-paper transition-colors duration-500"
    >
      {/* ── 1 · Base editorial gradient ─────────────────────────────── */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            "linear-gradient(115deg, rgba(139,63,214,0.075) 0%, rgba(139,63,214,0) 31%, rgba(37,84,74,0.06) 52%, rgba(37,84,74,0) 74%), linear-gradient(180deg, #F3EEE5 0%, #E8DECF 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            "linear-gradient(120deg, rgba(59,21,76,0.12) 0%, rgba(59,21,76,0) 35%, rgba(59,21,76,0.06) 58%, rgba(59,21,76,0) 84%), linear-gradient(180deg, #2D1A3E 0%, #1A0F28 100%)",
        }}
      />

      {/* ── 2 · Drifting aurora orbs ────────────────────────────────────
          Three large, heavily-blurred radial blooms. They breathe + drift on
          25s / 30s / 20s cycles so the field feels alive without ever pulling
          focus from the workspace. Brand purple anchors the top-left, signal
          teal answers from the right, and a low aubergine bloom grounds the
          bottom. Opacity is intentionally restrained (stronger in dark mode,
          where the deep canvas can carry more luminance). */}
      <div className="absolute inset-0 opacity-90 dark:opacity-100">
        <div
          className="animate-aurora-blob-1 absolute -top-[18%] -left-[12%] h-[58vh] w-[58vh] rounded-full will-change-transform"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(139,63,214,0.28) 0%, rgba(139,63,214,0.10) 38%, transparent 68%)",
            filter: "blur(56px)",
          }}
        />
        <div
          className="animate-aurora-blob-2 absolute top-[8%] -right-[14%] h-[64vh] w-[64vh] rounded-full will-change-transform"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(37,124,108,0.22) 0%, rgba(37,124,108,0.08) 40%, transparent 70%)",
            filter: "blur(64px)",
          }}
        />
        <div
          className="animate-aurora-blob-3 absolute -bottom-[22%] left-[24%] h-[52vh] w-[52vh] rounded-full will-change-transform"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(91,33,140,0.20) 0%, rgba(91,33,140,0.07) 42%, transparent 72%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* ── 3 · Lateral aurora sheen ────────────────────────────────────
          A wide, low-contrast brand band that pans slowly across the entire
          field on its own long cycle, layering subtle parallax over the orbs. */}
      <div
        className="animate-aurora-drift absolute inset-0 opacity-[0.5] dark:opacity-[0.45] mix-blend-soft-light will-change-transform"
        style={{
          background:
            "linear-gradient(100deg, transparent 0%, rgba(139,63,214,0.10) 30%, rgba(37,124,108,0.08) 55%, transparent 80%)",
        }}
      />

      {/* ── 4a · Structural texture grid ────────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.14] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(26,22,20,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(26,22,20,0.06) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.08))",
        }}
      />

      {/* ── 4b · Fine brand alignment grid ──────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--color-brand) 1px, transparent 1px),
            linear-gradient(to bottom, var(--color-brand) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to right, transparent, black 18%, black 82%, transparent)",
        }}
      />

      {/* ── 4c · Top-down specular vignette ─────────────────────────────
          Lifts the workspace off the canvas with a faint cool highlight up top
          and a soft floor shadow, giving the whole surface gentle depth. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.20) 0%, transparent 46%), radial-gradient(120% 60% at 50% 116%, rgba(26,22,20,0.10) 0%, transparent 52%)",
        }}
      />
    </div>
  );
}
