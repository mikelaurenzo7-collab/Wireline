import type { NextFunction, Request, Response } from "express";

import {
  isAnthropicRedirectUri,
  isChatGptRedirectUri,
  isCursorRedirectUri,
  isLoopbackCallbackUri,
} from "../lib/mcp-client-registry";
import { mcpIssuer } from "../lib/mcp-oauth-security";

const METADATA_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/mcp",
]);

function callbackWithoutQuery(location: string): string {
  const url = new URL(location);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isAuthorizationCallback(location: string): boolean {
  try {
    const url = new URL(location);
    if (!url.searchParams.has("code") && !url.searchParams.has("error")) return false;
    const clean = callbackWithoutQuery(location);
    return (
      isChatGptRedirectUri(clean) ||
      isAnthropicRedirectUri(clean) ||
      isCursorRedirectUri(clean) ||
      isLoopbackCallbackUri(clean)
    );
  } catch {
    return false;
  }
}

export function authorizationCallbackWithIssuer(location: string, issuer: string): string | null {
  if (!isAuthorizationCallback(location)) return null;
  const destination = new URL(location);
  destination.searchParams.set("iss", issuer);
  return destination.toString();
}

/**
 * RFC 9207 / MCP issuer binding.
 *
 * CIMD clients can use one redirect URI with multiple authorization servers,
 * so the authorization response should bind itself to the issuer to prevent
 * mix-up attacks. ChatGPT, Claude hosted connectors, Claude Code, and Cursor
 * all receive `iss` on the callback when they complete authorization.
 */
export function mcpOAuthIssuerBinding(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" && METADATA_PATHS.has(req.path)) {
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (body && typeof body === "object" && !Array.isArray(body)) {
        return sendJson({
          ...(body as Record<string, unknown>),
          authorization_response_iss_parameter_supported: true,
        });
      }
      return sendJson(body);
    }) as typeof res.json;
  }

  if (req.method === "POST" && req.path === "/mcp/oauth/authorize") {
    const redirect = res.redirect.bind(res);
    res.redirect = ((statusOrUrl: number | string, maybeUrl?: string) => {
      const status = typeof statusOrUrl === "number" ? statusOrUrl : undefined;
      const location = typeof statusOrUrl === "string" ? statusOrUrl : maybeUrl || "";
      const bound = authorizationCallbackWithIssuer(location, mcpIssuer(req));
      const destination = bound || location;
      return status === undefined ? redirect(destination) : redirect(status, destination);
    }) as typeof res.redirect;
  }

  next();
}
