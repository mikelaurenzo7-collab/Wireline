import { describe, expect, it } from "vitest";
import { AppError } from "./api-error";
import {
  clientDisplayName,
  isAnthropicRedirectUri,
  isCursorRedirectUri,
  isDynamicClientId,
  mcpDraftSourceForClient,
  newDynamicClientId,
  oauthErrorCode,
  validateDynamicClientRegistration,
} from "./mcp-client-registry";

describe("mcp dynamic client registration", () => {
  it("accepts Anthropic and Cursor connector callbacks", () => {
    expect(isAnthropicRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAnthropicRedirectUri("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(
      isAnthropicRedirectUri("https://claude.ai/api/organizations/org-1/mcp/auth_callback"),
    ).toBe(true);
    expect(isCursorRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isCursorRedirectUri("https://www.cursor.com/agents/mcp/oauth/callback")).toBe(true);
    expect(isCursorRedirectUri("http://localhost:8787/callback")).toBe(true);

    expect(isAnthropicRedirectUri("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(isAnthropicRedirectUri("https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
    expect(isAnthropicRedirectUri("https://chatgpt.com/connector/oauth/callback")).toBe(false);
    expect(isAnthropicRedirectUri("https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
    expect(isAnthropicRedirectUri("https://claude.ai:8443/api/mcp/auth_callback")).toBe(false);
    expect(isAnthropicRedirectUri("https://claude.ai/other/path")).toBe(false);
    expect(isAnthropicRedirectUri(42)).toBe(false);
    expect(isCursorRedirectUri("https://evil.cursor.com/agents/mcp/oauth/callback")).toBe(false);
  });

  it("registers a bounded public client from a Claude registration document", () => {
    const registration = validateDynamicClientRegistration({
      client_name: `  Claude ${"x".repeat(300)}  `,
      redirect_uris: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
        "https://claude.ai/api/mcp/auth_callback",
      ],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(registration.redirectUris).toEqual([
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ]);
    expect(registration.clientName.length).toBeLessThanOrEqual(120);
    expect(registration.clientName.startsWith("Claude")).toBe(true);
  });

  it("defaults the client name and auth method when omitted", () => {
    const registration = validateDynamicClientRegistration({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    expect(registration.clientName).toBe("Claude");
  });

  it("rejects registrations outside the Anthropic callback allowlist", () => {
    const attempt = () =>
      validateDynamicClientRegistration({
        redirect_uris: ["https://attacker.example/api/mcp/auth_callback"],
      });
    expect(attempt).toThrowError(AppError);
    try {
      attempt();
    } catch (error) {
      expect(oauthErrorCode(error)).toBe("invalid_redirect_uri");
    }
  });

  it("rejects confidential clients and unsupported grants", () => {
    expect(() =>
      validateDynamicClientRegistration({
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "client_secret_basic",
      }),
    ).toThrowError(AppError);
    expect(() =>
      validateDynamicClientRegistration({
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["implicit"],
      }),
    ).toThrowError(AppError);
    expect(() => validateDynamicClientRegistration({ redirect_uris: [] })).toThrowError(AppError);
    expect(() => validateDynamicClientRegistration(null)).toThrowError(AppError);
  });

  it("issues recognizable public client ids", () => {
    const id = newDynamicClientId();
    expect(isDynamicClientId(id)).toBe(true);
    expect(isDynamicClientId("https://chatgpt.com/oauth/x/client.json")).toBe(false);
  });

  it("names the consent screen after the connecting surface", () => {
    expect(clientDisplayName("https://claude.ai/api/mcp/auth_callback")).toBe("Claude");
    expect(clientDisplayName("https://claude.com/api/mcp/auth_callback")).toBe("Claude");
    expect(clientDisplayName("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("Cursor");
    expect(clientDisplayName("https://chatgpt.com/connector/oauth/callback")).toBe("ChatGPT");
    expect(clientDisplayName("not-a-url")).toBe("your MCP client");
  });

  it("maps draft source from client and redirect metadata", () => {
    const dynamicId = newDynamicClientId();
    expect(mcpDraftSourceForClient(dynamicId, "https://claude.ai/api/mcp/auth_callback")).toBe(
      "claude_mcp",
    );
    expect(mcpDraftSourceForClient(dynamicId, "cursor://anysphere.cursor-mcp/oauth/callback")).toBe(
      "cursor_mcp",
    );
    expect(
      mcpDraftSourceForClient(dynamicId, [
        "https://claude.ai/api/mcp/auth_callback",
        "https://www.cursor.com/agents/mcp/oauth/callback",
      ]),
    ).toBe("cursor_mcp");
    expect(mcpDraftSourceForClient("https://chatgpt.com/oauth/x/client.json")).toBe("chatgpt_mcp");
  });
});

