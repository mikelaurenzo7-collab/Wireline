import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fast Start step flow contract", () => {
  const createDialog = read("src/components/CreateAgentDialog.tsx");

  it("splits create into brief and voice steps with gated submit", () => {
    expect(createDialog).toContain("useState<1 | 2>(1)");
    expect(createDialog).toContain("Step 1 · Brief and name");
    expect(createDialog).toContain("Step 2 · Optional details");
    expect(createDialog).toContain("step === 1");
    expect(createDialog).toContain("continueToVoice");
    expect(createDialog).toContain("Create AI employee");
    expect(createDialog).toContain("if (step === 1 || creating) return");
    expect(createDialog).toContain("What do you need handled?");
    expect(createDialog).toContain("Ready to create");
    expect(createDialog).toMatch(/Create now,\s*or personalize any detail below\./);
    expect(createDialog).not.toMatch(/Step 1 · Brief, voice, and face/);
  });

  it("keeps the progress indicator compatible with the production CSP", () => {
    expect(createDialog).toContain('step === 1 ? "w-2/5" : "w-4/5"');
    expect(createDialog).not.toMatch(/style=\{\{\s*width:\s*step === 1/);
  });
});
