import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("MCP coaching and first-agent contract", () => {
  const account = read("src/routes/chatgpt-mcp-account-routes.ts");
  const settings = read("src/routes/mcp-coaching-settings-routes.ts");
  const registry = read("src/server/register-api-routes.ts");
  const coaching = read("src/lib/mcp-agent-coaching.ts");

  it("keeps the private-voice slice contiguous for dual-voice and cost contracts", () => {
    const voice = account.indexOf('name: "start_private_voice_simulation"');
    const list = account.indexOf('name: "list_botbound_agents"');
    expect(voice).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(voice);
    expect(account.slice(voice, list)).not.toContain('name: "get_agent_coaching_brief"');
    expect(account.slice(voice, list)).not.toContain('name: "train_botbound_agent"');
  });

  it("fails Training writes closed until the Apps toggle is true", () => {
    expect(account).toContain("readMcpCoachingWritesEnabled");
    expect(account).toContain("Enable connected-app Training writes in BotBound Apps");
    expect(settings).toContain('router.post(\n  "/api/mcp/coaching-writes"');
    expect(settings).toContain("revokeAllMcpGrantsForUser");
    expect(settings).not.toContain("token_hash");
    expect(settings).not.toContain("t.access_token");
    expect(settings).not.toContain("refresh_token");
    expect(registry).toContain("mcpCoachingSettingsRouter");
    expect(registry.indexOf("userPreferenceGuardRouter")).toBeLessThan(
      registry.indexOf("mcpCoachingSettingsRouter"),
    );
  });

  it("returns owner-authored Training only and never a phone number", () => {
    expect(coaching).toContain("select({ id: schema.phoneNumbers.id })");
    expect(coaching).not.toContain("schema.phoneNumbers.number");
    expect(coaching).not.toContain("transcript");
    expect(coaching).not.toContain("recording");
    expect(account).toContain("owner-authored Training facts");
    expect(account).toContain("create_first_voice_agent");
    expect(account).toContain("MCP_PROMPT_MESSAGES");
    expect(account).toContain("this is a first-agent session");
    expect(account).toContain("Do not place a live call or claim a customer was contacted");
  });
});
