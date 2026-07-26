import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("ChatGPT OAuth consent session continuity", () => {
  const bridge = read("src/middleware/mcp-oauth-consent-session.ts");
  const entrypoint = read("src/entrypoints/chatgpt-mcp-api.ts");

  it("keeps the global session cookie Lax and scopes the compatibility bridge narrowly", () => {
    const cookie = read("src/lib/session-cookie.ts");
    expect(cookie).toContain('sameSite: "lax"');
    expect(bridge).toContain('const MCP_CONSENT_PATH = "/mcp/oauth/authorize"');
    expect(bridge).toContain('sameSite: "none" as const');
    expect(bridge).toContain("path: MCP_CONSENT_PATH");
    expect(bridge).toContain("const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000");
  });

  it("requires a double-submit nonce before using the temporary session", () => {
    expect(bridge).toContain('const CSRF_FIELD = "oauth_consent_nonce"');
    expect(bridge).toContain("timingSafeEqual");
    expect(bridge).toContain("!safeEqual(cookieNonce, bodyNonce)");
    expect(bridge).toContain("req.headers.authorization = `Bearer ${handoffSession}`");
    expect(bridge).toContain("clearConsentCookies(res)");
  });

  it("mounts the bridge before the OAuth router", () => {
    const bridgeMount = entrypoint.indexOf("app.use(mcpOAuthConsentSessionBridge)");
    const oauthRouter = entrypoint.indexOf("app.use(chatgptMcpRouter)");
    expect(bridgeMount).toBeGreaterThan(-1);
    expect(oauthRouter).toBeGreaterThan(bridgeMount);
  });
});
