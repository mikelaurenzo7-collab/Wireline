import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isMcpResourceBound, mcpResourceUrl } from "../src/lib/mcp-oauth-security";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mcp oauth security contract", () => {
  it("requires exact resource binding", () => {
    const resource = mcpResourceUrl();
    expect(isMcpResourceBound(resource)).toBe(true);
    expect(isMcpResourceBound(null)).toBe(false);
    expect(isMcpResourceBound(undefined)).toBe(false);
    expect(isMcpResourceBound("https://evil.example/mcp")).toBe(false);
  });

  it("backfills null resource rows during schema ensure", () => {
    const oauthRoutes = read("src/routes/chatgpt-mcp-routes.ts");
    expect(oauthRoutes).toContain("backfillMcpOAuthResourceBindings");
  });

  it("revokes sibling access tokens on refresh rotation", () => {
    const oauthRoutes = read("src/routes/chatgpt-mcp-routes.ts");
    expect(oauthRoutes).toContain("revokeMcpAccessTokensForClient");
  });

  it("rate-limits draft writes and token endpoint traffic", () => {
    const oauthRoutes = read("src/routes/chatgpt-mcp-routes.ts");
    expect(oauthRoutes).toContain("assertMcpTokenEndpointRateLimit");
    const accountRoutes = read("src/routes/chatgpt-mcp-account-routes.ts");
    expect(accountRoutes).toContain("assertMcpDraftWriteRateLimit");
  });
});
