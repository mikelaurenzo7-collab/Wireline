import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Cursor Directory plugin contract", () => {
  const plugin = JSON.parse(read("plugin.json")) as {
    name: string;
    description: string;
    homepage: string;
    repository: string;
    author?: { name?: string; email?: string; url?: string };
  };
  const openPlugins = JSON.parse(read("mcp.json")) as {
    mcpServers: { wireline: { type: string; url: string } };
  };
  const directoryMcp = JSON.parse(read(".mcp.json")) as {
    mcpServers: { wireline: { url: string; headers?: unknown; auth?: unknown } };
  };
  const skill = read("skills/wireline-voice-agent/SKILL.md");
  const rule = read("rules/wireline-mcp.mdc");
  const agent = read("agents/wireline.md");
  const docs = read("docs/CURSOR_PLUGIN.md");
  const packet = read("docs/CURSOR_PLUGIN_SUBMISSION.md");
  const publicDocs = read("public/cursor-plugin.html");
  const apps = read("src/pages/ClientAppsPage.tsx");
  const panel = read("src/components/settings/McpCoachingPanel.tsx");

  it("publishes a closed Open Plugins manifest without secrets", () => {
    expect(plugin.name).toBe("wireline");
    expect(plugin.homepage).toBe("https://botbound.me/cursor-plugin.html");
    expect(plugin.repository).toBe("https://github.com/mikelaurenzo7-collab/Wireline");
    expect(plugin.author?.name).toBe("BotBound");
    expect(plugin.author?.url).toBe("https://botbound.me");
    // Directory schemas require an email; retain the verified legacy mailbox
    // until support@botbound.me is delivery-proven.
    expect(plugin.author?.email).toBe("support@trywireline.com");
    expect(Object.keys(plugin).sort()).toEqual(
      [
        "$schema",
        "author",
        "description",
        "homepage",
        "keywords",
        "license",
        "name",
        "repository",
        "version",
      ].sort(),
    );
    expect(JSON.stringify(plugin)).not.toMatch(/sk-|api[_-]?key|client_secret|Authorization/i);
  });

  it("points only at the remote Streamable HTTP server", () => {
    expect(openPlugins.mcpServers.wireline).toEqual({
      type: "streamable-http",
      url: "https://botbound.me/mcp",
    });
    expect(directoryMcp.mcpServers).toEqual({
      wireline: { url: "https://botbound.me/mcp" },
    });
    expect(JSON.stringify(directoryMcp)).not.toMatch(
      /sk-|api[_-]?key|client_secret|Authorization/i,
    );
  });

  it("publishes a one-click Cursor install link without secrets", () => {
    const install =
      "cursor://anysphere.cursor-deeplink/mcp/install?name=wireline&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLm1lL21jcCJ9";
    const encodedConfig = new URL(install).searchParams.get("config");
    expect(encodedConfig).not.toBeNull();
    expect(JSON.parse(Buffer.from(encodedConfig!, "base64").toString("utf8"))).toEqual({
      url: "https://botbound.me/mcp",
    });
    expect(publicDocs).toContain(install.replace("&", "&amp;"));
    expect(apps).toContain(install);
    expect(docs).toContain(install);
    expect(packet).toContain(install);
    expect(packet).toContain("https://cursor.directory/plugins/new");
  });

  it("teaches first-agent acquisition, not a repo voice SDK", () => {
    expect(plugin.description).toMatch(/Create a BotBound account/i);
    for (const source of [skill, rule, agent, docs, packet, publicDocs]) {
      expect(source).toMatch(/BotBound account|create an account/i);
      expect(source).toMatch(/first Bot|first agent|first-agent/i);
      expect(source.toLowerCase()).not.toContain("embed botbound voice agents in another repo");
      expect(source).not.toMatch(/\bvoice agents?\b/i);
    }
    expect(skill).toContain("not a software development kit");
    expect(publicDocs).toContain("not a repo voice SDK");
    expect(apps).toContain("Not a repo voice SDK");
    expect(apps).toContain("/cursor-plugin.html");
    expect(apps).toContain("BOTBOUND_PRODUCTION_ORIGIN");
    expect(apps).not.toContain("https://trywireline.com/mcp");
  });

  it("keeps Cursor OAuth callbacks on Cursor, not the BotBound server origin", () => {
    const registry = read("src/lib/mcp-client-registry.ts");
    expect(registry).toContain("cursor://anysphere.cursor-mcp/oauth/callback");
    expect(registry).toContain("https://www.cursor.com/agents/mcp/oauth/callback");
    expect(registry).toContain("http://localhost:8787/callback");
    expect(packet).toContain("http://localhost:8787/callback");
    expect(packet).toContain("Do not register `https://botbound.me/...` as Cursor's redirect URI");
    expect(docs).toContain("Cursor-operated callbacks");
    expect(docs).toContain("http://localhost:8787/callback");
    expect(read("src/routes/chatgpt-mcp-routes.ts")).toContain(
      "`/signin?redirect=${encodeURIComponent(authorizeUrl)}`",
    );
  });

  it("requires the Apps Training toggle before writes land", () => {
    expect(skill).toContain("Apps");
    expect(skill).toContain("train_wireline_agent");
    expect(panel).toContain("/api/mcp/connections");
    expect(panel).toContain("/api/mcp/coaching-writes");
    expect(panel).toContain("Allow connected apps to save Training");
    expect(read("src/lib/mcp-coaching-preferences.ts")).toContain(
      'MCP_COACHING_WRITES_KEY = "mcp_coaching_writes"',
    );
  });
});
