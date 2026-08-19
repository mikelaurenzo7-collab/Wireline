import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const mojibake = /\u00c2|\u00e2|\ufffd/;

describe("native unified Bot workspace surfaces", () => {
  it("keeps iOS navigation and Overview aligned with the one-workspace Bot model", () => {
    const tabs = read("ios/Wireline/Views/RootTabView.swift");
    const workspace = read("ios/Wireline/Views/WorkspaceView.swift");
    const calls = read("ios/Wireline/Views/CallsView.swift");

    expect(tabs).toContain('Label("OVERVIEW"');
    expect(tabs).toContain('Label("BOTS"');
    expect(tabs).toContain('Label("KNOWLEDGE"');
    expect(tabs).toContain('Label("CONNECT"');
    expect(tabs).toContain('Label("CALLS"');
    expect(workspace).toContain('.navigationTitle("OVERVIEW")');
    expect(workspace).toContain("Dispatch calls, waits, approvals, and follow-ups.");
    expect(workspace).toContain("Build a Voice Bot, Conversation Bot, Human Bot, business role, personal role, or custom Bot in the same workspace.");
    expect(calls).toContain('.navigationTitle("Calls")');
    expect(`${tabs}\n${workspace}\n${calls}`).not.toMatch(mojibake);
    expect(workspace).not.toContain("Consumer-first");
  });

  it("keeps Android navigation on the same workspace taxonomy and approved voice-first identity", () => {
    const app = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
    const setup = read("android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt");

    expect(app).toContain('Screen("studio", "OVERVIEW")');
    expect(app).toContain('Screen("assistants", "BOTS")');
    expect(app).toContain('Screen("knowledge", "KNOWLEDGE")');
    expect(app).toContain('Screen("actions", "CONNECTIONS")');
    expect(app).toContain('Screen("recaps", "CALLS")');
    expect(app).toContain('contentDescription = "CREATE BOT"');
    expect(app).toContain("BOTS THAT GET THE WORK DONE");
    expect(app).toContain("Voice-first Bots for calls, live conversations, text, and email.");
    expect(app).not.toMatch(/voice agents?|phone employees?/i);
    expect(setup).toContain("Use mobile for fast approvals and core call workflows.");
    expect(`${app}\n${setup}`).not.toMatch(mojibake);
  });

  it("keeps Android Ask BotBound selectable chips buildable and operationally worded", () => {
    const ask = read("android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt");
    expect(ask).toContain("selectedAgentId");
    expect(ask).toContain("onClick = { selectedAgentId = bot.id }");
    expect(ask).toContain("containerColor = if (bot.id == selectedAgent?.id)");
    expect(ask).toContain("Open Calls to review them.");
    expect(ask).toContain("ASK BOTBOUND");
    expect(ask).not.toContain("main console");
    expect(ask).not.toMatch(mojibake);
  });
});
