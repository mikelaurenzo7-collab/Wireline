import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("routes every fresh signup into the same Studio create flow", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain('return "/studio?create=1"');
    expect(authRedirect).not.toContain('"/studio?create=1&posture=business"');
  });

  it("documents ops activation checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("mounts a unified Bot activation path on Overview and Studio", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    expect(overview).toContain("ActivationChecklist");
    expect(overview).toContain("FirstRunWorkspace");
    expect(overview).toContain("Build Your Bot");
    expect(overview).toContain("Create Your Own");
    expect(overview).toContain("Browse Templates");
    expect(overview).toContain('to="/studio?create=1"');
    expect(overview).toContain('to="/templates"');
    expect(overview).toContain("degraded && !hasBots");
    expect(overview).toContain("WorkspaceRecovery");
    expect(overview).not.toContain("posture=");
    expect(overview).not.toContain("personalAgents");
    expect(overview).not.toContain("businessAgents");
    expect(overview).not.toContain("dayGreeting");

    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(studio).toContain("Start with one job");
    expect(studio).toContain("Choose a role starter or make it entirely custom");
    expect(studio).toContain('to={createHref()}');
    expect(studio).not.toContain("posture=");
  });

  it("aligns activation checklist with fleet setup progress and the live call gate", () => {
    const checklist = read("src/components/ActivationChecklist.tsx");
    const progress = read("src/lib/fleet-setup-progress.ts");
    expect(progress).toContain("FLEET_SETUP_STEP_COUNT = 6");
    expect(checklist).toContain('id: "job"');
    expect(checklist).toContain('id: "facts"');
    expect(checklist).toContain('id: "line"');
    expect(checklist).toContain('id: "live"');
    expect(checklist).toContain('id: "review"');
    expect(checklist).toContain('href: "/approvals"');
    expect(checklist).toContain("First live customer handled");
  });

  it("isolates browser activation state per account", () => {
    const storage = read("src/lib/post-signup-onboarding.ts");
    const checklist = read("src/components/ActivationChecklist.tsx");
    const nudge = read("src/components/ActivationNudge.tsx");

    expect(storage).toContain("activationCelebratedStorageKey(scopeId)");
    expect(storage).toContain("${ACTIVATION_CELEBRATED_KEY}:${scopeId}");
    expect(checklist).toContain("markActivationCelebrated(activationScope)");
    expect(checklist).toContain("${DISMISS_KEY}:${activationScope}");
    expect(nudge).toContain("isActivationCelebrated(activationScope)");
    expect(nudge).toContain("accountId: activeAccount?.id");
    expect(nudge).toContain("scope: activationScope");
  });

  it("keeps post-create setup honest and focused", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    expect(wizard).toContain('["train", "wire", "test"]');
    expect(wizard).toContain("onTestCompleted");
    expect(wizard).toContain('event: "test_call_completed"');
    expect(wizard).toContain('result: "assistant_response_completed"');
    expect(wizard).toContain("testStarted ?");
    expect(wizard).toContain("Finish without a test");
    expect(copy).toContain("Optional: review what your agent learned");
    expect(copy).toContain('label: "Number"');
  });
});
