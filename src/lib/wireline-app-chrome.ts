/**
 * App shell chrome — when to show global page context vs full-bleed mission surfaces.
 */
export const FULL_BLEED_APP_ROUTES = ["/chat"] as const;

export function isFullBleedAppRoute(pathname: string): boolean {
  return FULL_BLEED_APP_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function shouldShowAppPageContext(pathname: string): boolean {
  return !isFullBleedAppRoute(pathname);
}
