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

  it("uses one visibility-aware low-frequency request for the global activation nudge", () => {
    const nudge = read("src/components/ActivationNudge.tsx");
    const progress = read("src/lib/fleet-setup-progress.ts");
    const routes = read("src/routes/activation-routes.ts");

    expect(nudge).toContain("fetchActivationNudgeStatus()");
    expect(nudge).not.toContain("fetchAssistantSetupProgress");
    expect(nudge).not.toContain("fetchActivationStatusFull");
    expect(nudge).not.toContain("authFetch(");
    expect(nudge).toContain('document.visibilityState !== "visible"');
    expect(nudge).toContain('document.addEventListener("visibilitychange"');
    expect(nudge).toContain('document.removeEventListener("visibilitychange"');
    expect(nudge).toContain("120_000");
    expect(progress).toContain('authFetch("/api/activation/nudge-status")');
    expect(routes).toMatch(
      /router\.get\(\s*"\/api\/activation\/nudge-status",\s*authenticateUser,/,
    );
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store")');
  });
});
