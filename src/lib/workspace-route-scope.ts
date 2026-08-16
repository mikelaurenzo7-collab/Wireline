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

/** True only for paths owned by the authenticated workspace router. */
export function isWorkspaceRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (WORKSPACE_EXACT_ROUTES.has(normalized)) return true;
  return WORKSPACE_ROUTE_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}
