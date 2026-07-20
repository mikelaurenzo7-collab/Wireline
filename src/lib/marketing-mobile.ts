/** Routes that show the fixed mobile conversion bar (MarketingStickyCta). */
const STICKY_CTA_EXACT = new Set(["/", "/compare", "/about"]);

export function isMarketingStickyCtaRoute(pathname: string): boolean {
  if (STICKY_CTA_EXACT.has(pathname)) return true;
  return pathname.startsWith("/for/");
}

/** Bottom offset for fixed UI (cookie banner, toasts) above the sticky CTA bar. */
export const MARKETING_STICKY_CTA_BOTTOM = "calc(5.25rem + env(safe-area-inset-bottom, 0px))";

/** Signed-in mobile dock clearance for toasts above WorkspaceShell MobileDock. */
export const AUTH_MOBILE_DOCK_BOTTOM = "calc(5.25rem + env(safe-area-inset-bottom, 0px))";
