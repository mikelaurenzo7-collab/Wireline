import { randomBytes } from "node:crypto";
import { AppError } from "./api-error";

/**
 * Dynamic OAuth client registration (RFC 7591) for the Wireline MCP server.
 *
 * ChatGPT identifies itself with a Client ID Metadata Document hosted on
 * chatgpt.com, so it never registers. Claude connectors register dynamically,
 * which means this endpoint decides who may enter the OAuth flow. Registration
 * is therefore closed to Anthropic-operated callback URIs: every accepted
 * client is a public client (PKCE only, no secret) whose redirect targets
 * live on claude.ai or claude.com.
 */

export const MCP_DYNAMIC_CLIENT_ID_PREFIX = "wlmcp_client_";
const ANTHROPIC_REDIRECT_HOSTS = new Set(["claude.ai", "claude.com"]);
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
    if (!isAnthropicRedirectUri(uri)) {
      throw registrationError(
        "Wireline only registers Claude connector callbacks on claude.ai or claude.com.",
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
  return { clientName: clientName || "Claude", redirectUris: normalized };
}

/** Human name for the consent screen, derived from the OAuth callback host. */
export function clientDisplayName(redirectUri: string): string {
  try {
    const host = new URL(redirectUri).hostname;
    if (ANTHROPIC_REDIRECT_HOSTS.has(host)) return "Claude";
    if (host === "chatgpt.com") return "ChatGPT";
  } catch {
    // fall through to the generic label
  }
  return "your MCP client";
}
