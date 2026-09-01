import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BOT_MARK_CHOICES,
  BOT_MARK_IDENTITY_CAPACITY,
  BOT_MARK_MOTIFS,
  BOT_MARK_PALETTES,
  botMarkFor,
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
} from "../src/lib/bot-mark";
import { nextAvailableRadioIndex } from "../src/components/BotMarkPicker";
import { parsePostCreateWizardPayload } from "../src/lib/wireline-create-flow";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer-selectable Bot identity marks", () => {
  it("covers published and add-on capacity with stable, non-repeating identities", () => {
    expect(BOT_MARK_MOTIFS).toHaveLength(15);
    expect(BOT_MARK_PALETTES).toHaveLength(8);
    expect(BOT_MARK_CHOICES).toHaveLength(120);
    expect(BOT_MARK_IDENTITY_CAPACITY).toBe(120);
    expect(new Set(BOT_MARK_CHOICES.map((choice) => choice.key)).size).toBe(120);
    expect(new Set(BOT_MARK_CHOICES.map((choice) => choice.motif)).size).toBe(15);
    expect(BOT_MARK_CHOICES.every((choice) => isBotMarkKey(choice.key))).toBe(true);
    expect(isBotMarkKey("forged-mark")).toBe(false);
    expect(defaultBotMarkKey("agent-123")).toBe(defaultBotMarkKey("agent-123"));
    expect(botMarkFor({ seed: "agent-123", markKey: "spark-rose" }).key).toBe("spark-rose");
    const unavailable = BOT_MARK_CHOICES.slice(0, 119).map((choice) => choice.key);
    expect(firstAvailableBotMarkKey("agent-123", unavailable)).toBe(BOT_MARK_CHOICES[119].key);
    expect(
      firstAvailableBotMarkKey(
        "agent-123",
        BOT_MARK_CHOICES.map((choice) => choice.key),
      ),
    ).toBe(null);
  });

  it("allocates the full catalog without duplicates and uses every motif first", () => {
    const allocated = new Set<string>();
    const firstMotifs = new Set<string>();

    for (let index = 0; index < BOT_MARK_IDENTITY_CAPACITY; index += 1) {
      const key = firstAvailableBotMarkKey(`agent-${index}`, allocated);
      expect(key).not.toBeNull();
      allocated.add(key!);
      if (index < BOT_MARK_MOTIFS.length) {
        firstMotifs.add(BOT_MARK_CHOICES.find((choice) => choice.key === key)!.motif);
      }
    }

    expect(allocated.size).toBe(BOT_MARK_IDENTITY_CAPACITY);
    expect(firstMotifs.size).toBe(BOT_MARK_MOTIFS.length);
    expect(firstAvailableBotMarkKey("agent-over-capacity", allocated)).toBeNull();
  });

  it("lets customers choose at creation and change the mark in Studio", () => {
    const picker = read("src/components/BotMarkPicker.tsx");
    const create = read("src/components/CreateAgentDialog.tsx");
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");

    expect(picker).toContain("BOT_MARK_CHOICES.find");
    expect(picker).toContain("BOT_MARK_MOTIFS.map");
    expect(picker).toContain("BOT_MARK_PALETTES.map");
    expect(picker).toContain('role="radiogroup"');
    expect(picker).toContain('role="radio"');
    expect(picker).toContain("aria-checked={selectedMotif}");
    expect(picker).toContain("aria-checked={selectedPalette}");
    expect(create).toContain("<BotMarkPicker");
    expect(create).toContain("mark_key: markKey");
    expect(setup).toContain("<BotMarkPicker");
    expect(setup).toContain('method: "PATCH"');
    expect(setup).toContain("mark_key: setupMarkKey");
  });

  it("supports wrapped arrow, Home, and End navigation while skipping unavailable marks", () => {
    const available = (index: number) => !new Set([1, 3]).has(index);

    expect(nextAvailableRadioIndex("ArrowRight", 0, 5, available)).toBe(2);
    expect(nextAvailableRadioIndex("ArrowLeft", 0, 5, available)).toBe(4);
    expect(nextAvailableRadioIndex("ArrowDown", 4, 5, available)).toBe(0);
    expect(nextAvailableRadioIndex("Home", 4, 5, available)).toBe(0);
    expect(nextAvailableRadioIndex("End", 0, 5, available)).toBe(4);
    expect(nextAvailableRadioIndex("Enter", 0, 5, available)).toBeNull();
    expect(nextAvailableRadioIndex("ArrowRight", 0, 2, () => false)).toBeNull();
  });

  it("carries the persisted mark into every post-create live-test face", () => {
    const create = read("src/components/CreateAgentDialog.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const roleplay = read("src/components/RoleplaySandbox.tsx");
    const openai = read("src/components/OpenAILiveVoiceSandbox.tsx");
    const liveVoice = read("src/components/LiveVoiceSandbox.tsx");

    const parsed = parsePostCreateWizardPayload(
      JSON.stringify({
        agentId: "agent-test",
        agentName: "Jordan",
        markKey: "spark-rose",
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      }),
    );
    expect(parsed?.markKey).toBe("spark-rose");
    expect(
      parsePostCreateWizardPayload(
        JSON.stringify({ agentId: "agent-test", agentName: "Jordan", markKey: "forged-mark" }),
      )?.markKey,
    ).toBe(null);

    expect(create).toContain("markKey: isBotMarkKey(body.mark_key) ? body.mark_key : null");
    expect(wizard).toContain("markKey={payload.markKey}");
    expect(roleplay).toContain("markKey={markKey}");
    expect(openai).toContain("markKey?: BotMarkKey | null");
    expect(openai).toContain("markKey={markKey}");
    expect(liveVoice).toContain('export { default } from "./OpenAILiveVoiceSandbox"');
  });

  it("persists only catalog values through an owner-scoped API and database constraint", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const schema = read("src/db/schema-base.ts");
    const migration = read("drizzle/migrations/0166_agent_identity_marks.sql");

    expect(routes).toContain('"/api/agents/:id/mark"');
    expect(routes).toContain("isBotMarkKey(markKey)");
    expect(routes).toContain("BOT_MARK_CONFLICT");
    expect(routes).toContain("defaultBotMarkKey(agent.id)) === markKey");
    expect(routes).toContain('databaseError.code === "23505"');
    expect(routes).toContain('databaseError.constraint === "uq_wireline_agents_user_mark_key"');
    expect(routes).toContain('databaseError.code === "23514"');
    expect(routes).toContain('databaseError.constraint === "wireline_agents_mark_key_check"');
    expect(routes).toContain("eq(schema.agents.userId, req.user.id)");
    expect(schema).toContain('markKey: text("mark_key")');
    expect(migration).toContain("wireline_agents_mark_key_check");
    expect(migration).toContain("uq_wireline_agents_user_mark_key");
    expect(migration).toContain("WHERE mark_key IS NOT NULL");
    expect(migration).toContain("assign_wireline_agent_mark_key");
    expect(migration).toContain("HAVING count(*) > 120");
    expect(migration).toContain("Bot identity backfill left unassigned agents");
    for (const motif of BOT_MARK_MOTIFS) {
      expect(migration).toContain(`'${motif.key}'`);
    }
    for (const palette of BOT_MARK_PALETTES) {
      expect(migration).toContain(`'${palette.key}'`);
    }
  });

  it("assigns a unique persisted mark through every Bot creation path", () => {
    const web = read("src/routes/agent-routes-v2.ts");
    const mobile = read("src/routes/mobile-routes.ts");
    const draft = read("src/lib/agent-draft-service.ts");
    const founder = read("src/lib/founder-fleet-seed.ts");

    for (const source of [web, mobile, draft, founder]) {
      expect(source).toContain("firstAvailableBotMarkKey");
      expect(source).toContain("schema.agents.markKey");
      expect(source).toContain("markKey");
    }
    expect(web).toContain("BOT_MARK_CONFLICT");
    expect(mobile).toContain('kind: "mark_capacity"');
    expect(draft).toContain('"BOT_MARK_CAPACITY_REACHED"');
    expect(founder).toContain("pg_advisory_xact_lock");
    expect(founder).toContain("hashtext(${template.id})");
    expect(founder).toContain("namespacedCollision.userId !== userId");
    expect(founder).toContain("const tenantScope = founderAssistantAgentScope(agentId, userId)");
    expect(founder).toContain(".where(tenantScope)");
  });

  it("reserves customer Bot marks for authenticated product surfaces", () => {
    for (const path of [
      "src/components/marketing/WireAgentLanding.tsx",
      "src/components/marketing/BrowserCallWidget.tsx",
      "src/pages/Showcase.tsx",
      "src/pages/SolutionsPage.tsx",
    ]) {
      const source = read(path);
      expect(source, path).not.toContain("<BotMark");
      expect(source, path).not.toContain("markKey");
    }

    const publicDemo = read("src/components/marketing/BrowserCallWidget.tsx");
    expect(publicDemo).toContain("Headphones");
    expect(publicDemo).not.toContain("AudioWaveform");
  });

  it("carries unique Bot identities through Insights and the full MCP workspace list", () => {
    const insightsRoute = read("src/routes/insights-routes.ts");
    const insightsType = read("src/types/api-insights.ts");
    const leaderboard = read("src/components/insights/LeaderboardView.tsx");
    const mcp = read("src/routes/chatgpt-mcp-account-routes.ts");

    expect(insightsRoute).toContain("markKey: schema.agents.markKey");
    expect(insightsRoute).toContain("mark_key: a.markKey");
    expect(insightsType).toContain("mark_key: BotMarkKey | null");
    expect(leaderboard).toContain('import BotMark from "../BotMark"');
    expect(leaderboard).toContain("markKey={a.mark_key}");
    expect(leaderboard).toContain("seed={a.agent_id}");

    expect(mcp).toContain('import { BOT_MARK_IDENTITY_CAPACITY } from "../lib/bot-mark"');
    expect(mcp).toContain("maxItems: BOT_MARK_IDENTITY_CAPACITY");
    expect(mcp).toContain('mark_key: { type: ["string", "null"] }');
    expect(mcp).toContain('required: ["id", "name", "mark_key", "role", "channel"]');
    expect(mcp).toContain("markKey: schema.agents.markKey");
    expect(mcp).toContain("mark_key: agent.markKey");
    expect(mcp).toContain(".orderBy(asc(schema.agents.createdAt), asc(schema.agents.id))");
    expect(mcp).toContain(".limit(BOT_MARK_IDENTITY_CAPACITY)");
    expect(mcp).not.toContain(".limit(20)");
  });
});
