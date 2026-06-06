export function isAllowedStitchAssetHost(host: string): boolean {
  return (
    /\.googleapis\.com$/i.test(host) ||
    /\.googleusercontent\.com$/i.test(host) ||
    /\.gstatic\.com$/i.test(host) ||
    /\.cloud\.google\.com$/i.test(host) ||
    /\.withgoogle\.com$/i.test(host)
  );
}

/** Reject signed URLs that are not on an allowed Google host before fetch. */
export function sanitizeStitchAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http")) return "";
  try {
    const host = new URL(trimmed).hostname;
    if (!isAllowedStitchAssetHost(host)) return "";
    return trimmed;
  } catch {
    return "";
  }
}

/**
 * Download a Stitch asset URL from get_screen (GCS / googleusercontent).
 * Uses plain fetch — signed URLs break when X-Goog-Api-Key is added (SDK pattern).
 */
export async function fetchStitchAssetUrl(url: string, signal?: AbortSignal): Promise<Buffer> {
  const safe = sanitizeStitchAssetUrl(url);
  if (!safe) {
    throw new Error("Refusing Stitch asset URL on non-Google host");
  }
  const res = await fetch(safe, { signal });
  if (!res.ok) {
    throw new Error(`Asset download failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
