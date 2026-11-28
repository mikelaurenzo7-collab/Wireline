import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation path contract", () => {
  it("meets Bo first and keeps a picked plan for going live", () => {
    const authRedirect = read("src/lib/auth-redirect.ts");
    expect(authRedirect).toContain('return "/studio";');
    expect(authRedirect).not.toContain("create=1");
    expect(authRedirect).not.toContain("&onboarding=1");
    expect(authRedirect).toContain("persistSignupIntent(intent)");
    // Billing has no pre-Bot "choose a plan" header any more.
    expect(read("src/pages/BillingSettings.tsx")).not.toContain("Set Up a Bot First");
    expect(read("src/lib/signup-intent.ts")).toContain("export function choosePlanHref(): string");
  });

  it("documents the deferred operations checklist", () => {
    const doc = read("docs/OPS_CREDENTIALS_CHECKLIST_2026-07-07.md");
    expect(doc).toContain("FEDERAL_DNC");
    expect(doc).toContain("SENTRY_DSN");
  });

  it("keeps Bot activation direct in Studio after Overview retired", () => {
    expect(existsSync(resolve(root, "src/pages/OverviewPage.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/components/overview/FirstRunWorkspace.tsx"))).toBe(false);
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const studioSetup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const routes = read("src/routes/AppRoutes.tsx");

    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(studioSetup).not.toContain("ActivationChecklist");
    expect(studioSetup).toContain("Bot Setup");
    expect(studioSetup).toContain('{applyingSetup ? "Saving…" : "Save Changes"}');
    expect(studio).toContain("if (agents.length === 0 && degraded) return <WorkspaceRecovery");
    // An account without a Bot meets Bo; the Workspace has no create screen.
    expect(studio).not.toContain("Create Your Bot");
    expect(studio).not.toContain("create=1");
    expect(read("src/pages/AgentStudioHome.tsx")).toContain("<BoOnboarding");
    expect(studio).not.toMatch(/one (?:job|task)/i);
    expect(studio).not.toMatch(/posture=|personalAgents|businessAgents|dayGreeting/);
  });

  it("aligns the activation checklist with verifiable live-work progress", () => {
    const progress = read("src/lib/fleet-setup-progress.ts");
    expect(progress).toContain("FLEET_SETUP_STEP_COUNT = 6");
  });

  it("isolates browser activation state per account", () => {
    const storage = read("src/lib/post-signup-onboarding.ts");
    const nudge = read("src/components/ActivationNudge.tsx");

    expect(storage).toContain("activationCelebratedStorageKey(scopeId)");
    expect(storage).toContain("${ACTIVATION_CELEBRATED_KEY}:${scopeId}");
    expect(nudge).toContain("isActivationCelebrated(activationScope)");
    expect(nudge).toContain("accountId: activeAccount?.id");
    expect(nudge).toContain("scope: activationScope");
  });

  it("keeps Bo's first conversation resumable, honest, and focused", () => {
    const onboarding = read("src/components/onboarding/BoOnboarding.tsx");
    const state = read("src/lib/bo-onboarding.ts");
    const billing = read("src/pages/BillingSettings.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    // The business name first (when the workspace has none), then the four
    // questions, then the hand-off.
    expect(state).toMatch(
      /export const BO_ONBOARDING_STEPS = \[\s*"name",\s*"about",\s*"website",\s*"questions",\s*"checks",\s*"done",?\s*\] as const;/,
    );
    // A reload continues at the same question for the same Bot.
    expect(onboarding).toContain("writeBoOnboarding(userId, {");
    expect(onboarding).toContain("clearBoOnboarding(userId);");
    // A web lookup saves nothing until the owner says it is their business.
    expect(onboarding).toContain("From a web search I confirmed is my business: ");
    expect(copy).toContain('confirm: "Is this your business?"');
    expect(onboarding).toContain('event: "post_create_wizard_step_completed"');
    expect(onboarding).toContain('event: "launch_readiness_reached"');
    // Going live is the one moment a plan is chosen.
    expect(onboarding).toContain("choosePlanHref()");
    expect(copy).toContain('number: "Get a Number"');
    // Checkout no longer reopens a setup guide.
    expect(billing).not.toMatch(/readPostCreateWizard|shouldResumePostCreateLaunch/);
  });
});
