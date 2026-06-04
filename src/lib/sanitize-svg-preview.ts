/**
 * Safe inline SVG preview for ArtifactCard — renders via <img src="data:...">
 * so scripts and event handlers in untrusted SVG never execute in the DOM.
 */

const SVG_ROOT_RE = /^<\s*svg[\s>]/i;
const SVG_BLOCKED_RE =
  /<\s*script|on\w+\s*=|javascript:|data:\s*text\/html|<\s*foreignObject|<\s*iframe|<\s*embed|<\s*object/i;

/** Returns a data URL suitable for <img src>, or null if the payload is rejected. */
export function safeSvgPreviewDataUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !SVG_ROOT_RE.test(trimmed)) return null;
  if (SVG_BLOCKED_RE.test(trimmed)) return null;
  return `data:image/svg+xml,${encodeURIComponent(trimmed)}`;
}
