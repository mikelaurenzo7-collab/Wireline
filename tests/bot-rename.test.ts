import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../src/db/schema";
import {
  compileAgentRuntimeInstructions,
  normalizeAgentCustomization,
  profileToBusinessVariables,
} from "../src/lib/agent-customization";
import { generatedBotGreeting } from "../src/lib/bot-name";

/**
 * A rename has to reach every place a Bot's name is kept, or a caller hears
 * the old one. These run the rename itself against a stand-in for the
 * transaction, and the two routes that call it.
 */
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  agent: null as Record<string, unknown> | null,
  rules: [] as Array<{ id: bigint; content: string }>,
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  locked: false,
}));
const tx = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => {
        if (table === schema.agents) {
          return {
            limit: () => ({
              for: async (mode: string) => {
                h.locked = mode === "update";
                return h.agent ? [h.agent] : [];
              },
            }),
          };
        }
        return Promise.resolve(h.rules);
      },
    }),
  }),
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: async () => {
        h.updates.push({ table, values });
      },
    }),
  }),
};
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method} ${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ agentMutationRateLimit: () => {} }));
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: vi.fn(),
  runTrainingImage: vi.fn(),
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: { transaction: (work: (handle: typeof tx) => unknown) => work(tx) },
}));
import "../src/routes/agent-routes-v2";
import { renameBot } from "../src/lib/bot-rename";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const rename = (name: string) =>
  renameBot(tx as never, { agentId: "bot-a", userId: "tenant-a", name });
const agentUpdate = () => h.updates.find((update) => update.table === schema.agents)?.values;
const ruleUpdates = () =>
  h.updates.filter((update) => update.table === schema.directives).map((update) => update.values);

beforeEach(() => {
  h.agent = {
    name: "Front Desk",
    firstMessage: generatedBotGreeting("Front Desk"),
    businessVariables: null,
    systemPromptOverride: null,
  };
  h.rules = [];
  h.updates = [];
  h.locked = false;
});

describe("renaming a Bot", () => {
  it("locks the Bot, then saves the name and the greeting it was created with", async () => {
    await expect(rename("Bo")).resolves.toEqual({
      name: "Bo",
      greeting: "Hi, this is Bo. How can I help?",
    });
    expect(h.locked).toBe(true);
    expect(agentUpdate()).toEqual({ name: "Bo", firstMessage: "Hi, this is Bo. How can I help?" });
    expect(ruleUpdates()).toEqual([]);
  });

  it("rewrites the opening greeting rule too, because a call reads the rule first", async () => {
    // Set Up saves the greeting box as a rule even when nobody changed its text.
    h.rules = [{ id: 7n, content: "Opening greeting: Hi, this is Front Desk. How can I help?" }];
    await rename("Nora");
    expect(agentUpdate()).toEqual({
      name: "Nora",
      firstMessage: "Hi, this is Nora. How can I help?",
    });
    expect(ruleUpdates()).toEqual([
      { content: "Opening greeting: Hi, this is Nora. How can I help?" },
    ]);
  });

  it("changes only the name when the owner wrote the greeting", async () => {
    h.rules = [{ id: 7n, content: "Opening greeting: Thanks for calling Ridge Dental." }];
    await expect(rename("Nora")).resolves.toEqual({ name: "Nora", greeting: null });
    expect(agentUpdate()).toEqual({ name: "Nora" });
    expect(ruleUpdates()).toEqual([]);

    h.updates = [];
    h.rules = [];
    h.agent = { ...h.agent, firstMessage: "Hi, this is Michael at the front desk." };
    await rename("Nora");
    expect(agentUpdate()).toEqual({ name: "Nora" });
  });

  it("gives a Bot with no greeting saved the one for its new name", async () => {
    h.agent = { ...h.agent, firstMessage: null };
    await rename("Bo");
    expect(agentUpdate()).toEqual({ name: "Bo", firstMessage: "Hi, this is Bo. How can I help?" });
  });

  it("renames a Bot made in a connected app inside its own profile and instructions", async () => {
    const profile = normalizeAgentCustomization({
      agent_name: "Front Desk",
      business_name: "Ridge Dental",
    });
    h.agent = {
      name: "Front Desk",
      firstMessage: generatedBotGreeting("Front Desk"),
      businessVariables: {
        ...profileToBusinessVariables(profile),
        customizationProfile: profile,
        callDelivery: { speakingRate: 1.1 },
      },
      systemPromptOverride: compileAgentRuntimeInstructions(profile),
    };
    await rename("Bo");
    const saved = agentUpdate()!;
    const variables = saved.businessVariables as Record<string, any>;
    expect(variables.customizationProfile.identity.name).toBe("Bo");
    expect(variables.customizationProfile.identity.businessName).toBe("Ridge Dental");
    // Whatever else is kept beside the profile stays.
    expect(variables.callDelivery).toEqual({ speakingRate: 1.1 });
    expect(saved.systemPromptOverride).toContain("You are Bo, a receptionist for Ridge Dental.");
    expect(saved.systemPromptOverride).not.toContain("Front Desk");
  });

  it("leaves instructions the owner has edited by hand as they wrote them", async () => {
    const profile = normalizeAgentCustomization({ agent_name: "Front Desk" });
    h.agent = {
      name: "Front Desk",
      firstMessage: "Welcome to Ridge Dental.",
      businessVariables: { customizationProfile: profile },
      systemPromptOverride: "You are Front Desk. Only ever discuss teeth.",
    };
    await rename("Bo");
    const saved = agentUpdate()!;
    expect(saved).not.toHaveProperty("systemPromptOverride");
    expect(saved).not.toHaveProperty("firstMessage");
    expect(
      (saved.businessVariables as Record<string, any>).customizationProfile.identity.name,
    ).toBe("Bo");
  });

  it("does nothing for a Bot the owner does not have", async () => {
    h.agent = null;
    await expect(rename("Bo")).resolves.toBeNull();
    expect(h.updates).toEqual([]);
  });
});

describe("the Name field's route", () => {
  async function save(body: unknown) {
    const json = vi.fn();
    await h.routes.get("patch /api/agents/:id/name")!(
      { user: { id: "tenant-a" }, params: { id: "bot-a" }, body },
      { json },
    );
    return json;
  }

  it("saves a clean name and answers with it", async () => {
    const json = await save({ name: "  Nora \n Jane  " });
    expect(agentUpdate()).toMatchObject({ name: "Nora Jane" });
    expect(json).toHaveBeenCalledExactlyOnceWith({ id: "bot-a", name: "Nora Jane" });
  });

  it("keeps a name within the limit a new Bot's name has", async () => {
    await save({ name: "n".repeat(250) });
    expect(String(agentUpdate()!.name)).toHaveLength(100);
  });

  it.each([
    ["nothing", {}],
    ["an empty name", { name: "" }],
    ["only spaces", { name: " \n " }],
    ["a name that is not text", { name: { toString: "Bo" } }],
  ])("refuses %s and saves nothing", async (_label, body) => {
    await expect(save(body)).rejects.toMatchObject({ status: 400 });
    expect(h.updates).toEqual([]);
  });

  it("answers not found for a Bot the owner does not have", async () => {
    h.agent = null;
    await expect(save({ name: "Bo" })).rejects.toMatchObject({ status: 404 });
    expect(h.updates).toEqual([]);
  });
});

describe("a rename approved in chat", () => {
  it("is the same rename, so the greeting follows there too", () => {
    const routes = read("src/routes/agent-workspace-routes.ts");
    const handler = routes.slice(
      routes.indexOf('"/api/agents/:id/workspace/apply-change"'),
      routes.indexOf('"/api/agents/:id/workspace/toggle-tool"'),
    );
    const renameBranch = handler.slice(handler.indexOf('if (field === "name") {'));
    expect(renameBranch).toMatch(
      /^if \(field === "name"\) \{[\s\S]*?await renameBot\(tx, \{\s*agentId,\s*userId: req\.user\.id,\s*name: cleanBotName\(value\),\s*\}\);[\s\S]*?\} else \{\s*await tx\s*\.update\(schema\.agents\)/,
    );
    // The generic column write is the only other writer in this handler, and
    // it sits in the branch a rename does not take.
    expect(handler.match(/\.update\(schema\.agents\)/g)).toHaveLength(1);
  });
});
