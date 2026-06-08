/**
 * Client-side demo attribution — persists ?demo= / utm_source for signup funnel.
 */
import { DEMO_SOURCE_COOKIE, parseDemoSourceFromQuery } from "./demo-funnel-shared";

const COOKIE_MAX_AGE_DAYS = 30;

export function captureDemoSourceFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const source = parseDemoSourceFromQuery(window.location.search);
  if (!source) return readDemoSourceCookie();
  try {
    const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    document.cookie = `${DEMO_SOURCE_COOKIE}=${encodeURIComponent(source)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // Cookie storage can fail in restricted contexts; signup still works.
  }
  return source;
}

export function readDemoSourceCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${DEMO_SOURCE_COOKIE}=`;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!hit) return null;
  try {
    return decodeURIComponent(hit.slice(prefix.length));
  } catch {
    return null;
  }
}
