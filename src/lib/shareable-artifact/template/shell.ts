/**
 * Server-rendered shell for shareable recap pages.
 *
 * Renders a self-contained HTML document with the Letterpress palette
 * inlined as CSS custom properties (both themes), theme selection via
 * `prefers-color-scheme` and an optional workspace override, a
 * signal-line wire divider set with hairline ticks, the wire glyph, and
 * a signed footer. Every convention every page must honor lives here —
 * noindex, no external assets, print-perfect CSS, reduced motion, and a
 * per-theme accent so the single decisive color moment is always
 * readable against the ground it lands on.
 *
 * The individual `render*` templates supply only the `<main>` body and
 * optional agent signature.
 */
import { accentForTheme, type WorkspaceBrand } from "../brand";
import {
  WIRELINE_LETTERPRESS_PALETTE,
  WIRELINE_SIGNATURE,
  WIRE_GLYPH_SVG,
  type LetterpressTheme,
} from "../design";
import { escapeHtml } from "./escape";

export interface ShellOptions {
  title: string;
  eyebrow: string;
  body: string;
  brand: WorkspaceBrand;
  agentSignature?: string | null;
  hideWirelineFooter?: boolean;
}

function themeVariables(theme: LetterpressTheme, accent: string): string {
  const palette = WIRELINE_LETTERPRESS_PALETTE[theme];
  const entries = Object.entries(palette).map(([token, value]) => `      --wl-${token}: ${value};`);
  entries.push(`      --wl-accent: ${accent};`);
  return entries.join("\n");
}

const BASE_STYLES = `
    :root {
      color-scheme: dark;
      --wl-max-column: 720px;
      --wl-radius: 12px;
      --wl-radius-lg: 16px;
      --wl-radius-pill: 999px;
      --wl-hairline: 1px;
      --wl-space-1: 4px;
      --wl-space-2: 8px;
      --wl-space-3: 12px;
      --wl-space-4: 16px;
      --wl-space-5: 24px;
      --wl-space-6: 32px;
      --wl-space-7: 48px;
      --wl-space-8: 64px;
      --wl-space-9: 96px;
      --wl-font-display:
        "Instrument Serif", "Iowan Old Style", "Charter", ui-serif, Georgia, serif;
      --wl-font-body:
        "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
        "Helvetica Neue", Arial, sans-serif;
      --wl-font-mono:
        "Space Mono", "SF Mono", ui-monospace, "JetBrains Mono", "Menlo",
        Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html { color-scheme: dark light; }

    html, body {
      background: var(--wl-canvas);
      color: var(--wl-textPrimary);
      font-family: var(--wl-font-body);
      font-size: 15px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-feature-settings: "ss01", "cv11", "tnum";
    }

    body {
      padding: var(--wl-space-8) var(--wl-space-5) var(--wl-space-8);
      display: flex;
      justify-content: center;
    }

    .wl-page {
      width: 100%;
      max-width: var(--wl-max-column);
      display: grid;
      gap: var(--wl-space-7);
    }

    .wl-eyebrow-lockup {
      display: grid;
      gap: var(--wl-space-3);
    }

    .wl-eyebrow-line {
      display: flex;
      align-items: center;
      gap: var(--wl-space-3);
      color: var(--wl-textTertiary);
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .wl-eyebrow-mark {
      color: var(--wl-wire);
      display: inline-flex;
    }

    .wl-eyebrow-mark svg { display: block; }

    .wl-eyebrow-workspace {
      color: var(--wl-textPrimary);
      letter-spacing: 0.14em;
    }

    .wl-eyebrow-separator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--wl-borderStrong);
      opacity: 0.85;
    }

    .wl-eyebrow-section {
      color: var(--wl-textSecondary);
    }

    .wl-eyebrow-underline {
      display: block;
      height: 1px;
      background: linear-gradient(
        to right,
        var(--wl-borderStrong) 0,
        var(--wl-borderStrong) 40%,
        var(--wl-border) 42%,
        var(--wl-border) 100%
      );
    }

    .wl-hero {
      font-family: var(--wl-font-display);
      font-weight: 400;
      font-size: clamp(32px, 5.6vw, 48px);
      line-height: 1.05;
      letter-spacing: -0.014em;
      color: var(--wl-textPrimary);
      max-width: 26ch;
      text-wrap: balance;
    }

    .wl-hero em {
      font-style: italic;
      color: var(--wl-accent);
      font-family: inherit;
    }

    .wl-metadata {
      display: flex;
      flex-wrap: wrap;
      gap: var(--wl-space-2) var(--wl-space-4);
      font-family: var(--wl-font-mono);
      font-size: 12px;
      letter-spacing: 0.02em;
      color: var(--wl-textSecondary);
    }

    .wl-metadata dt {
      display: inline;
      color: var(--wl-textTertiary);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 10px;
      margin-right: var(--wl-space-2);
    }

    .wl-metadata dd { display: inline; }

    .wl-metadata dd + dt::before {
      content: "";
      display: inline-block;
      width: 3px;
      height: 3px;
      background: var(--wl-borderStrong);
      border-radius: 50%;
      margin: 0 var(--wl-space-3) 2px var(--wl-space-1);
      vertical-align: middle;
    }

    .wl-wire-rule {
      display: flex;
      align-items: center;
      gap: var(--wl-space-3);
      width: 100%;
      color: var(--wl-borderStrong);
      margin: 0;
    }

    .wl-wire-rule::before,
    .wl-wire-rule::after {
      content: "";
      flex: 1;
      height: 1px;
      background: currentColor;
      opacity: 0.65;
    }

    .wl-wire-rule > span {
      display: inline-block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--wl-wire);
      opacity: 0.85;
    }

    .wl-section {
      display: grid;
      gap: var(--wl-space-4);
    }

    .wl-section-label {
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--wl-textTertiary);
      display: flex;
      align-items: center;
      gap: var(--wl-space-3);
      margin: 0;
    }

    .wl-section-label::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--wl-borderSoft);
    }

    .wl-outcome-pill {
      display: inline-flex;
      align-items: center;
      gap: var(--wl-space-2);
      padding: 4px 12px 4px 6px;
      border-radius: var(--wl-radius-pill);
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      background: transparent;
      border: 1px solid var(--wl-borderStrong);
      color: var(--wl-textPrimary);
    }

    .wl-outcome-pill::before {
      content: "";
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--wl-accent);
    }

    .wl-outcome-pill.wl-outcome-success::before { background: var(--wl-success); }
    .wl-outcome-pill.wl-outcome-warning::before { background: var(--wl-warning); }
    .wl-outcome-pill.wl-outcome-error::before   { background: var(--wl-error); }
    .wl-outcome-pill.wl-outcome-info::before    { background: var(--wl-info); }

    .wl-moment-list {
      list-style: none;
      display: grid;
      gap: 0;
    }

    .wl-moment {
      display: grid;
      grid-template-columns: 68px 12px 1fr;
      gap: var(--wl-space-4);
      align-items: baseline;
      padding: var(--wl-space-3) 0;
      border-top: 1px solid var(--wl-borderSoft);
      position: relative;
    }

    .wl-moment:first-child { border-top: 0; padding-top: 0; }

    .wl-moment-time {
      font-family: var(--wl-font-mono);
      font-size: 12px;
      color: var(--wl-textTertiary);
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    .wl-moment-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--wl-accent);
      opacity: 0.85;
      align-self: center;
      justify-self: center;
      margin-top: 6px;
    }

    .wl-moment-note {
      font-size: 15px;
      color: var(--wl-textPrimary);
      line-height: 1.55;
    }

    .wl-moment-note-caller {
      display: block;
      margin-top: 2px;
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--wl-textTertiary);
    }

    .wl-action-list {
      list-style: none;
      display: grid;
      gap: var(--wl-space-3);
    }

    .wl-action {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: var(--wl-space-3);
      align-items: baseline;
    }

    .wl-action::before {
      content: "";
      display: block;
      width: 13px;
      height: 13px;
      border-radius: 3px;
      border: 1.5px solid var(--wl-borderStrong);
      margin-top: 4px;
      background: transparent;
    }

    .wl-action-body { display: grid; gap: 2px; }

    .wl-action-owner {
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--wl-textTertiary);
    }

    .wl-transcript {
      display: grid;
      gap: var(--wl-space-3);
      font-family: var(--wl-font-mono);
      font-size: 13px;
      line-height: 1.65;
      color: var(--wl-textSecondary);
      margin-top: var(--wl-space-3);
    }

    .wl-transcript-line {
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: var(--wl-space-3);
      align-items: baseline;
    }

    .wl-transcript-role {
      color: var(--wl-textTertiary);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.16em;
      font-family: var(--wl-font-mono);
    }

    .wl-transcript-text {
      color: var(--wl-textPrimary);
      font-family: var(--wl-font-body);
      font-size: 14px;
    }

    details.wl-transcript-fold summary {
      list-style: none;
      cursor: pointer;
      color: var(--wl-textTertiary);
      font-family: var(--wl-font-mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: var(--wl-space-3);
      margin: 0;
    }

    details.wl-transcript-fold summary::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--wl-borderSoft);
    }

    details.wl-transcript-fold summary > span::after {
      content: "";
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-left: var(--wl-space-2);
      border-right: 1px solid currentColor;
      border-bottom: 1px solid currentColor;
      transform: rotate(45deg) translate(-1px, -1px);
      transition: transform 160ms ease;
    }

    details.wl-transcript-fold[open] summary { color: var(--wl-textSecondary); }
    details.wl-transcript-fold[open] summary > span::after {
      transform: rotate(-135deg) translate(-1px, 1px);
    }

    details.wl-transcript-fold summary::-webkit-details-marker { display: none; }
    details.wl-transcript-fold summary::marker { content: ""; }

    .wl-footer {
      display: grid;
      gap: var(--wl-space-3);
      padding-top: var(--wl-space-5);
      border-top: 1px solid var(--wl-borderSoft);
    }

    .wl-footer-sig {
      font-family: var(--wl-font-display);
      font-style: italic;
      color: var(--wl-textPrimary);
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: -0.01em;
    }

    .wl-footer-sig-label {
      display: block;
      font-family: var(--wl-font-mono);
      font-style: normal;
      font-size: 10px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--wl-textTertiary);
      margin-bottom: 2px;
    }

    .wl-footer-meta {
      display: flex;
      align-items: center;
      gap: var(--wl-space-3);
      color: var(--wl-textTertiary);
      font-family: var(--wl-font-mono);
      font-size: 10px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }

    .wl-footer-meta-mark { color: var(--wl-wire); display: inline-flex; }
    .wl-footer-meta-mark svg { display: block; }

    .wl-visually-hidden {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    }

    @media print {
      html, body { background: #FFFFFF; color: #0A0A0E; }
      .wl-eyebrow-line, .wl-metadata, .wl-section-label,
      .wl-transcript-role, .wl-footer-meta,
      .wl-moment-time, .wl-action-owner, .wl-footer-sig-label {
        color: #4A4A4E;
      }
      .wl-wire-rule, .wl-moment, .wl-footer, .wl-outcome-pill {
        border-color: #C4C4C8 !important;
      }
      .wl-moment-dot { background: #4A4A4E !important; }
      .wl-outcome-pill::before { background: #4A4A4E !important; }
      body { padding: 32px; }
      details.wl-transcript-fold { break-inside: avoid; }
      details.wl-transcript-fold summary::after { display: none; }
      details.wl-transcript-fold[open] .wl-transcript-line { break-inside: avoid; }
    }
`;

/** Wrap a rendered body in the shared Letterpress shell. */
export function renderShell(options: ShellOptions): string {
  const { title, eyebrow, body, brand } = options;
  const dataThemeOverride = brand.theme === "coolLight" ? ' data-theme="light"' : "";
  const workspaceEyebrow = escapeHtml(brand.displayName);
  const accents = accentForTheme(brand);
  const footerCredit = brand.wirelineCreditVisible && !options.hideWirelineFooter;
  const signatureText = options.agentSignature ? escapeHtml(options.agentSignature) : null;

  return `<!DOCTYPE html>
<html lang="en"${dataThemeOverride}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive, nocache" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <meta name="theme-color" content="${WIRELINE_LETTERPRESS_PALETTE.obsidian.canvas}" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="${WIRELINE_LETTERPRESS_PALETTE.coolLight.canvas}" media="(prefers-color-scheme: light)" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
${themeVariables("obsidian", accents.obsidian)}
    }
    @media (prefers-color-scheme: light) {
      :root {
${themeVariables("coolLight", accents.coolLight)}
      }
    }
    :root[data-theme="light"] {
${themeVariables("coolLight", accents.coolLight)}
    }
    :root[data-theme="dark"] {
${themeVariables("obsidian", accents.obsidian)}
    }
    ${BASE_STYLES}
  </style>
</head>
<body>
  <div class="wl-page" role="main">
    <div class="wl-eyebrow-lockup" aria-label="Workspace">
      <div class="wl-eyebrow-line">
        <span class="wl-eyebrow-mark" aria-hidden="true">${WIRE_GLYPH_SVG}</span>
        <span class="wl-eyebrow-workspace">${workspaceEyebrow}</span>
        <span class="wl-eyebrow-separator" aria-hidden="true"></span>
        <span class="wl-eyebrow-section">${escapeHtml(eyebrow)}</span>
      </div>
      <span class="wl-eyebrow-underline" aria-hidden="true"></span>
    </div>
    ${body}
    <footer class="wl-footer" role="contentinfo">
      ${
        signatureText
          ? `<div class="wl-footer-sig">
        <span class="wl-footer-sig-label">Signed</span>
        <span>${signatureText}</span>
      </div>`
          : ""
      }
      <div class="wl-footer-meta">
        <span class="wl-footer-meta-mark" aria-hidden="true">${WIRE_GLYPH_SVG}</span>
        <span>${footerCredit ? "Wireline · " + escapeHtml(WIRELINE_SIGNATURE) : escapeHtml(WIRELINE_SIGNATURE)}</span>
        <span aria-hidden="true">·</span>
        <span>${workspaceEyebrow}</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}
