import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const mojibake = /\u00c2|\u00e2|\ufffd/;

describe("native command center surfaces", () => {
  it("positions iOS navigation for business command-center work", () => {
    const tabs = read("ios/Wireline/Views/RootTabView.swift");
    const workspace = read("ios/Wireline/Views/WorkspaceView.swift");
    const calls = read("ios/Wireline/Views/CallsView.swift");

    expect(tabs).toContain('Label("Command"');
    expect(tabs).toContain('Label("Calls"');
    expect(workspace).toContain("Native command center for personal and business plans");
    expect(workspace).toContain("Dispatch calls, waits, approvals, and follow-ups.");
    expect(calls).toContain('.navigationTitle("Calls")');
    expect(`${tabs}\n${workspace}\n${calls}`).not.toMatch(mojibake);
    expect(workspace).not.toContain("Consumer-first");
  });

  it("positions Android navigation for business command-center work", () => {
    const app = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
    const setup = read("android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt");

    expect(app).toContain('Screen("studio", "Command")');
    expect(app).toContain('Screen("recaps", "Calls")');
    expect(app).toContain("COMMAND CENTER");
    expect(app).toContain(
      "AI voice agents for appointments, lead revival, promotions, and follow-up.",
    );
    expect(app).not.toMatch(/phone employees?/i);
    expect(setup).toContain("Use mobile for fast approvals and core call workflows.");
    expect(`${app}\n${setup}`).not.toMatch(mojibake);
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
