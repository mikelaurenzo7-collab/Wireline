const LOCAL_OAUTH_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const PROVIDER_OAUTH_HOSTS = new Set([
  "accounts.google.com",
  "login.microsoftonline.com",
  "api.login.yahoo.com",
]);

/**
 * Client-side defense in depth for OAuth authorization URLs returned by the API.
 * Production redirects must use HTTPS on a Wireline-supported provider host;
 * plain HTTP is allowed only for local development.
 */
export function isAllowedOAuthUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) return false;

  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return PROVIDER_OAUTH_HOSTS.has(url.hostname);
    return url.protocol === "http:" && LOCAL_OAUTH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
