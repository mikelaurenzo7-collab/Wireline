/**
 * Deterministic Wireline Design Kit injection when builders omit embedded CSS.
 */
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";

export const DESIGN_KIT_MARKER = "Wireline Design Kit — required foundation";

/** Ensure kit CSS is present — idempotent when marker already exists. */
export function ensureDesignKitInHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(DESIGN_KIT_MARKER)) return trimmed;

  const styleInjection = `<style>\n${DESIGN_KIT_BASE_CSS}\n</style>`;

  if (/<head[\s>]/i.test(trimmed)) {
    return trimmed.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${styleInjection}`);
  }
  if (/<html[\s>]/i.test(trimmed)) {
    return trimmed.replace(
      /<html(\s[^>]*)?>/i,
      (match) => `${match}<head>${styleInjection}</head>`,
    );
  }
  return `<!doctype html><html><head>${styleInjection}</head><body class="wl-page">${trimmed}</body></html>`;
}
