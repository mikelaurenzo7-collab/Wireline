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
