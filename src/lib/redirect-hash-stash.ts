/**
 * Client-side stash for URL fragments across the sign-in round trip.
 *
 * The browser-extension handoff carries its captured page context in
 * `location.hash` (`/studio/handoff#browser-context=<payload>`). That payload
 * is reversible base64 of the captured page URL, selected text, and request —
 * client-only by design. Encoding it into the `/signin?redirect=` query string
 * would move it into HTTP requests (proxy/server telemetry) and into the auth
 * portal's persisted redirect. So the fragment never travels: it is stashed
 * here in sessionStorage, keyed to its pathname, and restored by AppShell
 * after authentication. sessionStorage survives same-tab OAuth round trips
 * and dies with the tab, which matches the payload's sensitivity.
 */

const STASH_KEY = "wl_redirect_hash_stash";

type StashRecord = { pathname: string; hash: string };

export function stashRedirectHash(pathname: string, hash: string): void {
  if (!hash || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify({ pathname, hash }));
  } catch {
    // Storage unavailable (private mode quotas): the flow degrades to the
    // pre-stash behavior — context lost, surfaced by the handoff page.
  }
}

/** Read-and-clear: returns the stashed hash for this pathname, once. */
export function consumeRedirectHash(pathname: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as StashRecord | null;
    if (!record || record.pathname !== pathname) return null;
    window.sessionStorage.removeItem(STASH_KEY);
    return typeof record.hash === "string" && record.hash.startsWith("#") ? record.hash : null;
  } catch {
    return null;
  }
}
