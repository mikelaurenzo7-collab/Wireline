import { describe, expect, it } from "vitest";

import {
  isAnthropicRedirectUri,
  isCursorRedirectUri,
  isTrustedDynamicRedirectUri,
  MCP_DYNAMIC_CLIENT_ID_PREFIX,
  newDynamicClientId,
} from "../src/lib/mcp-client-registry";

describe("mcp client registry contract", () => {
  it("accepts ChatGPT CIMD-style metadata document hosts indirectly via trusted dynamic URIs", () => {
    expect(isAnthropicRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(
      isAnthropicRedirectUri("https://claude.com/api/organizations/org-1/mcp/auth_callback"),
    ).toBe(true);
    expect(isAnthropicRedirectUri("https://evil.example/api/mcp/auth_callback")).toBe(false);
  });

  it("accepts Cursor OAuth callback URIs", () => {
    expect(isCursorRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isCursorRedirectUri("https://www.cursor.com/agents/mcp/oauth/callback")).toBe(true);
    expect(isCursorRedirectUri("http://localhost:8787/callback")).toBe(true);
    expect(isCursorRedirectUri("https://evil.example/agents/mcp/oauth/callback")).toBe(false);
  });

  it("rejects unknown dynamic registration redirect URIs", () => {
    expect(isTrustedDynamicRedirectUri("https://chatgpt.com/oauth/callback")).toBe(false);
    expect(isTrustedDynamicRedirectUri("cursor://evil/callback")).toBe(false);
  });

  it("issues prefixed dynamic client ids", () => {
    const id = newDynamicClientId();
    expect(id.startsWith(MCP_DYNAMIC_CLIENT_ID_PREFIX)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});
