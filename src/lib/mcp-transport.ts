import { randomBytes } from "node:crypto";
import type { Request } from "express";

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
 * Tool-execution failures are reported inside a successful JSON-RPC result
 * with `isError: true` so the model can read the message and self-correct.
 * Protocol failures (unknown method, unknown tool, auth challenges) stay
 * JSON-RPC errors.
 */
export function mcpToolErrorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}
