const LOCAL_OAUTH_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/**
 * Client-side defense in depth for OAuth authorization URLs returned by the API.
 * Production providers must use HTTPS; plain HTTP is allowed only for local development.
 */
export function isAllowedOAuthUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) return false;

  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOCAL_OAUTH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
