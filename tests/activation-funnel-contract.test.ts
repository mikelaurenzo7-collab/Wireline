import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("activation funnel surface contract", () => {
  it("mounts ActivationNudge in the authenticated workspace shell", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(shell).toContain("ActivationNudge");
  });

  it("emits first-call-made once when tenant activation is recorded", () => {
    const nudge = read("src/components/ActivationNudge.tsx");
    expect(nudge).toContain("emitProductEventOnce");
    expect(nudge).toContain('event: "first_call_completed"');
    expect(nudge).toContain("isRecentActivation");
  });
});
