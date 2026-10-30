export type AppRouteScope =
  | "home"
  | "marketing"
  | "auth"
  | "public-capability"
  | "transition"
  | "workspace";

export type AppRouteFamily = {
  path: `/${string}` | "/";
  scope: AppRouteScope;
  match: "exact" | "branch";
};

function exact(scope: AppRouteScope, paths: readonly AppRouteFamily["path"][]) {
  return paths.map((path) => ({ path, scope, match: "exact" as const }));
}

function branch(scope: AppRouteScope, paths: readonly AppRouteFamily["path"][]) {
  return paths.map((path) => ({ path, scope, match: "branch" as const }));
}

/**
 * Canonical route-ownership manifest for the browser app.
 *
 * Rendering remains colocated with each router, while session hydration,
 * viewport ownership, deep-link auth behavior, and server SPA fallbacks all
 * derive from this list. Compatibility aliases stay explicit so old links do
 * not silently drift into a different shell.
 */
export const APP_ROUTE_FAMILIES: readonly AppRouteFamily[] = [
  ...exact("home", ["/"]),
  ...exact("marketing", [
    "/features",
    "/pricing",
    "/compare",
    "/about",
    "/support",
    "/contact",
    "/showcase",
    "/developers",
    "/docs",
    "/changelog",
    "/security",
    "/privacy",
    "/legal",
    "/terms",
    "/sms-consent",
    "/not-found",
    "/404",
  ]),
  ...branch("marketing", ["/blog", "/for", "/solutions", "/use-cases", "/trust"]),
  ...exact("auth", [
    "/get-started",
    "/login",
    "/reset",
    "/reset-password",
    "/oauth-complete",
  ]),
  ...branch("auth", ["/signin", "/signup", "/auth"]),
  ...exact("public-capability", ["/voice-permission"]),
  ...exact("transition", ["/accept-invite", "/onboarding", "/billing"]),
  ...exact("workspace", [
    "/overview",
    "/agents",
    "/workspace",
    "/templates",
    "/knowledge",
    "/integrations",
    "/call-logs",
    "/logs",
    "/calls",
    "/phone",
    "/calendar",
    "/computer",
    "/insights",
    "/inbox",
    "/email",
    "/approvals",
    "/dnc",
    "/audit",
    "/voice",
    "/voices",
    "/voice-clone",
  ]),
  ...branch("workspace", ["/studio", "/connections", "/settings", "/admin", "/apps"]),
];

export function normalizeAppPath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  return pathOnly.replace(/\/+$/, "") || "/";
}

function matchesFamily(pathname: string, family: AppRouteFamily): boolean {
  if (pathname === family.path) return true;
  return family.match === "branch" && pathname.startsWith(`${family.path}/`);
}

export function routeScopeFor(pathname: string): AppRouteScope | null {
  const normalized = normalizeAppPath(pathname);
  return APP_ROUTE_FAMILIES.find((family) => matchesFamily(normalized, family))?.scope ?? null;
}

export function isAppRouteScope(pathname: string, scope: AppRouteScope): boolean {
  return routeScopeFor(pathname) === scope;
}

/** First path segments rendered by either the public or authenticated router. */
export const APP_ROUTE_ROOTS: ReadonlySet<string> = new Set(
  APP_ROUTE_FAMILIES.flatMap(({ path }) => {
    const root = path.split("/").find(Boolean);
    return root ? [root.toLowerCase()] : [];
  }),
);
