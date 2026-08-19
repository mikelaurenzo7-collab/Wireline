import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";

/**
 * Shared MCP Streamable-HTTP transport hardening for BotBound's MCP routers.
 *
 * Both the account-bound production router and the legacy OAuth/demo router
 * speak stateless JSON-RPC over POST /mcp. This module owns the protocol
 * plumbing that must behave identically on both: protocol-version
 * negotiation, ping, notification acceptance, session-id echo hygiene, and
 * the tool-execution error shape.
 */

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export function negotiateMcpProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_SUPPORTED_PROTOCOL_VERSIONS[0];
}

export function isMcpNotificationMethod(method: string): boolean {
  return method.startsWith("notifications/");
}

export function mcpSessionIdForResponse(req: Request): string {
  const requested = req.get("mcp-session-id");
  if (requested && /^[!-~]{1,128}$/.test(requested)) return requested;
  return randomBytes(24).toString("base64url");
}

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

export function mcpOAuthChallenge(
  resourceMetadataUrl: string,
  requiredScope: string,
  description = "Connect a BotBound account to continue.",
  error: "insufficient_scope" | "invalid_token" = "insufficient_scope",
): string {
  return [
    `Bearer resource_metadata="${quotedChallengeValue(resourceMetadataUrl)}"`,
    `error="${error}"`,
    `error_description="${quotedChallengeValue(description)}"`,
    `scope="${quotedChallengeValue(requiredScope)}"`,
  ].join(", ");
}

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
