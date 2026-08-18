import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";

/**
 * Shared MCP Streamable-HTTP transport hardening for Wireline's MCP routers.
 *
 * Both the account-bound production router and the legacy OAuth/demo router
 * speak stateless JSON-RPC over POST /mcp. This module owns the protocol
 * plumbing that must behave identically on both: protocol-version
 * negotiation, ping, notification acceptance, session-id echo hygiene, and
 * the tool-execution error shape.
 */

/** Protocol revisions this server accepts, newest first. */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/**
 * MCP version negotiation: echo the client's requested revision when the
 * server supports it; otherwise answer with the newest supported revision and
 * let the client decide whether to continue.
 */
export function negotiateMcpProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_SUPPORTED_PROTOCOL_VERSIONS[0];
}

/**
 * JSON-RPC notifications never receive a response body. Accepting every
 * `notifications/*` method (initialized, cancelled, progress, roots changes)
 * keeps well-behaved clients from logging spurious method-not-found errors.
 */
export function isMcpNotificationMethod(method: string): boolean {
  return method.startsWith("notifications/");
}

/**
 * Echo a client-supplied session id only when it is a well-formed MCP session
 * id (visible ASCII, bounded length); otherwise mint a fresh one instead of
 * reflecting arbitrary header bytes back into the response.
 */
export function mcpSessionIdForResponse(req: Request): string {
  const requested = req.get("mcp-session-id");
  if (requested && /^[!-~]{1,128}$/.test(requested)) return requested;
  return randomBytes(24).toString("base64url");
}

/**
 * Stamp the negotiated protocol version and session id on the response and
 * return the negotiated revision for the initialize result. Initialize
 * negotiates from the request params; every later request echoes the
 * client's MCP-Protocol-Version header when supported.
 */
export function applyMcpTransportHeaders(
  req: Request,
  res: Response,
  method: string,
  params: Record<string, unknown>,
): string {
  const negotiated = negotiateMcpProtocolVersion(
    method === "initialize" ? params.protocolVersion : req.get("mcp-protocol-version"),
  );
  res.setHeader("MCP-Protocol-Version", negotiated);
  res.setHeader("Mcp-Session-Id", mcpSessionIdForResponse(req));
  return negotiated;
}

function quotedChallengeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build the OAuth challenge ChatGPT uses to open account linking. Current Apps
 * SDK clients require both `error` and `error_description`; keeping the shape
 * here prevents the HTTP header and tool-result metadata from drifting apart.
 */
export function mcpOAuthChallenge(
  resourceMetadataUrl: string,
  requiredScope: string,
  description = "Connect a Wireline account to continue.",
): string {
  return [
    `Bearer resource_metadata="${quotedChallengeValue(resourceMetadataUrl)}"`,
    'error="insufficient_scope"',
    `error_description="${quotedChallengeValue(description)}"`,
    `scope="${quotedChallengeValue(requiredScope)}"`,
  ].join(", ");
}

/**
 * Tool-execution failures are reported inside a successful JSON-RPC result
 * with `isError: true` so the model can read the message and self-correct.
 * Protocol failures (unknown method or unknown tool) stay JSON-RPC errors.
 */
export function mcpToolErrorResult(
  message: string,
  meta?: Record<string, unknown>,
): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  _meta?: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    ...(meta ? { _meta: meta } : {}),
  };
}
