/**
 * Wireline Design Studio — embedded component kit.
 *
 * Stitch-quality HTML comes from constrained tokens + components, not free-form
 * markup. Builders must include this foundation and use the class vocabulary.
 */
export const DESIGN_KIT_CLASS_VOCABULARY = [
  "wl-page",
  "wl-hero",
  "wl-hero--photo",
  "wl-hero-bg",
  "wl-hero-scrim",
  "wl-hero-content",
  "wl-eyebrow",
  "wl-headline",
  "wl-subhead",
  "wl-cta-row",
  "wl-btn",
  "wl-btn--primary",
  "wl-btn--secondary",
  "wl-trust-row",
  "wl-badge",
  "wl-card",
  "wl-section",
  "wl-phone-link",
] as const;

/** Base CSS — operators customize via --wl-* tokens in :root. */
export const DESIGN_KIT_BASE_CSS = `/* Wireline Design Kit — required foundation */
:root {
  --wl-bg: #f7f3eb;
  --wl-surface: #ffffff;
  --wl-ink: #0f172a;
  --wl-muted: #475569;
  --wl-primary: #1e3a5f;
  --wl-primary-contrast: #ffffff;
  --wl-accent: #c47f3a;
  --wl-border: rgba(15, 23, 42, 0.08);
  --wl-radius-sm: 10px;
  --wl-radius-md: 14px;
  --wl-radius-pill: 999px;
  --wl-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --wl-shadow-md: 0 12px 32px rgba(15, 23, 42, 0.10);
  --wl-font-display: "Fraunces", Georgia, serif;
  --wl-font-ui: "DM Sans", system-ui, sans-serif;
  --wl-space-xs: 0.5rem;
  --wl-space-sm: 0.75rem;
  --wl-space-md: 1rem;
  --wl-space-lg: 1.5rem;
  --wl-space-xl: 2rem;
  --wl-space-2xl: 3rem;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body.wl-page {
  margin: 0;
  min-height: 100dvh;
  font-family: var(--wl-font-ui);
  font-size: 16px;
  line-height: 1.55;
  color: var(--wl-ink);
  background: var(--wl-bg);
}
.wl-hero {
  padding: var(--wl-space-2xl) var(--wl-space-lg) var(--wl-space-xl);
  max-width: 28rem;
  margin: 0 auto;
}
.wl-eyebrow {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--wl-accent);
  margin-bottom: var(--wl-space-sm);
}
.wl-headline {
  font-family: var(--wl-font-display);
  font-size: clamp(2rem, 8vw, 2.75rem);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0 0 var(--wl-space-md);
}
.wl-subhead {
  font-size: 1.05rem;
  color: var(--wl-muted);
  margin: 0 0 var(--wl-space-xl);
  max-width: 34ch;
}
.wl-cta-row {
  display: flex;
  flex-direction: column;
  gap: var(--wl-space-sm);
  margin-bottom: var(--wl-space-xl);
}
.wl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0.85rem 1.35rem;
  border-radius: var(--wl-radius-pill);
  font-weight: 700;
  font-size: 1rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.wl-btn:focus-visible {
  outline: 3px solid var(--wl-accent);
  outline-offset: 2px;
}
.wl-btn--primary {
  background: var(--wl-primary);
  color: var(--wl-primary-contrast);
  box-shadow: var(--wl-shadow-md);
}
.wl-btn--secondary {
  background: var(--wl-surface);
  color: var(--wl-primary);
  border: 1px solid var(--wl-border);
  box-shadow: var(--wl-shadow-sm);
}
.wl-trust-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--wl-space-sm);
}
.wl-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-radius: var(--wl-radius-pill);
  background: var(--wl-surface);
  border: 1px solid var(--wl-border);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--wl-ink);
  box-shadow: var(--wl-shadow-sm);
}
.wl-card {
  background: var(--wl-surface);
  border: 1px solid var(--wl-border);
  border-radius: var(--wl-radius-md);
  padding: var(--wl-space-lg);
  box-shadow: var(--wl-shadow-sm);
}
.wl-section { padding: var(--wl-space-xl) var(--wl-space-lg); }
.wl-phone-link {
  font-weight: 700;
  color: var(--wl-primary);
  text-decoration: none;
}
.wl-hero--photo {
  position: relative;
  overflow: hidden;
  min-height: 70dvh;
  padding: 0;
  max-width: none;
  margin: 0;
}
.wl-hero-bg {
  position: absolute;
  inset: 0;
  background-image: var(--wl-hero-photo, none);
  background-size: cover;
  background-position: center;
  animation: wl-hero-drift 20s ease-in-out infinite alternate;
}
.wl-hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15,23,42,.55) 0%, rgba(15,23,42,.2) 42%, rgba(15,23,42,.68) 100%);
}
.wl-hero-content {
  position: relative;
  z-index: 1;
  padding: var(--wl-space-2xl) var(--wl-space-lg);
  max-width: 28rem;
  margin: 0 auto;
}
.wl-hero--photo .wl-headline,
.wl-hero--photo .wl-subhead,
.wl-hero--photo .wl-eyebrow { color: #fff; text-shadow: 0 1px 12px rgba(0,0,0,.35); }
.wl-hero--photo .wl-subhead { color: rgba(255,255,255,.88); }
.wl-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
.wl-btn--primary:hover { transform: translateY(-1px); }
@keyframes wl-hero-drift { from { transform: scale(1.03); } to { transform: scale(1.09); } }
@media (prefers-reduced-motion: reduce) {
  .wl-hero-bg { animation: none; }
  .wl-btn { transition: none; }
}`;

export const DESIGN_KIT_PROMPT_BLOCK = `## Wireline component kit (MANDATORY)
Include Google Fonts for Fraunces + DM Sans (or swap per brief, but keep display + UI pairing).
Paste the full Design Kit CSS below into your <style> block, then override :root tokens to match the brief palette.
Use these classes — do not ship unstyled text links for primary actions:
${DESIGN_KIT_CLASS_VOCABULARY.map((c) => `- \`${c}\``).join("\n")}

\`\`\`css
${DESIGN_KIT_BASE_CSS}
\`\`\`

Hero skeleton (typographic or gradient — embedded CSS only):
\`\`\`html
<body class="wl-page">
  <header class="wl-hero">
    <div class="wl-hero-scrim" aria-hidden="true"></div>
    <div class="wl-hero-content">
      <p class="wl-eyebrow">…</p>
      <h1 class="wl-headline">…</h1>
      <p class="wl-subhead">…</p>
      <div class="wl-cta-row">…</div>
      <div class="wl-trust-row">…</div>
    </div>
  </header>
</body>
\`\`\`

Flat hero (no photography):
\`\`\`html
<body class="wl-page"><header class="wl-hero">…</header></body>
\`\`\``;
