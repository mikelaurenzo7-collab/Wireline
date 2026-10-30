import { isAppRouteScope } from "./app-route-manifest";

/** Marketing home - anonymous visitors should see the landing page immediately. */
export function isMarketingHomePath(pathname: string): boolean {
  return isAppRouteScope(pathname, "home");
}

/** Broader marketing surface — must not block on session hydration. */
export function isMarketingPublicPath(pathname: string): boolean {
  return isAppRouteScope(pathname, "marketing");
}

/** Sign-in / sign-up gates (including legacy /auth aliases). */
export function isAuthPortalPath(pathname: string): boolean {
  return isAppRouteScope(pathname, "auth");
}

/** Opaque recipient capabilities are public without being marketing pages. */
export function isPublicCapabilityPath(pathname: string): boolean {
  return isAppRouteScope(pathname, "public-capability");
}

/**
 * Routes that must not wait on `/api/auth/session` hydration.
 * Keeps marketing and auth usable when the session API is slow or down.
 */
export function isSessionOptionalPublicPath(pathname: string): boolean {
  return (
    isMarketingHomePath(pathname) ||
    isAuthPortalPath(pathname) ||
    isMarketingPublicPath(pathname) ||
    isPublicCapabilityPath(pathname)
  );
}
