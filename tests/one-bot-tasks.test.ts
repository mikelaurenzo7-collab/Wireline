import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOL_NAME_VALUES, type AgentToolName } from "../src/lib/agent-capabilities";
import {
  ANOTHER_BOT_HREF,
  canOfferAnotherBot,
  canOfferAnotherLine,
  shouldOpenExistingBot,
} from "../src/lib/bot-roster-policy";
import { BOT_TASKS, botTaskTools, isBotTaskEnabled, setBotTaskEnabled } from "../src/lib/bot-tasks";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const everyTool = () => true;
const task = (id: string) => BOT_TASKS.find((candidate) => candidate.id === id)!;

describe("one Bot, one line roster policy", () => {
  it("offers another Bot only with none yet or to a workspace already running several", () => {
    expect(canOfferAnotherBot(0)).toBe(true);
    expect(canOfferAnotherBot(1)).toBe(false);
    expect(canOfferAnotherBot(2)).toBe(true);
  });

  it("sends a create link to the existing Bot unless Advanced asked for another", () => {
    expect(
      shouldOpenExistingBot({ createRequested: true, anotherRequested: false, botCount: 1 }),
    ).toBe(true);
    expect(
      shouldOpenExistingBot({ createRequested: true, anotherRequested: true, botCount: 1 }),
    ).toBe(false);
    expect(
      shouldOpenExistingBot({ createRequested: true, anotherRequested: false, botCount: 0 }),
    ).toBe(false);
    expect(
      shouldOpenExistingBot({ createRequested: true, anotherRequested: false, botCount: 3 }),
    ).toBe(false);
    expect(ANOTHER_BOT_HREF).toBe("/studio?create=1&another=1");
  });

  it("keeps one line per single-Bot business", () => {
    expect(canOfferAnotherLine({ lineCount: 0, botCount: 1 })).toBe(true);
    expect(canOfferAnotherLine({ lineCount: 1, botCount: 1 })).toBe(false);
    expect(canOfferAnotherLine({ lineCount: 1, botCount: 2 })).toBe(true);
  });

  it("wires the policy into Studio, the rail, the palette, Lines and Settings", () => {
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("shouldOpenExistingBot({");
    expect(read("src/components/WorkspaceShell.tsx")).toContain(
      "canOfferAnotherBot(agents.length)",
    );
    expect(read("src/components/studio/StudioContextChrome.tsx")).toContain(
      "canOfferAnotherBot(agents.length)",
    );
    expect(read("src/components/CommandBar.tsx")).toContain('command.id !== "create-bot"');
    expect(read("src/components/PhoneSetupPanel.tsx")).toContain("canOfferAnotherLine({");
    expect(read("src/pages/SettingsPage.tsx")).toContain("ANOTHER_BOT_HREF");
  });
});

describe("Bot tasks", () => {
  it("map only to real Bot actions", () => {
    const known = new Set<string>(AGENT_TOOL_NAME_VALUES);
    for (const item of BOT_TASKS) {
      expect(item.tools.length).toBeGreaterThan(0);
      for (const tool of item.tools) expect(known.has(tool)).toBe(true);
    }
  });

  it("turns a task on by adding its actions once", () => {
    const enabled = setBotTaskEnabled(["send_email"], task("book"), true, everyTool);
    expect(enabled).toEqual(["send_email", "check_calendar_availability", "book_appointment"]);
    expect(isBotTaskEnabled(task("book"), new Set(enabled), everyTool)).toBe(true);
    expect(setBotTaskEnabled(enabled, task("book"), true, everyTool)).toEqual(enabled);
  });

  it("turns a task off without removing an action another task still needs", () => {
    const shared = {
      id: "callbacks",
      label: "Callbacks",
      description: "test",
      tools: ["schedule_callback"] as AgentToolName[],
    };
    const tasks = [...BOT_TASKS, shared];
    const enabled = setBotTaskEnabled(
      setBotTaskEnabled([], task("messages"), true, everyTool, tasks),
      shared,
      true,
      everyTool,
      tasks,
    );
    const off = setBotTaskEnabled(enabled, task("messages"), false, everyTool, tasks);
    expect(off).toEqual(["schedule_callback"]);
    expect(isBotTaskEnabled(task("messages"), new Set(off), everyTool)).toBe(false);
    expect(isBotTaskEnabled(shared, new Set(off), everyTool)).toBe(true);
  });

  it("ignores actions this workspace cannot configure", () => {
    const noTexts = (tool: AgentToolName) => tool !== "send_text_message";
    expect(botTaskTools(task("text"), noTexts)).toEqual(["lookup_phone_number"]);
    expect(isBotTaskEnabled(task("text"), new Set(["lookup_phone_number"]), noTexts)).toBe(true);
    expect(read("src/components/AgentToolPermissions.tsx")).toContain('aria-label="Bot tasks"');
  });
});
