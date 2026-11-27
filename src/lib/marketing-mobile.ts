/** Routes that show the fixed mobile conversion bar (MarketingStickyCta). */
const STICKY_CTA_EXACT = new Set(["/compare", "/features", "/pricing", "/security", "/trust"]);

export function isMarketingStickyCtaRoute(pathname: string): boolean {
  if (STICKY_CTA_EXACT.has(pathname)) return true;
  return pathname.startsWith("/for/") || pathname.startsWith("/solutions/");
}
