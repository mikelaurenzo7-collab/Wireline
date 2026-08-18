import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated mobile cleanup", () => {
  it("keeps short tab labels visually compact without weakening accessible names", () => {
    const tabStrip = read("src/components/layout/WorkspaceTabStrip.tsx");
    const tabs = read("src/lib/page-sub-tabs.ts");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");

    expect(tabStrip).toContain("shortLabel?: string");
    expect(tabStrip).toContain('wrap?: boolean | "always"');
    expect(tabStrip).toContain("tab.ariaLabel ?? (tab.shortLabel ? fullLabel : undefined)");
    expect(tabStrip).toContain('className="sm:hidden"');
    expect(tabStrip).toContain('className="hidden sm:inline"');
    expect(tabs).toContain('shortLabel: "Camps"');
    expect(tabs).toContain('shortLabel: "Seq"');
    expect(settingsTabs).toContain('wrap="always"');
    expect(settingsTabs).not.toContain("shortLabel:");
  });

  it("keeps metrics glanceable instead of stacking oversized cards", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const phone = read("src/pages/PhonePage.tsx");

    expect(overview).toContain("grid grid-cols-2 gap-2 sm:gap-3");
    expect(overview).toContain("wl-metric-tile--compact");
    expect(overview).not.toContain("wl-metric-tile__detail");
    expect(knowledge).toContain("grid grid-cols-3 gap-2");
    expect(knowledge).toContain("wl-metric-tile--compact");
    expect(phone).toContain('shortLabel: "Appts"');
  });

  it("keeps heavy-user controls and phone-width actions in view", () => {
    const activation = read("src/components/ActivationChecklist.tsx");
    const outcomes = read("src/components/OutcomeLedger.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");

    expect(activation).toContain("grid grid-cols-2 gap-2 lg:grid-cols-3");
    expect(activation).not.toContain("{step.detail}");
    expect(outcomes).toContain("line-clamp-3");
    expect(knowledge).toContain("sm:[&>button]:w-auto");
    expect(knowledge).toContain('"Choose files"');
    expect(studio).toContain("hidden size-4 shrink-0 sm:block");
    expect(read("src/components/AgentTemplates.tsx")).toContain(
      "sm:grid-cols-2 sm:gap-3 xl:grid-cols-3",
    );
  });

  it("keeps first run on one role-first launchpad with no salutation", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");

    expect(overview).toContain("const isFirstRun = !loading && !degraded && !hasBots");
    expect(overview).toContain('className={isFirstRun ? "sr-only" : "wl-app-page-title mt-1"}');
    expect(overview).toContain("<FirstRunWorkspace />");
    expect(overview).not.toContain("dayGreeting");
    expect(overview).not.toContain("Good morning");
    expect(firstRun).toContain("Build Your Bot");
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain("Browse Templates");
    expect(firstRun).not.toContain("posture=");
  });

  it("uses Bot language and compact identity throughout the active workspace", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const rail = read("src/components/overview/OverviewRail.tsx");
    const create = read("src/components/CreateAgentDialog.tsx");

    expect(shell).toContain('singular: "Bot"');
    expect(shell).toContain('plural: "Bots"');
    expect(shell).toContain('navLabel: "Bot Studio"');
    expect(shell).toContain("aria-label={language.plural}");
    expect(rail).toContain("New Bot");
    expect(rail).toContain("All Bots");
    expect(create).toContain("BOT_ROLE_TEMPLATES.map");
    expect(create).toContain("Not Now");
  });

  it("keeps guidance once, next to the decision it supports", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    const inbox = read("src/components/EmailInbox.tsx");

    expect(setup).not.toMatch(/Set the tone, greeting, essential facts/);
    expect(review).not.toMatch(/Keep the loop small/);
    expect(voice).toMatch(/Browser tests the words\. Place a real call to verify the selected\s+audio\./);
    expect(inbox).toContain("Inbox unavailable");
    expect(inbox).toContain("No email conversations yet");
    expect(inbox).toContain("Refresh inbox");
  });

  it("fails closed on setup-load errors and keeps action feedback in view", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("setupLoadError");
    expect(setup).toContain('title="Setup unavailable"');
    expect(setup).toContain("setReloadKey((current) => current + 1)");
    expect(setup).toContain("activeAgentIdRef.current === setupAgentId");
    expect(review).toContain("setConfig(null)");
    expect(review).toContain("hidden={Boolean(error)}");
    expect(phoneSetup.indexOf("{message ? (")).toBeLessThan(
      phoneSetup.indexOf("<CompanyIdentityPack"),
    );
    expect(phoneSetup.indexOf("{error ? (")).toBeLessThan(
      phoneSetup.indexOf("<CompanyIdentityPack"),
    );
    expect(existsSync(resolve(process.cwd(), "src/components/layout/TrialBanner.tsx"))).toBe(false);
  });
});
