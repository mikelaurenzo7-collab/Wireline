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
  "/privacy",
  "/terms",
  "/solutions",
  "/use-cases",
  "/not-found",
  "/404",
]);

const MARKETING_PUBLIC_PREFIXES = ["/blog/", "/for/", "/solutions/", "/use-cases/", "/trust/"];

/** Broader marketing surface — must not block on session hydration. */
export function isMarketingPublicPath(pathname: string): boolean {
  if (MARKETING_PUBLIC_PATHS.has(pathname)) return true;
  return MARKETING_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Sign-in / sign-up gates (including legacy /auth aliases). */
export function isAuthPortalPath(pathname: string): boolean {
  return (
    pathname === "/signin" ||
    pathname.startsWith("/signin/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/login" ||
    pathname === "/get-started" ||
    pathname === "/reset" ||
    pathname === "/reset-password" ||
    pathname === "/oauth-complete" ||
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
