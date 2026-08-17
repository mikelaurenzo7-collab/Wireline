import { randomBytes } from "node:crypto";
import { AppError } from "./api-error";

/**
 * Dynamic OAuth client registration (RFC 7591) plus CIMD allowlists for the
 * Wireline MCP server.
 *
 * ChatGPT identifies itself with a Client ID Metadata Document hosted on
 * chatgpt.com, so it never registers. Claude.ai and Claude.com connectors
 * register dynamically. Claude Code uses Anthropic's published CIMD and an
 * RFC 8252 loopback redirect. Cursor connectors register dynamically against
 * Cursor-operated callbacks. Registration is closed to those official URIs.
 */

export const MCP_DYNAMIC_CLIENT_ID_PREFIX = "wlmcp_client_";
export const CLAUDE_CODE_CLIENT_METADATA_PATH = "/oauth/claude-code-client-metadata";
const ANTHROPIC_REDIRECT_HOSTS = new Set(["claude.ai", "claude.com"]);
const CURSOR_REDIRECTS = new Set([
  "cursor://anysphere.cursor-mcp/oauth/callback",
  "https://www.cursor.com/agents/mcp/oauth/callback",
  "http://localhost:8787/callback",
]);
const MAX_REDIRECT_URIS = 8;

export interface DynamicClientRegistrationInput {
  clientName: string;
  redirectUris: string[];
}

export function isAnthropicRedirectUri(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ANTHROPIC_REDIRECT_HOSTS.has(url.hostname)) return false;
    if (url.search || url.hash || url.username || url.password || url.port) return false;
    return (
      url.pathname === "/api/mcp/auth_callback" ||
      /^\/api\/organizations\/[A-Za-z0-9-]+\/mcp\/auth_callback$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isCursorRedirectUri(value: unknown): boolean {
  return typeof value === "string" && CURSOR_REDIRECTS.has(value);
}

/** RFC 8252 loopback used by Claude Code's CIMD (`/callback`, ephemeral port). */
export function isLoopbackCallbackUri(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
    if (url.pathname !== "/callback") return false;
    if (url.search || url.hash || url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function isChatGptRedirectUri(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.pathname.startsWith("/connector/oauth/")
    );
  } catch {
    return false;
  }
}

export function isTrustedDynamicRedirectUri(value: unknown): boolean {
  return isAnthropicRedirectUri(value) || isCursorRedirectUri(value);
}

export function isChatGptClientMetadataUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return null;
    if (!/^\/oauth\/.+\/client\.json$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function isClaudeCodeClientMetadataUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || !ANTHROPIC_REDIRECT_HOSTS.has(url.hostname)) return null;
    if (url.pathname !== CLAUDE_CODE_CLIENT_METADATA_PATH) return null;
    if (url.search || url.hash || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export function isTrustedCimdClientId(clientId: string): URL | null {
  return isChatGptClientMetadataUrl(clientId) || isClaudeCodeClientMetadataUrl(clientId);
}

export function isTrustedCimdRedirectUri(clientIdUrl: URL, redirectUri: string): boolean {
  if (clientIdUrl.hostname === "chatgpt.com") return isChatGptRedirectUri(redirectUri);
  if (ANTHROPIC_REDIRECT_HOSTS.has(clientIdUrl.hostname)) {
    return isLoopbackCallbackUri(redirectUri) || isAnthropicRedirectUri(redirectUri);
  }
  return false;
}

function loopbackIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (!isLoopbackCallbackUri(value)) return null;
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return null;
  }
}

export function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  // Claude Code CIMD advertises loopback without a port and the client picks
  // an ephemeral one. A registered URI that already includes a port (Cursor's
  // http://localhost:8787/callback) is exact-match only — otherwise DCR of
  // Cursor's callback would authorize any localhost port.
  try {
    if (new URL(registered).port) return false;
  } catch {
    return false;
  }
  const registeredLoopback = loopbackIdentity(registered);
  const requestedLoopback = loopbackIdentity(requested);
  return Boolean(registeredLoopback && requestedLoopback && registeredLoopback === requestedLoopback);
}

export function redirectUriAllowed(registeredUris: string[], requested: string): boolean {
  return registeredUris.some((uri) => redirectUriMatches(uri, requested));
}

export function newDynamicClientId(): string {
  return `${MCP_DYNAMIC_CLIENT_ID_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function isDynamicClientId(value: string): boolean {
  return value.startsWith(MCP_DYNAMIC_CLIENT_ID_PREFIX) && value.length <= 128;
}

function registrationError(description: string, error = "invalid_client_metadata"): AppError {
  const appError = AppError.fromHttpStatus(400, description);
  (appError as AppError & { oauthError?: string }).oauthError = error;
  return appError;
}

export function oauthErrorCode(error: unknown): string | null {
  return error instanceof AppError
    ? ((error as AppError & { oauthError?: string }).oauthError ?? null)
    : null;
}

export function validateDynamicClientRegistration(
  payload: unknown,
): DynamicClientRegistrationInput {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  if (!body) throw registrationError("A JSON client registration document is required.");

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!redirectUris.length || redirectUris.length > MAX_REDIRECT_URIS) {
    throw registrationError(
      "redirect_uris must list between 1 and 8 callback addresses.",
      "invalid_redirect_uri",
    );
  }
  const normalized: string[] = [];
  for (const uri of redirectUris) {
    if (!isTrustedDynamicRedirectUri(uri)) {
      throw registrationError(
        "Wireline only registers Claude or Cursor connector callbacks on their official redirect URIs.",
        "invalid_redirect_uri",
      );
    }
    if (!normalized.includes(uri as string)) normalized.push(uri as string);
  }

  const authMethod =
    typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (authMethod !== "none") {
    throw registrationError(
      'Wireline registers public clients only. Use token_endpoint_auth_method "none" with PKCE.',
    );
  }
  if (Array.isArray(body.grant_types)) {
    const allowed = new Set(["authorization_code", "refresh_token"]);
    for (const grant of body.grant_types) {
      if (typeof grant !== "string" || !allowed.has(grant)) {
        throw registrationError("Only authorization_code and refresh_token grants are supported.");
      }
    }
  }
  if (Array.isArray(body.response_types)) {
    for (const responseType of body.response_types) {
      if (responseType !== "code") {
        throw registrationError("Only the code response type is supported.");
      }
    }
  }

  const clientName =
    typeof body.client_name === "string"
      ? body.client_name.replace(/\s+/g, " ").trim().slice(0, 120)
      : "";
  const defaultName = normalized.some(isCursorRedirectUri) ? "Cursor" : "Claude";
  return { clientName: clientName || defaultName, redirectUris: normalized };
}

/** Hostname shown as the relying party on the consent screen (CIMD uses client_id host). */
export function relyingPartyHost(clientId: string, redirectUri: string): string {
  const cimd = isTrustedCimdClientId(clientId);
  if (cimd) return cimd.hostname;
  try {
    if (redirectUri.startsWith("cursor:")) return "cursor.com";
    return new URL(redirectUri).hostname;
  } catch {
    return "the connecting app";
  }
}

/** Human name for the consent screen, derived from the client and callback. */
export function clientDisplayName(redirectUri: string, clientId?: string): string {
  if (clientId && isClaudeCodeClientMetadataUrl(clientId)) return "Claude Code";
  if (isCursorRedirectUri(redirectUri)) return "Cursor";
  if (isLoopbackCallbackUri(redirectUri)) return "Claude Code";
  try {
    const host = new URL(redirectUri).hostname;
    if (ANTHROPIC_REDIRECT_HOSTS.has(host)) return "Claude";
    if (host === "chatgpt.com") return "ChatGPT";
  } catch {
    // fall through to the generic label
  }
  return "your MCP client";
}

export function mcpDraftSourceForClient(
  clientId: string,
  redirectUriOrUris?: string | string[],
): "chatgpt_mcp" | "claude_mcp" | "cursor_mcp" {
  const redirectUris = Array.isArray(redirectUriOrUris)
    ? redirectUriOrUris
    : redirectUriOrUris
      ? [redirectUriOrUris]
      : [];
  if (redirectUris.some((uri) => isCursorRedirectUri(uri))) return "cursor_mcp";
  if (
    isClaudeCodeClientMetadataUrl(clientId) ||
    redirectUris.some((uri) => isAnthropicRedirectUri(uri) || isLoopbackCallbackUri(uri))
  ) {
    return "claude_mcp";
  }
  if (isDynamicClientId(clientId)) return "claude_mcp";
  return "chatgpt_mcp";
}
