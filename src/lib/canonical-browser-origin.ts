import { BOTBOUND_PRODUCTION_ORIGIN, LEGACY_PRODUCTION_ORIGIN } from "./brand";

export type BrowserLocationLike = {
  origin: string;
  pathname: string;
  search: string;
  hash?: string;
};

const HOST_BOUND_COMPLETION_PATHS = new Set(["/auth/oauth-complete", "/oauth-complete"]);
const LEGACY_BROWSER_ORIGINS = new Set([LEGACY_PRODUCTION_ORIGIN, "https://botbound.me"]);

/**
 * Move legacy-host browser pages to BotBound before application hydration.
 * API/provider callbacks and an already-issued OAuth completion bridge stay on
 * their original host because their cookies are intentionally host-only.
 */
export function canonicalLegacyBrowserHandoff(location: BrowserLocationLike): string | null {
  if (!LEGACY_BROWSER_ORIGINS.has(location.origin)) return null;
  const pathname = location.pathname.startsWith("/") ? location.pathname : "/";
  const routePath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (
    routePath === "/api" ||
    routePath.startsWith("/api/") ||
    HOST_BOUND_COMPLETION_PATHS.has(routePath)
  ) {
    return null;
  }
  const search = location.search.startsWith("?") ? location.search : "";
  const hash = location.hash?.startsWith("#") ? location.hash : "";
  return `${BOTBOUND_PRODUCTION_ORIGIN}${pathname}${search}${hash}`;
}
