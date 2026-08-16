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
    expect(overview).toContain("FirstRunLaunchpad");
    expect(overview).toContain("Start with one job.");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(studio).toContain("Start with one job.");
    expect(studio).toContain("Give it one customer job. You can change everything later.");
    expect(studio).not.toContain("Start with one customer-facing job.");
    expect(studio).toContain('{posture === "personal" ? (');
    expect(overview).toContain("{language.createCta}");
    expect(overview).toContain("dayGreeting()");
    expect(overview).toContain("workspaceFirstName(");
    expect(overview).not.toContain("Let's put your first");
    expect(overview).not.toContain("text-center");
    expect(overview).toContain('className="relative wl-overview-greeting text-left"');
    expect(overview).not.toContain("Reliable voice and behavior defaults are already selected.");
    expect(overview).not.toContain("start the founder pair with personal + business");
    expect(overview).toContain("degraded && !hasAgents");
    expect(overview).toContain("WorkspaceRecovery");
  });

  it("aligns activation checklist with fleet setup progress (live call gate)", () => {
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
