import type { NextFunction, Request, Response } from "express";

import { mcpIssuer } from "../lib/mcp-oauth-security";

const METADATA_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/mcp",
]);

function isAuthorizationCallback(location: string): boolean {
  try {
    const url = new URL(location);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.pathname.startsWith("/connector/oauth/") &&
      (url.searchParams.has("code") || url.searchParams.has("error"))
    );
  } catch {
    return false;
  }
}

/**
 * RFC 9207 / MCP issuer binding.
 *
 * CIMD clients can use one redirect URI with multiple authorization servers,
 * so the authorization response should bind itself to the issuer to prevent
 * mix-up attacks. ChatGPT validates the callback before exchanging the code;
 * without this binding the flow can stop after code issuance with no token call.
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
      if (!isAuthorizationCallback(location)) {
        return status === undefined ? redirect(location) : redirect(status, location);
      }

      const destination = new URL(location);
      destination.searchParams.set("iss", mcpIssuer(req));
      return status === undefined
        ? redirect(destination.toString())
        : redirect(status, destination.toString());
    }) as typeof res.redirect;
  }

  next();
}
