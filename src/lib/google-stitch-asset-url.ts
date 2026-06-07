export function isAllowedStitchAssetHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    /\.googleapis\.com$/i.test(h) ||
    /\.googleusercontent\.com$/i.test(h) ||
    /\.gstatic\.com$/i.test(h) ||
    /\.cloud\.google\.com$/i.test(h) ||
    /\.withgoogle\.com$/i.test(h) ||
    // Stitch HTML assets are served from contribution.usercontent.google.com
    // and potentially other *.google.com subdomains.
    /\.google\.com$/i.test(h) ||
    h === "google.com"
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
