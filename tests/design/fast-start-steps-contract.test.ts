import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fast Start step flow contract", () => {
  const createDialog = read("src/components/CreateAgentDialog.tsx");

  it("keeps create on a single brief-first screen", () => {
    expect(createDialog).toContain("What should this employee handle?");
    expect(createDialog).toContain("One sentence is enough.");
    expect(createDialog).toContain('aria-label="Employee type"');
    expect(createDialog).toContain('aria-label="Quick briefs"');
    expect(createDialog).toContain("Create AI employee");
    expect(createDialog).toContain("Voice, phone, and testing come next in Studio.");
    expect(createDialog).not.toContain("useState<1 | 2>(1)");
    expect(createDialog).not.toMatch(/Step [12] ·/);
    expect(createDialog).not.toContain("continueToVoice");
  });

  it("hands off into Studio with the post-create wizard payload", () => {
    expect(createDialog).toContain("stashPostCreateWizard(wizardPayload)");
    expect(createDialog).toContain("onCreated?.(wizardPayload)");
    expect(createDialog).toMatch(
      /navigate\(`\/studio\?agent=\$\{encodeURIComponent\(body\.id\)\}`/,
    );
  });
});
