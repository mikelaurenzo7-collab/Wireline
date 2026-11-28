import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_NAME_VALUES,
  ALWAYS_ON_AGENT_TOOL_NAMES,
  type AgentToolName,
} from "../src/lib/agent-capabilities";
import { canOfferAnotherLine } from "../src/lib/bot-roster-policy";
import { BOT_TASKS, botTaskTools, isBotTaskEnabled, setBotTaskEnabled } from "../src/lib/bot-tasks";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const everyTool = () => true;
const task = (id: string) => BOT_TASKS.find((candidate) => candidate.id === id)!;

describe("one Bot, one line roster policy", () => {
  it("offers no way to create another Bot: an account without one meets Bo", () => {
    const policy = read("src/lib/bot-roster-policy.ts");
    expect(policy).not.toMatch(/canOfferAnotherBot|shouldOpenExistingBot|ANOTHER_BOT_HREF/);
    const studio = read("src/pages/AgentStudioHome.tsx");
    expect(studio).toContain("<BoOnboarding");
    expect(studio).toContain('const RETIRED_CREATE_PARAMS = ["create", "another"] as const;');
    expect(read("src/routes/agent-routes-v2.ts")).toContain(
      "const onlyIfNone = req.body?.only_if_none === true;",
    );
  });

  it("keeps one line per single-Bot business", () => {
    expect(canOfferAnotherLine({ lineCount: 0, botCount: 1 })).toBe(true);
    expect(canOfferAnotherLine({ lineCount: 1, botCount: 1 })).toBe(false);
    expect(canOfferAnotherLine({ lineCount: 1, botCount: 2 })).toBe(true);
  });

  it("keeps add-a-Bot controls out of Studio, the rail, the palette and Settings", () => {
    for (const path of [
      "src/components/WorkspaceShell.tsx",
      "src/components/studio/StudioContextChrome.tsx",
      "src/components/CommandBar.tsx",
      "src/pages/SettingsPage.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("create=1");
      expect(source).not.toMatch(/Add a Bot|Add Bot|Create a Bot|"create-bot"/);
    }
    expect(read("src/components/PhoneSetupPanel.tsx")).toContain("canOfferAnotherLine({");
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
    const wide = {
      id: "wide",
      label: "Wide",
      description: "test",
      tools: ["create_support_ticket", "schedule_callback"] as AgentToolName[],
    };
    const shared = {
      id: "callbacks",
      label: "Callbacks",
      description: "test",
      tools: ["schedule_callback"] as AgentToolName[],
    };
    const tasks = [...BOT_TASKS, wide, shared];
    const enabled = setBotTaskEnabled(
      setBotTaskEnabled([], wide, true, everyTool, tasks),
      shared,
      true,
      everyTool,
      tasks,
    );
    const off = setBotTaskEnabled(enabled, wide, false, everyTool, tasks);
    expect(off).toEqual(["schedule_callback"]);
    expect(isBotTaskEnabled(wide, new Set(off), everyTool)).toBe(false);
    expect(isBotTaskEnabled(shared, new Set(off), everyTool)).toBe(true);
  });

  // Looking up what it was taught, taking a message and honouring a
  // do-not-call request are allowed to run whatever is ticked. They were
  // checkboxes all the same, and unticking one changed nothing.
  it("shows what every Bot does as always on, with nothing to switch", () => {
    const always = BOT_TASKS.filter((item) => item.alwaysOn);
    expect(always.map((item) => item.id)).toEqual(["answer", "messages", "dnc"]);
    expect(always.flatMap((item) => item.tools).sort()).toEqual(
      [...ALWAYS_ON_AGENT_TOOL_NAMES].sort(),
    );
    for (const item of always) {
      expect(isBotTaskEnabled(item, new Set(), everyTool)).toBe(true);
      expect(setBotTaskEnabled(["send_email"], item, false, everyTool)).toEqual(["send_email"]);
      expect(setBotTaskEnabled(["send_email"], item, true, everyTool)).toEqual(["send_email"]);
    }
    // No other task depends on one of them.
    for (const item of BOT_TASKS.filter((candidate) => !candidate.alwaysOn)) {
      for (const tool of item.tools) {
        expect(ALWAYS_ON_AGENT_TOOL_NAMES as readonly string[], item.id).not.toContain(tool);
      }
    }
    const panel = read("src/components/AgentToolPermissions.tsx");
    expect(panel).toContain("!ALWAYS_ON_TOOLS.has(tool.name) &&");
    expect(panel).toContain("Always on</span>");
  });

  it("ignores actions this workspace cannot configure", () => {
    const noTexts = (tool: AgentToolName) => tool !== "send_text_message";
    expect(botTaskTools(task("text"), noTexts)).toEqual(["lookup_phone_number"]);
    expect(isBotTaskEnabled(task("text"), new Set(["lookup_phone_number"]), noTexts)).toBe(true);
    expect(read("src/components/AgentToolPermissions.tsx")).toContain('aria-label="Bot tasks"');
  });
});
