import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated mobile cleanup", () => {
  it("keeps short tab labels compact and scrolls rather than forcing multi-row settings chrome", () => {
    const tabStrip = read("src/components/layout/WorkspaceTabStrip.tsx");
    const tabs = read("src/lib/page-sub-tabs.ts");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");

    expect(tabStrip).toContain("shortLabel?: string");
    expect(tabStrip).toContain('wrap?: boolean | "always"');
    expect(tabStrip).toContain("tab.ariaLabel ?? (tab.shortLabel ? fullLabel : undefined)");
    expect(tabStrip).toContain('className="sm:hidden"');
    expect(tabStrip).toContain('className="hidden sm:inline"');
    expect(tabStrip).toContain("nav.scrollWidth <= nav.clientWidth");
    expect(tabs).toContain('shortLabel: "Camps"');
    expect(tabs).toContain('shortLabel: "Seq"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
    expect(settingsTabs).not.toContain('wrap="always"');
  });

  it("keeps compact metrics and phone-width labels readable", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const phone = read("src/pages/PhonePage.tsx");

    expect(knowledge).toContain("grid grid-cols-3 gap-2");
    expect(knowledge).toContain("wl-metric-tile--compact");
    expect(knowledge).toContain(
      "const showStats = loading || knowledge.length > 0 || directives.length > 0 || hasPersonality",
    );
    expect(phone).toContain('shortLabel: "Appts"');
    expect(phone).toContain("WorkspaceControlBand");
  });

  it("keeps heavy-user controls reachable without crowding the Bot workspace", () => {
    const activation = read("src/components/ActivationChecklist.tsx");
    const outcomes = read("src/components/OutcomeLedger.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");

    expect(activation).toContain("grid grid-cols-2 gap-2 lg:grid-cols-3");
    expect(activation).not.toContain("{step.detail}");
    expect(outcomes).toContain("line-clamp-3");
    expect(knowledge).toContain("sm:[&>button]:w-auto");
    expect(knowledge).toContain('"Choose files"');
    expect(studio).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(studio).toContain('layout={splitWorkspace ? "split" : "standalone"}');
    expect(read("src/components/AgentTemplates.tsx")).toContain(
      "sm:grid-cols-2 sm:gap-3 xl:grid-cols-3",
    );
  });

  it("keeps first run on one brief-driven Studio launchpad", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(studio).toContain('title="Build Your Bot"');
    expect(studio).toContain("BOT_LANGUAGE.setupPrompt");
    expect(studio).toContain("Create Bot");
    expect(studio).toContain('description="Describe the role and outcome."');
    expect(studio).toContain('if (trimmed) params.set("brief", trimmed)');
    expect(studio).not.toContain("dayGreeting");
    expect(studio).not.toContain("Good morning");
  });

  it("uses Bot language and one compact current-Bot identity rather than a sidebar roster", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    const create = read("src/components/CreateAgentDialog.tsx");

    expect(shell).toContain('singular: "Bot"');
    expect(shell).toContain('navLabel: "Bot Studio"');
    expect(shell).toContain("Current Bot");
    expect(shell).not.toContain("orderedAgents");
    expect(chrome).toContain('aria-label="Switch Bot"');
    expect(create).toContain("BOT_ROLE_TEMPLATES.map");
    expect(create).toContain("Not Now");
  });

  it("keeps guidance next to decisions and removes provider/runtime narration", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    const inbox = read("src/components/EmailInbox.tsx");

    expect(setup).not.toMatch(/Set the tone, greeting, essential facts/);
    expect(review).not.toMatch(/Keep the loop small/);
    expect(voice).not.toContain("Browser tests the words");
    expect(voice).not.toContain("Speech-to-Speech");
    expect(voice).not.toContain("live PSTN");
    expect(inbox).toContain("Inbox unavailable");
    expect(inbox).toContain("No email yet");
    expect(inbox).toContain("Refresh");
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
