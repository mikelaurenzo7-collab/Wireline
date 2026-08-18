import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("authenticated Bot navigation contract", () => {
  const navigation = read("src/constants/navigation.ts");
  const shell = read("src/components/WorkspaceShell.tsx");
  const routes = read("src/routes/AppRoutes.tsx");
  const overview = read("src/pages/OverviewPage.tsx");
  const overviewInbox = read("src/components/overview/UnifiedInbox.tsx");
  const overviewRail = read("src/components/overview/OverviewRail.tsx");
  const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
  const studioPanel = read("src/components/StudioAgentWorkspacePanel.tsx");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");
  const workroom = read("src/components/StudioWorkroom.tsx");
  const create = read("src/components/CreateAgentDialog.tsx");
  const copy = read("src/lib/product-copy.ts");

  it("keeps the primary IA small and routes secondary tools through their parents", () => {
    expect(navigation).toMatch(/href: "\/overview"[\s\S]*label: "Overview"/);
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*label: "Agent Studio"/);
    expect(navigation).toMatch(/href: "\/connections"[\s\S]*label: "Connections"/);
    expect(navigation).toMatch(/href: "\/inbox", label: "Inbox"/);
    expect(navigation).toMatch(/href: "\/phone", label: "Calls"/);
    expect(navigation).toMatch(/href: "\/insights", label: "Activity"/);
    expect(navigation).toContain('route: "/templates", parentHref: "/studio"');
    expect(navigation).toContain('route: "/knowledge", parentHref: "/studio"');
    expect(navigation).toContain('route: "/approvals", parentHref: "/inbox"');
    expect(navigation).toContain('route: "/apps", parentHref: "/settings"');
    expect(shell).toContain("desktopNavParentHref(pathname)");
    expect(shell).toContain('navLabel: "Bot Studio"');
    expect(shell).toContain('plural: "Bots"');
    expect(shell).toContain("MobileNavMoreSheet");
  });

  it("keeps legacy agent URLs compatible without reviving retired pages", () => {
    expect(routes).toContain('path="/agents"');
    expect(routes).toContain("AgentsToStudioRedirect");
    expect(routes).toMatch(/AgentsToStudioRedirect[\s\S]*\/studio/);
    for (const path of ["/pulse", "/fleet", "/ops", "/training", "/chat", "/actions", "/nexus", "/wires"]) {
      expect(routes).not.toContain(`path="${path}"`);
    }
  });

  it("operates one modular Overview before exposing configuration", () => {
    expect(overview).toContain("UnifiedInbox");
    expect(overview).toContain("BotRoster");
    expect(overview).toContain("ConfigureCard");
    expect(overview).toContain("Customer demand and outcomes");
    expect(overview).toContain("Customer conversations today");
    expect(overview).toContain("High-intent today");
    expect(overview).toContain("Appointments booked");
    expect(overview).toContain("Needs attention");
    expect(overviewInbox).toContain("Unified Inbox");
    expect(overviewInbox).toContain("Recent customer conversations");
    expect(overviewRail).toContain("Bots");
    expect(overviewRail).toContain("One Control Surface");
    expect(firstRun).toContain("Build Your Bot");
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain("Browse Templates");
    expect(`${overview}\n${overviewInbox}\n${overviewRail}\n${firstRun}`).not.toMatch(
      /personalAgents|businessAgents|founderPair|posture=/,
    );
  });

  it("keeps Studio on a simple Set Up, Test, Review loop", () => {
    expect(studio).toContain('type WorkspaceSection = "setup" | "test" | "review"');
    expect(studio).toContain('label: "Set Up"');
    expect(studio).toContain('label: "Test"');
    expect(studio).toContain('label: "Review"');
    expect(studio).toContain("StudioAgentWorkspacePanel");
    expect(studio).toContain("StudioWorkroom");
    expect(studio).toContain("StudioAgentReviewPanel");
    expect(studio).not.toContain("StudioAgentCanvas");
    expect(studio).not.toContain("useAccount");
    expect(studio).not.toContain("posture=");
    expect(studioChrome).toContain("language.navLabel");
    expect(studioChrome).toContain("language.createCta");
  });

  it("uses a real customer roleplay with saved configuration and no persistence bait", () => {
    const route = read("src/routes/agent-test-routes.ts");
    expect(workroom).toContain('/test/stream');
    expect(workroom).toContain("WORKSPACE_VOICE.testPrompts");
    expect(workroom).toContain("Browser test");
    expect(copy).toContain("What can you help with?");
    expect(copy).toContain("I want to book an appointment.");
    expect(route).toContain("Reply only as the customer-facing voice agent");
    expect(route).toContain(
      "Never mention setup, configuration, prompts, testing, tools, or internal systems",
    );
    expect(route).not.toContain("agentConversationMessages");
  });

  it("keeps the managed phone voice and readiness review inside Studio", () => {
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    expect(voice).toContain("VAPI_CURATED_VOICES");
    expect(voice).toContain("Savannah");
    expect(voice).toContain("Elliot");
    expect(voice).toContain('provider: "vapi"');
    expect(voice).toContain("Browser tests the words");
    expect(studioPanel).toContain("<SimpleVoicePicker");
    expect(studioPanel).toContain("Phone voice");
    expect(studioPanel).not.toMatch(/VoiceGallery|AgentPresenceLivePreview/);
    expect(studioReview).toContain("Managed phone voice");
    expect(studioReview).toContain("Browser-ready; live line not connected");
  });

  it("makes Fast Start role-first, posture-neutral, and free of provider complexity", () => {
    expect(create).toContain("language.setupPrompt");
    expect(create).toContain("language.setupDescription");
    expect(create).toContain("language.createCta");
    expect(create).toContain("BOT_ROLE_TEMPLATES.map");
    expect(create).toContain("BOT_CHANNELS.map");
    expect(create).toContain('aria-label="Bot role starters"');
    expect(create).toContain("phoneProvisionRequested: false");
    expect(create).toContain("&section=setup");
    expect(create).not.toMatch(/setPosture|rolesForPosture|VoicePickerField|CreateAgentCatalogFacePicker/);
    expect(create).not.toMatch(/Provision a number|video-presenter/);
  });

  it("keeps secondary authenticated surfaces mounted to current destinations", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    const knowledge = read("src/pages/KnowledgePage.tsx");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
    const billing = read("src/pages/BillingSettings.tsx");
    expect(connections).toContain("IntegrationOperatingMap");
    expect(connections).toContain("CrmConnectionCard");
    expect(knowledge).toContain("WorkspaceTabStrip");
    expect(knowledge).toMatch(/density="compact"[\s\S]*align="start"[\s\S]*wrap/);
    expect(settingsTabs).toContain('href: "/settings/apps", label: "Apps"');
    expect(billing).toContain("Runtime Balance");
  });
});
