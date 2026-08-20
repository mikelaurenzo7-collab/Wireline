import { describe, expect, it } from "vitest";

import { claudeMcpAppDomain, mcpUiResourceMeta } from "./mcp-app-metadata";

describe("mcp app widget metadata", () => {
  it("keeps Claude host fields off ChatGPT widget keys", () => {
    const resource = "https://trywireline.com/mcp";
    const meta = mcpUiResourceMeta(resource);
    const claudeDomain = claudeMcpAppDomain(resource);

    expect(meta.ui.domain).toBe(claudeDomain);
    expect(meta.ui.csp.resourceDomains).toEqual(["https://assets.claude.ai"]);
    expect(meta).not.toHaveProperty("openai/widgetDomain");
    expect(meta["openai/widgetCSP"].resource_domains).toEqual([]);
    expect(meta["openai/widgetCSP"].redirect_domains).toEqual([
      "https://botbound.me",
      "https://trywireline.com",
    ]);
    expect(meta["openai/widgetCSP"].connect_domains).toEqual(["https://api.openai.com"]);
  });
});
