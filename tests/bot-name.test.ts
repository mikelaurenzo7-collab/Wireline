import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveCreateFirstMessage } from "../src/lib/agent-create-defaults";
import { createBotConfiguration } from "../src/lib/bot-configuration";
import {
  DEFAULT_BOT_NAME,
  generatedBotGreeting,
  renamedBotFields,
  startingBotName,
} from "../src/lib/bot-name";
import { composeInboundOpening } from "../src/lib/voice/inbound-opening";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("the name every Bot starts with", () => {
  it("is Bo, for a workspace's first Bot whatever its role", () => {
    expect(DEFAULT_BOT_NAME).toBe("Bo");
    expect(startingBotName([], "Front Desk")).toBe("Bo");
    expect(startingBotName(["Nora", "Riley"], "Sales Rep Bot")).toBe("Bo");
    expect(startingBotName([null, undefined, ""], "My Bot")).toBe("Bo");
    expect(createBotConfiguration("custom").name).toBe("Bo");
    expect(createBotConfiguration().name).toBe("Bo");
  });

  it("names the next Bot for its role once the workspace has a Bo", () => {
    expect(startingBotName(["Bo"], "Front Desk")).toBe("Front Desk");
    expect(startingBotName(["Nora", " bo "], "Sales Rep Bot")).toBe("Sales Rep Bot");
    // A longer name that only begins with it is another name.
    expect(startingBotName(["Bob", "Boone"], "Front Desk")).toBe("Bo");
  });

  it("is what the create dialog falls back to and shows in the empty field", () => {
    const dialog = read("src/components/CreateAgentDialog.tsx");
    expect(dialog).toContain("startingBotName(existingNames, roleName(templateKey))");
    expect(dialog).toContain("name.trim() || defaultName(templateKey, existingNames)");
    expect(dialog).toContain("placeholder={defaultName(templateKey, existingNames)}");
    expect(dialog).not.toContain("e.g. Nora or Alex");
  });

  it("gives a caller a name, not a job title", () => {
    expect(
      composeInboundOpening({
        greeting: resolveCreateFirstMessage(undefined, DEFAULT_BOT_NAME),
        agentName: DEFAULT_BOT_NAME,
        businessName: "Ridge Dental",
        recordingEnabled: false,
      }),
    ).toBe("Hi, I'm Bo, an AI assistant with Ridge Dental. How can I help?");
  });
});

describe("renaming a Bot", () => {
  it("takes the greeting with it while that is still the one the Bot was created with", () => {
    expect(generatedBotGreeting("Bo")).toBe("Hi, this is Bo. How can I help?");
    expect(resolveCreateFirstMessage(undefined, "Bo")).toBe(generatedBotGreeting("Bo"));
    expect(
      renamedBotFields(
        { name: "Front Desk", firstMessage: generatedBotGreeting("Front Desk") },
        "Bo",
      ),
    ).toEqual({ name: "Bo", firstMessage: "Hi, this is Bo. How can I help?" });
    expect(renamedBotFields({ name: "Front Desk", firstMessage: null }, "Bo")).toEqual({
      name: "Bo",
      firstMessage: "Hi, this is Bo. How can I help?",
    });
    expect(renamedBotFields({ name: "Front Desk", firstMessage: "  " }, "Bo")).toEqual({
      name: "Bo",
      firstMessage: "Hi, this is Bo. How can I help?",
    });
  });

  it("leaves a greeting the owner wrote exactly as it is", () => {
    for (const firstMessage of [
      "Thanks for calling BotBound. Are you looking into a Bot for your business?",
      // Even one that names the old Bot: it is the owner's sentence.
      "Hi, this is Michael at the front desk. How can I help?",
      "Hi, this is Someone Else. How can I help?",
    ]) {
      expect(renamedBotFields({ name: "Michael", firstMessage }, "Bo")).toEqual({ name: "Bo" });
    }
  });

  it("is a route of its own that locks the Bot, saves the name and never touches rules", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const route = routes.slice(routes.indexOf('"/api/agents/:id/name"'));
    const handler = route.slice(0, route.indexOf("router."));
    expect(handler).toContain("authenticateUser");
    expect(handler).toContain("agentMutationRateLimit");
    expect(handler).toContain("cleanText(req.body?.name, BOT_NAME_MAX_CHARS)");
    expect(handler).toContain('AppError.badRequest("Give your Bot a name.")');
    expect(handler).toContain('.for("update")');
    expect(handler).toContain("eq(schema.agents.userId, req.user.id)");
    expect(handler).toContain("renamedBotFields(current, name)");
    expect(handler).not.toContain("schema.directives");
  });
});
