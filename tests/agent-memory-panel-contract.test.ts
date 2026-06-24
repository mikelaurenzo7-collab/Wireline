import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("agent panel", () => {
  it("uses canonical interface elements", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/AgentMemoryPanel.tsx"), "utf8");
    expect(panel).toContain("StatusNotice");
    expect(panel).toContain("Conversation thread");
    expect(panel).toContain("/workspace/overview");
  });
});
