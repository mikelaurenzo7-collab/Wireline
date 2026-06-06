/** Marketing home — anonymous visitors should see the landing page immediately. */
export function isMarketingHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
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
  return isMarketingHomePath(pathname) || isAuthPortalPath(pathname);
}
