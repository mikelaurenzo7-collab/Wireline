const WORKSPACE_ROUTE_ROOTS = ["/studio", "/connections", "/settings", "/admin"] as const;
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
  "/approvals",
  "/apps",
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
