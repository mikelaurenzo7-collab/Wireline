import { APP_ROUTE_ROOTS } from "./app-route-manifest";

/**
 * First path segments the browser app can render a real page for, across the
 * public router (App.tsx) and the signed-in workspace (routes/AppRoutes.tsx).
 *
 * The production server still serves the app shell for every other path so
 * the visitor sees the friendly 404 page, but it answers with HTTP 404 instead
 * of 200. Search engines then stop indexing typo URLs as real pages.
 * tests/spa-route-roots.test.ts keeps this list in sync with both routers.
 */
export const SPA_ROUTE_ROOTS: ReadonlySet<string> = APP_ROUTE_ROOTS;

/** True when the SPA has a route for this path's first segment (or the home page). */
export function isKnownSpaRoute(pathname: string): boolean {
  const first = pathname.split("/").find(Boolean);
  return first === undefined || SPA_ROUTE_ROOTS.has(first.toLowerCase());
}
