import { isAppRouteScope, normalizeAppPath } from "./app-route-manifest";
import { isSessionOptionalPublicPath } from "./public-routes";

/** True only for paths owned by the authenticated workspace router. */
export function isWorkspaceRoute(pathname: string): boolean {
  return isAppRouteScope(pathname, "workspace");
}

/**
 * Resolve physical viewport ownership, including the authenticated wildcard.
 *
 * `App.tsx` intentionally sends an authenticated unknown path into `AppShell`,
 * where `AppRoutes` renders the workspace 404. Classifying that same path as a
 * public document outside the shell applied document overflow rules to a
 * bounded 100dvh workspace. Known marketing/auth routes and focused transition
 * routes stay document-owned regardless of session state.
 */
export function usesWorkspaceViewport(pathname: string, authenticated: boolean): boolean {
  const normalized = normalizeAppPath(pathname);
  if (isWorkspaceRoute(normalized)) return true;
  if (!authenticated) return false;
  if (isAppRouteScope(normalized, "transition")) return false;
  return !isSessionOptionalPublicPath(normalized);
}
