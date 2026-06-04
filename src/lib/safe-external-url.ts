/**
 * Client-safe external URL helpers — only http(s) links are rendered as anchors.
 */
export function safeExternalHref(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    /* invalid absolute URL */
  }

  return null;
}

export function isSafeExternalUrl(raw: string | undefined | null): boolean {
  return safeExternalHref(raw) !== null;
}
