import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("workspace pulse contract", () => {
  it("uses the mounted dashboard stats endpoint instead of legacy daily brief routes", () => {
    const panel = read("src/components/DailyBrief.tsx");

    expect(panel).toContain('authFetch("/api/dashboard/stats")');
    expect(panel).toContain("Workspace pulse");
    expect(panel).not.toContain("/api/insights/daily-brief");
    expect(panel).not.toContain("/api/daily-brief/settings");
  });

  it("keeps pulse labels honest and useful", () => {
    const panel = read("src/components/DailyBrief.tsx");

    expect(panel).toContain("const summary = call.summary?.trim()");
    expect(panel).toContain("INTENT_LABELS[call.intent_label]");
    expect(panel).toContain("call.agent_name?.trim()");
    expect(panel).toContain("localDateKey(new Date())");
    expect(panel).not.toContain('call.intent_label || call.summary');
    expect(panel).not.toContain('const agent = call.agent_name || "Agent"');
  });
});
