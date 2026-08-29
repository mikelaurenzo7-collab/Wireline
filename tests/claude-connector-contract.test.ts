import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { claudeMcpAppDomain, mcpServerCard, MCP_SERVER_NAME } from "../src/lib/mcp-app-metadata";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Claude Connector Directory contract", () => {
  const widget = read("src/lib/chatgpt-mcp-account.ts");
  const account = read("src/routes/chatgpt-mcp-account-routes.ts");
  const oauth = read("src/routes/chatgpt-mcp-routes.ts");
  const stack = read("src/server/register-mcp-routes.ts");
  const vercel = read("vercel.json");
  const docs = read("docs/CLAUDE_CONNECTOR.md");
  const packet = read("docs/CLAUDE_CONNECTOR_SUBMISSION.md");
  const privacy = read("public/mcp-privacy.html");
  const publicDocs = read("public/claude-connector.html");
  const listing = JSON.parse(read("claude-connector-submission.json")) as {
    listing: {
      name: string;
      tagline: string;
      slug: string;
      description: string;
      icon_url: string;
      website_url: string;
      documentation_url: string;
      privacy_policy_url: string;
      support_email: string;
      company_website: string;
    };
    server: { url: string; allowed_link_uris: string[]; authentication: string[] };
    prerequisites?: string[];
    use_cases?: string[];
  };

  it("keeps a shared remote MCP server named wireline", () => {
    expect(MCP_SERVER_NAME).toBe("wireline");
    expect(account).toContain("serverInfo: { name: MCP_SERVER_NAME");
    expect(account).toContain('title: "Create a BotBound agent draft"');
    expect(account).toContain("prompts/list");
    expect(account).toContain("create_after_hours_receptionist");
    expect(account).toContain("create_first_voice_agent");
  });

  it("challenges protected tool calls with HTTP 401, not a 200 isError result", () => {
    expect(account).toContain('oauthError: "invalid_token" | "insufficient_scope"');
    expect(stack).toContain('res.status(oauthError === "insufficient_scope" ? 403 : 401)');
    expect(stack).not.toContain("mcpToolErrorResult(message");
    expect(stack).toContain("WWW-Authenticate");
    const confirmationGated = [
      ["create_agent_draft", "get_agent_draft", "assertDraftConfirmation", "agents.write"],
      [
        "update_agent_draft",
        "start_private_voice_simulation",
        "assertDraftConfirmation",
        "agents.write",
      ],
      [
        "start_private_voice_simulation",
        "list_wireline_agents",
        "assertRehearsalConfirmation",
        "demo.voice",
      ],
      [
        "run_private_agent_turn",
        "get_agent_coaching_brief",
        "assertRehearsalConfirmation",
        "demo.voice",
      ],
      ["train_wireline_agent", "return jsonRpcError", "assertTrainingConfirmation", "agents.write"],
    ] as const;
    for (const [name, next, confirm, scope] of confirmationGated) {
      const start = account.indexOf(`if (name === "${name}")`);
      const end = account.indexOf(
        next === "return jsonRpcError" ? "return jsonRpcError" : `if (name === "${next}")`,
        start + 1,
      );
      const slice = account.slice(start, end);
      expect(slice.indexOf(`requireScope(principal, "${scope}")`)).toBeGreaterThan(-1);
      expect(slice.indexOf(`requireScope(principal, "${scope}")`)).toBeLessThan(
        slice.indexOf(confirm),
      );
    }
  });

  it("publishes Claude Code CIMD, DCR, consent hostname, and RFC 9207 iss", () => {
    expect(oauth).toContain("isTrustedCimdClientId");
    expect(oauth).toContain("relyingPartyHost");
    expect(oauth).toContain("local address");
    expect(oauth).toContain('"/mcp/server-card"');
    expect(oauth).toContain('"/.well-known/mcp/catalog.json"');
    expect(vercel).toContain("/.well-known/mcp/catalog.json");
    expect(vercel).toContain("/server-card");
  });

  it("serves a dual-host MCP App widget for Claude and ChatGPT", () => {
    expect(widget).toContain('name="color-scheme" content="light dark"');
    expect(widget).toContain('method: "ui/open-link"');
    expect(widget).toContain("openExternal");
    expect(widget).toContain("ui/initialize");
    expect(widget).not.toContain("xai-client-secret.");
    expect(read("src/lib/mcp-app-metadata.ts")).toContain("claudemcpcontent.com");
    expect(read("src/lib/mcp-app-metadata.ts")).toContain(
      'redirect_domains: ["https://botbound.me"]',
    );
    expect(read("src/lib/mcp-app-metadata.ts")).not.toContain('"openai/widgetDomain": domain');
    expect(claudeMcpAppDomain("https://botbound.me/mcp")).toBe(
      "da53efc016f4d0335534b0ce0c3d3cc4.claudemcpcontent.com",
    );
    // Preserve deterministic metadata for already-registered legacy clients.
    expect(claudeMcpAppDomain("https://trywireline.com/mcp")).toBe(
      "9d4498d241a92d33aafe51697b0ba2b9.claudemcpcontent.com",
    );
  });

  it("publishes directory listing copy within Anthropic length limits", () => {
    expect(listing.listing.name.length).toBeGreaterThan(0);
    expect(listing.listing.name.length).toBeLessThanOrEqual(100);
    expect(listing.listing.name).toBe("BotBound");
    expect(listing.listing.tagline.length).toBeLessThanOrEqual(55);
    expect(listing.listing.description.length).toBeLessThanOrEqual(2000);
    expect(listing.listing.slug).toBe("wireline");
    expect(listing.listing.icon_url).toBe("https://botbound.me/botbound-icon-512.png");
    expect(mcpServerCard().icons[0]?.mimeType).toBe("image/png");
    expect(listing.listing.website_url).toBe("https://botbound.me");
    expect(listing.listing.documentation_url).toBe("https://botbound.me/claude-connector.html");
    expect(listing.listing.privacy_policy_url).toBe("https://botbound.me/mcp-privacy.html");
    expect(listing.listing.company_website).toBe("https://botbound.me");
    expect(listing.server.url).toBe("https://botbound.me/mcp");
    expect(listing.server.allowed_link_uris).toEqual(["https://botbound.me"]);
    expect(listing.listing.support_email).toBe("support@botbound.me");
    expect(listing.server.authentication).toEqual(["oauth_dcr", "oauth_cimd"]);
    expect(listing.listing.tagline).toBe("Build your first Bot");
    expect(packet).toContain("Build your first Bot");
    expect(listing.prerequisites?.some((item) => /create a BotBound account/i.test(item))).toBe(
      true,
    );
    expect(listing.use_cases?.some((item) => /rehearse/i.test(item))).toBe(true);
  });

  it("publishes public docs and privacy pages required by the portal", () => {
    expect(publicDocs).toContain("https://botbound.me/mcp");
    expect(publicDocs).toContain("build their first Bot in Claude");
    expect(publicDocs).not.toMatch(/\bvoice agents?\b/i);
    expect(publicDocs).not.toContain("https://trywireline.com/mcp");
    expect(publicDocs).toContain('href="/contact">contact BotBound</a>');
    expect(publicDocs).not.toContain("mailto:support@trywireline.com");
    expect(privacy).toContain("Information returned to the connecting client");
    expect(privacy).toContain("The answer is not included in the model-visible conversation");
    expect(privacy).toContain("no OpenAI credential is returned to the widget");
    expect(privacy).toContain("build their first Bot");
    expect(privacy).not.toMatch(/\bvoice agents?\b/i);
    expect(docs).toContain("401");
    expect(packet).toContain("https://claude.ai/admin-settings/directory/submissions/new");
    expect(packet).toContain("Team or Enterprise");
    expect(packet).toContain("https://botbound.me/mcp");
    expect(packet).not.toContain("https://trywireline.com/mcp");
  });
});
