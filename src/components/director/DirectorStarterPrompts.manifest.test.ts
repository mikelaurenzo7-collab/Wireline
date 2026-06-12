import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(import.meta.dirname, "DirectorStarterPrompts.tsx"), "utf8");

describe("DirectorStarterPrompts", () => {
  it("shows agent-editing prompts inside Agent Studio", () => {
    expect(SRC).toContain("STUDIO_AGENT_STARTER_PROMPTS");
    expect(SRC).toContain("Tell Director what to edit");
    expect(SRC).toContain("Name this agent and define its role");
    expect(SRC).toContain("Give this agent responsibilities, boundaries, and escalation rules");
    expect(SRC).toContain("Help me assign the right phone number and call behavior");
    expect(SRC).toContain("Connect the tools this role needs");
  });

  it("keeps fleet-management prompts for the standalone Director page", () => {
    expect(SRC).toContain("DIRECTOR_STARTER_PROMPTS");
    expect(SRC).toContain('location.pathname === "/agents"');
  });
});
