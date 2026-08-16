import { isSessionOptionalPublicPath } from "./public-routes";

// "/apps" is a ROOT, not an exact route: /apps/command is a real authenticated
// page, and exact-only matching sent signed-out visitors (expired session,
// bookmark) to the public marketing 404 instead of sign-in-and-return.
const WORKSPACE_ROUTE_ROOTS = ["/studio", "/connections", "/settings", "/admin", "/apps"] as const;
const WORKSPACE_EXACT_ROUTES = new Set([
  "/overview",
  "/agents",
  "/templates",
  "/knowledge",
  "/call-logs",
  "/logs",
  "/phone",
  "/insights",
  "/inbox",
  "/email",
  "/approvals",
  "/dnc",
  "/audit",
]);

// These explicit routes are neither anonymous marketing documents nor bounded
// workspace pages. They own focused transitional layouts and must remain in
// document mode even when the visitor already has an authenticated session.
const DOCUMENT_TRANSITION_ROUTES = new Set(["/onboarding", "/accept-invite", "/billing"]);

function normalizedPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** True only for paths owned by the authenticated workspace router. */
export function isWorkspaceRoute(pathname: string): boolean {
  const normalized = normalizedPath(pathname);
  if (WORKSPACE_EXACT_ROUTES.has(normalized)) return true;
  return WORKSPACE_ROUTE_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
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
  const normalized = normalizedPath(pathname);
  if (isWorkspaceRoute(normalized)) return true;
  if (!authenticated) return false;
  if (DOCUMENT_TRANSITION_ROUTES.has(normalized)) return false;
  return !isSessionOptionalPublicPath(normalized);
}
