/**
 * Branded 404 for shareable artifacts. Returned for expired, revoked,
 * unknown-slug, and bad-token cases identically so a caller cannot
 * distinguish which specific reason applies.
 */
import type { WorkspaceBrand } from "../brand";
import { escapeHtml } from "./escape";
import { renderShell } from "./shell";

const FALLBACK_BRAND: WorkspaceBrand = {
  displayName: "Wireline",
  accentHex: null,
  theme: "obsidian",
  logoUrl: null,
  contactLine: null,
  wirelineCreditVisible: true,
};

export function renderNotFound(brand: WorkspaceBrand = FALLBACK_BRAND): string {
  const eyebrow = "This recap is no longer active";
  const body = `
    <section class="wl-section" aria-labelledby="wl-notfound-label">
      <h2 class="wl-visually-hidden" id="wl-notfound-label">Recap unavailable</h2>
      <h1 class="wl-hero">The link you followed is no longer active.</h1>
      <p style="color: var(--wl-textSecondary); line-height: 1.65; max-width: 60ch;">
        Recaps are shared under private, time-limited links. This one has expired,
        been revoked, or was never issued. If you were expecting to see the
        conversation, ask the ${escapeHtml(brand.displayName)} workspace owner to
        resend the latest link.
      </p>
      <div class="wl-wire-rule" role="separator" aria-hidden="true"><span></span></div>
    </section>`;
  return renderShell({ title: "Recap unavailable — Wireline", eyebrow, body, brand });
}
