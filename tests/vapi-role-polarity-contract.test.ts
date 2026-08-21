import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isPrincipalVoiceRole } from "../src/lib/agent-role-definitions";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Vapi role identity polarity", () => {
  it("classifies only the principal-facing personal role as principal-facing", () => {
    expect(isPrincipalVoiceRole("personal_assistant")).toBe(true);
    expect(isPrincipalVoiceRole("sales")).toBe(false);
    expect(isPrincipalVoiceRole("receptionist")).toBe(false);
    expect(isPrincipalVoiceRole("ceo")).toBe(false);
    expect(isPrincipalVoiceRole(null)).toBe(false);
  });

  it("keys identity, escalation, quiet-hours, and greeting behavior off role rather than the legacy business flag", () => {
    const factory = read("src/lib/vapi-assistant-factory-v2.ts");

    expect(factory).toContain("const principalFacing = isPrincipalVoiceRole(configured.role)");
    expect(factory).not.toContain("const isBusinessAgent = configured.isBusinessAgent !== false");
    expect(factory).toContain("a BotBound Bot for your principal");
    expect(factory).not.toContain("a personal BotBound Bot");
    expect(factory).toContain("## QUIET-HOURS MODE");
    expect(factory).toContain("## AFTER-HOURS MODE");
    expect(factory).toMatch(/configured\.escalationPhone \|\| configured\.escalationEmail[\s\S]*\? principalFacing/);
    expect(factory).toMatch(/const systemPrompt = afterHours[\s\S]*\? principalFacing/);
    expect(factory).toMatch(/const afterHoursGreeting = afterHours[\s\S]*\(principalFacing/);
  });
});
