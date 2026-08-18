import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("MCP OAuth issuer binding", () => {
  const middleware = read("src/middleware/mcp-oauth-issuer-binding.ts");
  const stack = read("src/server/register-mcp-routes.ts");

  it("advertises RFC 9207 authorization-response issuer support", () => {
    expect(middleware).toContain("authorization_response_iss_parameter_supported: true");
    expect(middleware).toContain('"/.well-known/oauth-authorization-server"');
    expect(middleware).toContain('"/.well-known/oauth-authorization-server/mcp"');
  });

  it("adds the discovered issuer to ChatGPT, Claude, Claude Code, and Cursor callbacks", () => {
    expect(middleware).toContain("isChatGptRedirectUri");
    expect(middleware).toContain("isAnthropicRedirectUri");
    expect(middleware).toContain("isCursorRedirectUri");
    expect(middleware).toContain("isLoopbackCallbackUri");
    expect(middleware).toContain("authorizationCallbackWithIssuer");
    expect(middleware).toContain('destination.searchParams.set("iss", issuer)');
    expect(read("src/lib/mcp-oauth-security.ts")).toContain("resolveCanonicalAppUrl");
    expect(read("src/lib/mcp-oauth-security.ts")).not.toContain("req?.get(\"host\")");
  });

  it("mounts before the OAuth router", () => {
    const binding = stack.indexOf("app.use(mcpOAuthIssuerBinding)");
    const router = stack.indexOf("app.use(chatgptMcpRouter)");
    expect(binding).toBeGreaterThan(-1);
    expect(router).toBeGreaterThan(binding);
  });
});
