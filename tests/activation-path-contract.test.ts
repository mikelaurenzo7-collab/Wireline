import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("routes fresh signups into studio create flow", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain("/studio?create=1");
  });

  it("documents ops activation checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("mounts activation checklist on overview", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("ActivationChecklist");
  });

  it("aligns activation checklist with fleet setup progress (6 steps, live call gate)", () => {
    const checklist = read("src/components/ActivationChecklist.tsx");
    const progress = read("src/lib/fleet-setup-progress.ts");
    expect(progress).toContain("FLEET_SETUP_STEP_COUNT = 6");
    expect(checklist).toContain('id: "live"');
    expect(checklist).toContain('id: "test"');
    expect(checklist).toContain('id: "approve"');
    expect(checklist).toContain("No training required for a quick browser preview");
  });
});
