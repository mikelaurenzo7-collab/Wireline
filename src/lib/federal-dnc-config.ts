/**
 * Federal DNC vendor-credential validity — a zero-dependency leaf so both the
 * runtime service and the integrations registry share one rule without the
 * registry inheriting the service's database-heavy import graph.
 * (scripts/check-vendor-readiness.mjs keeps its documented mirror because the
 * probe script cannot import TypeScript.)
 */
export function isFederalDncVendorConfigured(): boolean {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  if (!apiKey || !apiUrl) return false;
  // Vercel personal/access tokens have been pasted as DNC keys by mistake.
  // They authenticate nothing at DNCScrub and make readiness probes lie.
  if (/^vcp_/i.test(apiKey) || /^vercel_/i.test(apiKey)) return false;
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return true;
}
