import { describe, expect, it } from "vitest";

import { authorizationCallbackWithIssuer } from "./mcp-oauth-issuer-binding";

const ISSUER = "https://trywireline.com";

describe("authorizationCallbackWithIssuer", () => {
  it("appends iss to Cursor, ChatGPT, Claude, and loopback callbacks", () => {
    const cases = [
      "cursor://anysphere.cursor-mcp/oauth/callback?code=abc",
      "https://www.cursor.com/agents/mcp/oauth/callback?code=abc",
      "http://localhost:8787/callback?code=abc",
      "https://chatgpt.com/connector/oauth/7i4vMCsl-J2L?code=abc",
      "https://claude.ai/api/mcp/auth_callback?code=abc",
      "http://127.0.0.1:3118/callback?code=abc",
    ];
    for (const location of cases) {
      const bound = authorizationCallbackWithIssuer(location, ISSUER);
      expect(bound, location).toBeTruthy();
      expect(new URL(bound as string).searchParams.get("iss")).toBe(ISSUER);
    }
  });

  it("does not bind untrusted redirects", () => {
    expect(
      authorizationCallbackWithIssuer("https://trywireline.com/mcp/oauth/callback?code=abc", ISSUER),
    ).toBeNull();
    expect(
      authorizationCallbackWithIssuer("https://evil.example/callback?code=abc", ISSUER),
    ).toBeNull();
    expect(
      authorizationCallbackWithIssuer("http://localhost:8787/callback", ISSUER),
    ).toBeNull();
  });
});
