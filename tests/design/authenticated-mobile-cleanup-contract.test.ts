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
    expect(tabs).not.toContain('shortLabel: "Seq"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
    expect(settingsTabs).not.toContain('wrap="always"');
  });

  it("keeps compact metrics and phone-width labels readable", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const phone = read("src/pages/PhonePage.tsx");
    const calendar = read("src/pages/CalendarPage.tsx");

    expect(knowledge).toMatch(/<dl[^>]+aria-label="Knowledge summary"/);
    expect(knowledge).toContain("{stat.label}</dt>");
    expect(knowledge).toContain('{loading ? "Loading…" : stat.value}</dd>');
    expect(knowledge).toContain(
      "const showStats = loading || knowledge.length > 0 || directives.length > 0 || hasPersonality",
    );
    expect(phone).not.toContain('id: "appointments"');
    expect(phone).toContain("WorkspaceControlBand");
    expect(calendar).toContain("WorkspaceControlBand");
    expect(calendar).toMatch(/<WorkspaceTabStrip[\s\S]*?mobileSelect/);
  });

  it("keeps heavy-user controls reachable without crowding the Bot workspace", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");

    expect(knowledge).toContain("sm:[&>button]:w-auto");
    expect(knowledge).toContain('"Choose Files"');
    expect(studio).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(studio).toContain('layout={splitWorkspace ? "split" : "standalone"}');
    // The template gallery and the create dialog are gone: Bo's first
    // conversation asks one thing at a time. What still has to hold on a phone
    // is that its reply buttons wrap and its next steps stack rather than
    // overflowing.
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    expect(bo).toContain('<div className="flex flex-wrap gap-2">');
    expect(bo).toContain('<div className="grid gap-2 sm:grid-cols-2">');
  });

  it("keeps first run on one brief-first Bo conversation in Studio", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const home = read("src/pages/AgentStudioHome.tsx");
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    // An account without a Bot meets Bo in Studio; the Workspace draws no
    // create screen of its own.
    expect(home).toMatch(
      /<StudioPageShell>\s*<BoOnboarding key=\{user\?\.id\} initialAbout=\{brief\} \/>/,
    );
    expect(studio).toContain("if (agents.length === 0) return <StudioLoadingState />;");
    expect(studio).not.toContain('title="Create Your Bot"');
    // A ?brief= link becomes Bo's first answer, for the owner to read and send.
    expect(home).toContain('useState(() => params.get("brief") || "")');
    expect(bo).toContain("initialAbout.slice(0, BO_ANSWER_MAX_CHARS)");
    expect(bo).toContain('htmlFor="bo-onboarding-answer"');
    for (const source of [studio, bo]) {
      expect(source).not.toContain('description="Describe the role and outcome."');
      expect(source).not.toContain("dayGreeting");
      expect(source).not.toContain("Good morning");
    }
  });

  it("uses Bot language, an identity roster, and a compact mobile switcher", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const chrome = read("src/components/studio/StudioContextChrome.tsx");

    expect(shell).toContain('singular: "Bot"');
    expect(shell).toContain('navLabel: "Workspace"');
    expect(shell).toContain('aria-label="Bot conversations"');
    expect(shell).toContain('data-wireline-bot-selected={selected ? "true" : undefined}');
    expect(chrome).toContain('aria-label="Switch Bot"');
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
    expect(inbox).toContain("Inbox Unavailable");
    expect(inbox).toContain("No Email Yet");
    expect(inbox).toContain("Refresh");
  });

  it("fails closed on setup-load errors and keeps action feedback in view", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("setupLoadError");
    expect(setup).toContain('title="Setup Unavailable"');
    expect(setup).toContain("setReloadKey((current) => current + 1)");
    expect(setup).toContain("activeAgentIdRef.current === targetAgentId");
    expect(setup).toContain("activeUserIdRef.current === targetUserId");
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
