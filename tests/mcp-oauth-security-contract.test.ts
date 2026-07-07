import { describe, expect, it } from "vitest";

import { isMcpResourceBound, mcpResourceUrl } from "../src/lib/mcp-oauth-security";

describe("mcp oauth security contract", () => {
  it("requires exact resource binding", () => {
    const resource = mcpResourceUrl();
    expect(isMcpResourceBound(resource)).toBe(true);
    expect(isMcpResourceBound(null)).toBe(false);
    expect(isMcpResourceBound(undefined)).toBe(false);
    expect(isMcpResourceBound("https://evil.example/mcp")).toBe(false);
  });
});
