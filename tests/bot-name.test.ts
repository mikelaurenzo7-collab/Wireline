import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveCreateFirstMessage } from "../src/lib/agent-create-defaults";
import { resolveAgentGreeting } from "../src/lib/agent-greeting";
import {
  BOT_NAME_MAX_CHARS,
  DEFAULT_BOT_NAME,
  cleanBotName,
  generatedBotGreeting,
  isGeneratedBotGreeting,
  planBotRename,
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
  });

  it("names the next Bot for its role once the workspace has a Bo", () => {
    expect(startingBotName(["Bo"], "Front Desk")).toBe("Front Desk");
    expect(startingBotName(["Nora", " bo "], "Sales Rep Bot")).toBe("Sales Rep Bot");
    // A longer name that only begins with it is another name.
    expect(startingBotName(["Bob", "Boone"], "Front Desk")).toBe("Bo");
    expect(startingBotName(["Bo"], "")).toBe("My Bot");
  });

  it("numbers a role the workspace already has, so no two Bots share a name", () => {
    expect(startingBotName(["Bo", "Front Desk"], "Front Desk")).toBe("Front Desk 2");
    expect(startingBotName(["Bo", "front  desk", "Front Desk 2"], "Front Desk")).toBe(
      "Front Desk 3",
    );
    const long = "R".repeat(BOT_NAME_MAX_CHARS);
    const numbered = startingBotName(["Bo", long], long);
    expect(numbered).toHaveLength(BOT_NAME_MAX_CHARS);
    expect(numbered.endsWith(" 2")).toBe(true);
  });

  it("is stored as one clean line", () => {
    expect(cleanBotName("  Nora \n  Jane ")).toBe("Nora Jane");
    expect(cleanBotName("x".repeat(300))).toHaveLength(BOT_NAME_MAX_CHARS);
    for (const value of [undefined, null, 7, {}, "   "]) expect(cleanBotName(value)).toBe("");
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

  it("is the name Bo's first conversation creates the account's one Bot with", () => {
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    // The Bot is created only when the account has none; the server checks
    // under its lock and hands back the existing Bot instead.
    expect(bo).toContain("name: DEFAULT_BOT_NAME,");
    expect(bo).toContain("only_if_none: true,");
    // The roster shows the name the server answered with.
    expect(bo).toContain(
      'name: typeof body.name === "string" && body.name ? body.name : DEFAULT_BOT_NAME,',
    );
    expect(bo).not.toContain("e.g. Nora or Alex");
  });
});

describe("the greeting a Bot is created with", () => {
  it("is one sentence shape, written in one place", () => {
    expect(generatedBotGreeting("Bo")).toBe("Hi, this is Bo. How can I help?");
    expect(generatedBotGreeting("  Front   Desk ")).toBe("Hi, this is Front Desk. How can I help?");
    expect(generatedBotGreeting("")).toBe("Hi, this is your Bot. How can I help?");
    expect(resolveCreateFirstMessage(undefined, "Bo")).toBe(generatedBotGreeting("Bo"));
    expect(resolveAgentGreeting({ name: "Bo", firstMessage: null })).toBe(
      generatedBotGreeting("Bo"),
    );
    expect(resolveAgentGreeting({ name: " ", firstMessage: " " })).toBe(generatedBotGreeting(""));
    // Every path that creates or renames a Bot uses it, never its own copy.
    for (const path of [
      "src/lib/agent-draft-service.ts",
      "src/routes/mobile-routes.ts",
      "src/lib/agent-greeting.ts",
      "src/lib/voice/inbound-opening.ts",
    ]) {
      expect(read(path), path).not.toMatch(/Hi, this is \$\{/i);
    }
  });

  it("is recognised whatever its capitals or spacing, and only for the Bot's own name", () => {
    expect(isGeneratedBotGreeting("hi, this is bo.  How can I help?", "Bo")).toBe(true);
    expect(isGeneratedBotGreeting("Hi, this is your Bot. How can I help?", "")).toBe(true);
    expect(isGeneratedBotGreeting("Hi, this is Bo. How can I help?", "Nora")).toBe(false);
    expect(isGeneratedBotGreeting("Hi, this is Bo. How can I help you?", "Bo")).toBe(false);
    expect(isGeneratedBotGreeting(null, "Bo")).toBe(false);
  });

  it("is never what a caller hears when the owner asked for their own words", () => {
    const opening = (greeting: string) =>
      composeInboundOpening({
        greeting,
        agentName: "Bo",
        businessName: "Ridge Dental",
        recordingEnabled: false,
        ownWords: true,
      });
    expect(opening(generatedBotGreeting("Bo"))).toBe(
      "Hey, I'm Bo with Ridge Dental. How can I help you?",
    );
    expect(opening("Ridge Dental, this is the front desk.")).toBe(
      "Ridge Dental, this is the front desk.",
    );
  });
});

describe("renaming a Bot", () => {
  it("takes the greeting with it while that is still the one the Bot was created with", () => {
    const followed = { name: "Bo", greeting: "Hi, this is Bo. How can I help?" };
    expect(
      planBotRename({ name: "Front Desk", firstMessage: generatedBotGreeting("Front Desk") }, "Bo"),
    ).toEqual(followed);
    expect(planBotRename({ name: "Front Desk", firstMessage: null }, "Bo")).toEqual(followed);
    expect(planBotRename({ name: "Front Desk", firstMessage: "  " }, "Bo")).toEqual(followed);
  });

  it("goes by the greeting a call would speak: the saved rule before the Bot's own field", () => {
    // Set Up saved the generated greeting as a rule. A call reads the rule
    // first, so it has to follow the name too.
    expect(
      planBotRename(
        {
          name: "Front Desk",
          firstMessage: generatedBotGreeting("Front Desk"),
          greetingRule: generatedBotGreeting("Front Desk"),
        },
        "Bo",
      ),
    ).toEqual({ name: "Bo", greeting: generatedBotGreeting("Bo") });
    // The owner wrote the rule. What the Bot's own field still holds is not spoken.
    expect(
      planBotRename(
        {
          name: "Front Desk",
          firstMessage: generatedBotGreeting("Front Desk"),
          greetingRule: "Thanks for calling Ridge Dental.",
        },
        "Bo",
      ),
    ).toEqual({ name: "Bo" });
  });

  it("treats a greeting BotBound wrote for one of its own names as not the owner's", () => {
    // Renamed in chat before this release: the name moved on, the greeting did not.
    const stale = { name: "Nora", firstMessage: "Hi, this is Front Desk. How can I help?" };
    expect(planBotRename(stale, "Max")).toEqual({
      name: "Max",
      greeting: "Hi, this is Max. How can I help?",
    });
    for (const firstMessage of [
      "Hi, this is My Bot. How can I help?",
      "Hi, this is Sales Rep Bot. How can I help?",
      "Hi, this is Bo. How can I help?",
    ]) {
      expect(planBotRename({ name: "Nora", firstMessage }, "Max")).toHaveProperty("greeting");
    }
    // Nor is it spoken word for word when the owner chose their own words.
    expect(
      composeInboundOpening({
        greeting: stale.firstMessage,
        agentName: "Nora",
        businessName: "Ridge Dental",
        recordingEnabled: false,
        ownWords: true,
      }),
    ).toBe("Hey, I'm Nora with Ridge Dental. How can I help you?");
  });

  it("leaves a greeting the owner wrote exactly as it is", () => {
    for (const firstMessage of [
      "Thanks for calling BotBound. Are you looking into a Bot for your business?",
      // Even one that names the old Bot: it is the owner's sentence.
      "Hi, this is Michael at the front desk. How can I help?",
      // The created shape with another name in it is also one somebody wrote.
      "Hi, this is Ridge Dental. How can I help?",
    ]) {
      expect(planBotRename({ name: "Michael", firstMessage }, "Bo")).toEqual({ name: "Bo" });
    }
  });
});
