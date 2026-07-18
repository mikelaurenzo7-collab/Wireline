import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Request } from "express";

import type { Response } from "express";

import {
  applyMcpTransportHeaders,
  isMcpNotificationMethod,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  mcpOAuthChallenge,
  mcpSessionIdForResponse,
  mcpToolErrorResult,
  negotiateMcpProtocolVersion,
} from "../src/lib/mcp-transport";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function requestWithSessionId(value: string | undefined): Request {
  return { get: () => value } as unknown as Request;
}

describe("mcp transport contract", () => {
  it("echoes a supported requested protocol revision", () => {
    for (const version of MCP_SUPPORTED_PROTOCOL_VERSIONS) {
      expect(negotiateMcpProtocolVersion(version)).toBe(version);
    }
  });

  it("answers unsupported or missing revisions with the newest supported one", () => {
    expect(negotiateMcpProtocolVersion(undefined)).toBe(MCP_SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(negotiateMcpProtocolVersion("1999-01-01")).toBe(MCP_SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(negotiateMcpProtocolVersion(42)).toBe(MCP_SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it("treats every notifications/* method as a notification", () => {
    expect(isMcpNotificationMethod("notifications/initialized")).toBe(true);
    expect(isMcpNotificationMethod("notifications/cancelled")).toBe(true);
    expect(isMcpNotificationMethod("notifications/roots/list_changed")).toBe(true);
    expect(isMcpNotificationMethod("tools/call")).toBe(false);
    expect(isMcpNotificationMethod("ping")).toBe(false);
  });

  it("echoes only well-formed session ids and mints otherwise", () => {
    expect(mcpSessionIdForResponse(requestWithSessionId("abc-DEF_123"))).toBe("abc-DEF_123");
    const minted = mcpSessionIdForResponse(requestWithSessionId(undefined));
    expect(minted).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(mcpSessionIdForResponse(requestWithSessionId("bad value"))).not.toContain(" ");
    expect(mcpSessionIdForResponse(requestWithSessionId("x".repeat(300)))).toHaveLength(32);
  });

  it("stamps negotiated transport headers from one shared helper", () => {
    const headers: Record<string, string> = {};
    const requestHeaders: Record<string, string | undefined> = {
      "mcp-protocol-version": "2025-03-26",
      "mcp-session-id": "session-1",
    };
    const req = { get: (name: string) => requestHeaders[name.toLowerCase()] } as never;
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;

    expect(
      applyMcpTransportHeaders(req, res, "initialize", { protocolVersion: "2024-11-05" }),
    ).toBe("2024-11-05");
    expect(headers["MCP-Protocol-Version"]).toBe("2024-11-05");
    expect(headers["Mcp-Session-Id"]).toBe("session-1");
    expect(applyMcpTransportHeaders(req, res, "tools/call", {})).toBe("2025-03-26");
    expect(headers["MCP-Protocol-Version"]).toBe("2025-03-26");
  });

  it("shapes tool-execution failures as isError results", () => {
    expect(mcpToolErrorResult("Confirm the draft first.")).toEqual({
      content: [{ type: "text", text: "Confirm the draft first." }],
      isError: true,
    });
  });

  it("keeps OAuth challenge metadata complete and private to the tool result", () => {
    const challenge = mcpOAuthChallenge(
      "https://trywireline.com/.well-known/oauth-protected-resource",
      "agents.write",
    );
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('error_description="Connect a Wireline account to continue."');
    expect(challenge).toContain('scope="agents.write"');
    expect(
      mcpToolErrorResult("Connect a Wireline account to continue.", {
        "mcp/www_authenticate": [challenge],
      }),
    ).toEqual({
      content: [{ type: "text", text: "Connect a Wireline account to continue." }],
      isError: true,
      _meta: { "mcp/www_authenticate": [challenge] },
    });
  });

  it("keeps both MCP routers on the shared transport hardening", () => {
    for (const path of [
      "src/routes/chatgpt-mcp-routes.ts",
      "src/routes/chatgpt-mcp-account-routes.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("applyMcpTransportHeaders");
      expect(source, path).toContain('method === "ping"');
      expect(source, path).toContain("isMcpNotificationMethod");
      expect(source, path).toContain("mcpToolErrorResult");
    }
    const oauthRoutes = read("src/routes/chatgpt-mcp-routes.ts");
    expect(oauthRoutes).toContain("pruneExpiredMcpOAuthRows");
  });
});
