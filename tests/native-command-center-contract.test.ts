import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const mojibake = /\u00c2|\u00e2|\ufffd/;

describe("native unified Bot workspace surfaces", () => {
  it("keeps iOS navigation aligned with the unified workspace", () => {
    const tabs = read("ios/Wireline/Views/RootTabView.swift");
    const calls = read("ios/Wireline/Views/CallsView.swift");
    expect(tabs).toContain('Label("OVERVIEW"');
    expect(tabs).toContain('Label("BOTS"');
    expect(tabs).toContain('Label("KNOWLEDGE"');
    expect(tabs).toContain('Label("CONNECT"');
    expect(tabs).toContain('Label("CALLS"');
    expect(calls).toContain('.navigationTitle("Calls")');
    expect(`${tabs}\n${calls}`).not.toMatch(mojibake);
  });

  it("keeps Android navigation aligned with the same workspace taxonomy", () => {
    const app = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
    expect(app).toContain('Screen("studio", "OVERVIEW")');
    expect(app).toContain('Screen("assistants", "BOTS")');
    expect(app).toContain('Screen("knowledge", "KNOWLEDGE")');
    expect(app).toContain('Screen("actions", "CONNECTIONS")');
    expect(app).toContain('Screen("recaps", "CALLS")');
    expect(app).toContain('contentDescription = "CREATE BOT"');
    expect(app).not.toMatch(/phone employees?/i);
    expect(app).not.toMatch(mojibake);
  });

  it("keeps Android Ask Wireline selectable chips buildable and operationally worded", () => {
    const ask = read("android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt");
    expect(ask).toContain("val isSelected = agent.id == selectedAgentId");
    expect(ask).toContain("Review them in Calls.");
    expect(ask).toContain("Try these commands:");
    expect(ask).not.toContain("main console");
    expect(ask).not.toMatch(mojibake);
  });
});
