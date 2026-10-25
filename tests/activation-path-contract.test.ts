import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("routes every fresh signup into the same Studio create flow", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain('return "/studio?create=1"');
    expect(authRedirect).not.toContain("create=1&posture=");
  });

  it("documents the deferred operations checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("keeps Bot activation direct in Studio while preserving the legacy Overview path", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const studioSetup = read("src/components/StudioAgentWorkspacePanel.tsx");

    expect(overview).toContain("ActivationChecklist");
    expect(studioSetup).not.toContain("ActivationChecklist");
    expect(studioSetup).toContain("Bot Setup");
    expect(studioSetup).toContain('{applyingSetup ? "Saving…" : "Save Changes"}');
    expect(overview).toContain("FirstRunWorkspace");
    expect(overview).toContain("degraded && !hasBots");
    expect(overview).toContain("WorkspaceRecovery");
    expect(firstRun).toContain("Create Your Bot");
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain("Browse Templates");
    expect(firstRun).toContain('to="/studio?create=1"');
    expect(firstRun).toContain('to="/templates"');
    expect(studio).toContain("Create Your Bot");
    expect(studio).not.toMatch(/one (?:job|task)/i);
    expect(studio).toContain("BOT_LANGUAGE.setupPrompt");
    expect(studio).not.toContain("Describe the role and outcome.");
    expect(studio).toContain("to={createHref()}");
    expect(`${overview}\n${firstRun}\n${studio}`).not.toMatch(
      /posture=|personalAgents|businessAgents|dayGreeting/,
    );
  });

  it("aligns the activation checklist with verifiable live-work progress", () => {
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

  it("keeps post-create setup resumable, honest, and focused", () => {
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const billing = read("src/pages/BillingSettings.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    expect(wizard).toContain('value === "train"');
    expect(wizard).toContain('value === "wire"');
    expect(wizard).toContain('value === "test"');
    expect(wizard).toContain('value === "launch"');
    expect(wizard).toContain(
      'const stepOrder: WizardStep[] = ["train", "voice", "test", "launch", "complete"]',
    );
    expect(wizard).toContain('if (stored === "channels") return "test"');
    expect(wizard).toContain('if (stored === "wire") return "launch"');
    expect(wizard).toContain(
      "function finish(line: string | null = hasLiveLine ? phoneNumber : null)",
    );
    expect(wizard).toContain("if (line && testStarted)");
    expect(wizard).toContain("disabled={!testStarted}");
    expect(wizard).not.toContain('event: "launch_readiness_reached"');
    expect(wizard).toContain("onTestCompleted");
    expect(wizard).toContain('event: "test_call_completed"');
    expect(wizard).toContain('result: "assistant_response_completed"');
    expect(wizard).not.toContain("Finish without a test");
    expect(copy).toContain('label: "Train"');
    expect(copy).toContain('label: "Try It"');
    expect(copy).toContain('label: "Launch"');
    expect(copy).not.toContain('label: "Wire"');
    expect(copy).not.toContain('label: "Number"');
    expect(copy).not.toContain('label: "Rehearse"');
    expect(copy).toContain("Continue to Try It");
    expect(copy).toContain("Continue to Launch");
    expect(copy).toContain("Skip Rehearsal");
    expect(copy).toContain("Put It on the Line");
    expect(billing).toContain("shouldResumePostCreateLaunch(");
    expect(billing).toContain("Boolean(readPostCreateWizard())");
    expect(billing).toContain("readPostCreateWizardStep()");
    expect(billing).toContain('window.location.replace("/studio")');
    expect(billing.indexOf("window.history.replaceState")).toBeLessThan(
      billing.indexOf('window.location.replace("/studio")'),
    );
  });
});
