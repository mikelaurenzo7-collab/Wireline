import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("MCP OAuth issuer binding", () => {
  const middleware = read("src/middleware/mcp-oauth-issuer-binding.ts");
  const entrypoint = read("src/entrypoints/chatgpt-mcp-api.ts");

  it("advertises RFC 9207 authorization-response issuer support", () => {
    expect(middleware).toContain("authorization_response_iss_parameter_supported: true");
    expect(middleware).toContain('"/.well-known/oauth-authorization-server"');
    expect(middleware).toContain('"/.well-known/oauth-authorization-server/mcp"');
  });

  it("adds the discovered issuer only to ChatGPT authorization callbacks", () => {
    expect(middleware).toContain('url.hostname === "chatgpt.com"');
    expect(middleware).toContain('url.pathname.startsWith("/connector/oauth/")');
    expect(middleware).toContain('destination.searchParams.set("iss", mcpIssuer(req))');
  });

  it("mounts before the OAuth router", () => {
    const binding = entrypoint.indexOf("app.use(mcpOAuthIssuerBinding)");
    const router = entrypoint.indexOf("app.use(chatgptMcpRouter)");
    expect(binding).toBeGreaterThan(-1);
    expect(router).toBeGreaterThan(binding);
  });
});
