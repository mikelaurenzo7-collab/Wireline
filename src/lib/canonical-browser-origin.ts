import { BOTBOUND_PRODUCTION_ORIGIN, LEGACY_PRODUCTION_ORIGIN } from "./brand";

export type BrowserLocationLike = {
  origin: string;
  pathname: string;
  search: string;
};

/**
 * Move legacy-host account entry to BotBound before an OAuth bridge cookie is
 * created. The cookie remains host-only and never crosses origins.
 */
export function canonicalLegacyBrowserHandoff(location: BrowserLocationLike): string | null {
  if (location.origin !== LEGACY_PRODUCTION_ORIGIN) return null;
  const pathname = location.pathname.startsWith("/") ? location.pathname : "/";
  const search = location.search.startsWith("?") ? location.search : "";
  return `${BOTBOUND_PRODUCTION_ORIGIN}${pathname}${search}`;
}
