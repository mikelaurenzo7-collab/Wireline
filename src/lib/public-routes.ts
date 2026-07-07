/** Marketing home — anonymous visitors should see the landing page immediately. */
export function isMarketingHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

const MARKETING_PUBLIC_PATHS = new Set([
  "/features",
  "/pricing",
  "/compare",
  "/about",
  "/support",
  "/contact",
  "/showcase",
  "/developers",
  "/blog",
  "/status",
  "/changelog",
  "/security",
  "/trust",
  "/not-found",
  "/404",
]);

/** Broader marketing surface — must not block on session hydration. */
export function isMarketingPublicPath(pathname: string): boolean {
  if (MARKETING_PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/blog/")) return true;
  if (pathname.startsWith("/for/")) return true;
  return false;
}

/** Sign-in / sign-up gates (including legacy /auth aliases). */
export function isAuthPortalPath(pathname: string): boolean {
  return (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/login" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Routes that must not wait on `/api/auth/session` hydration.
 * Keeps marketing and auth usable when the session API is slow or down.
 */
export function isSessionOptionalPublicPath(pathname: string): boolean {
  return (
    isMarketingHomePath(pathname) || isAuthPortalPath(pathname) || isMarketingPublicPath(pathname)
  );
}
