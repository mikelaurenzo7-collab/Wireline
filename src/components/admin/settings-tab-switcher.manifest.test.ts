/**
 * Static guard: Settings tab strip must not include Agents (fleet page is separate).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(import.meta.dirname, "SettingsTabSwitcher.tsx"), "utf8");

describe("SettingsTabSwitcher manifest", () => {
  it("does not link to /agents (Agents has its own sidebar item)", () => {
    expect(SRC).not.toMatch(/path:\s*"\/agents"/);
    expect(SRC).not.toContain('"agents"');
  });

  it("includes compliance and admin destinations under Settings hub", () => {
    expect(SRC).toContain('path: "/dnc"');
    expect(SRC).toContain('path: "/audit"');
    expect(SRC).toContain('path: "/integrations"');
    expect(SRC).toContain("tab=carrier");
  });
});
