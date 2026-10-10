import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKSPACE_NAV, desktopNavParentHref } from "../../src/constants/navigation";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("authenticated Bot navigation contract", () => {
  const navigation = read("src/constants/navigation.ts");
  const shell = read("src/components/WorkspaceShell.tsx");
  const routes = read("src/routes/AppRoutes.tsx");
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const studioChrome = read("src/components/studio/StudioContextChrome.tsx");
  const studioPanel = read("src/components/StudioAgentWorkspacePanel.tsx");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");
  const workroom = read("src/components/StudioWorkroom.tsx");
  const create = read("src/components/CreateAgentDialog.tsx");
  const copy = read("src/lib/product-copy.ts");

  it("keeps daily IA small and moves management destinations below it", () => {
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*label: "Bot Studio"/);
    expect(navigation).toMatch(/href: "\/inbox", label: "Inbox"/);
    expect(navigation).toMatch(/href: "\/phone", label: "Calls"/);
    expect(navigation).toMatch(/href: "\/insights", label: "Activity"/);
    expect(navigation).toMatch(/href: "\/connections"[\s\S]*label: "Connections"/);
    expect(navigation).toContain('route: "/templates", parentHref: "/studio"');
    expect(WORKSPACE_NAV.slice(0, 2).map((item) => item.href)).toEqual(["/studio", "/knowledge"]);
    expect(desktopNavParentHref("/knowledge")).toBeNull();
    expect(navigation).toContain('route: "/approvals", parentHref: "/inbox"');
    expect(navigation).toContain('route: "/apps", parentHref: "/settings"');
    expect(shell).toContain("desktopNavParentHref(pathname)");
    expect(shell).toContain('navLabel: "Bot Studio"');
    expect(shell).toContain("MobileNavMoreSheet");
    expect(shell).toContain("WorkspaceResizablePanel");
  });

  it("keeps legacy agent and Overview URLs compatible without reviving retired command centers", () => {
    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(routes).toContain('path="/agents" element={<ToStudioRedirect />}');
    for (const path of [
      "/pulse",
      "/fleet",
      "/ops",
      "/training",
      "/chat",
      "/actions",
      "/nexus",
      "/wires",
    ]) {
      expect(routes).not.toContain(`path="${path}"`);
    }
  });

  it("makes Studio the authenticated home and gives each Bot a scoped workspace", () => {
    expect(routes).toContain('<Route path="/" element={<Navigate to="/studio" replace />} />');
    expect(studioChrome).toContain('aria-label="Switch Bot"');
    expect(studioChrome).toContain("agents.map");
    expect(studioChrome).not.toContain("/inbox?agent=");
    expect(studioChrome).not.toContain("/phone?agent=");
    expect(navigation).toContain('href: "/inbox"');
    expect(navigation).toContain('href: "/phone"');
    expect(shell).toContain("Current Bot");
    expect(shell).not.toContain("orderedAgents");
  });

  it("keeps Studio as one workroom with a Setup/Review inspector", () => {
    expect(studio).toContain('type InspectorSection = "setup" | "review"');
    expect(studio).toContain('type WorkroomMode = "configure" | "test"');
    expect(studio).toContain('id === "setup" ? "Setup" : "Review"');
    expect(studio).toContain("StudioAgentWorkspacePanel");
    expect(studio).toContain("StudioWorkroom");
    expect(studio).toContain("StudioAgentReviewPanel");
    expect(studio).toContain("WorkspaceResizablePanel");
    expect(studio).not.toContain("StudioAgentCanvas");
    expect(studio).not.toContain("posture=");
  });

  it("uses a real customer roleplay with saved configuration and no persistence bait", () => {
    const route = read("src/routes/agent-test-routes.ts");
    expect(workroom).toContain("/test/stream");
    expect(workroom).toContain("WORKSPACE_VOICE.testPrompts");
    expect(workroom).toContain("Private rehearsal");
    expect(copy).toContain("What can you help with?");
    expect(copy).toContain("I want to book an appointment.");
    expect(route).toContain("Reply only as that customer-facing Bot");
    expect(route).toContain(
      "Never mention setup, configuration, prompts, testing, tools, or internal systems",
    );
    expect(route).not.toContain("agentConversationMessages");
  });

  it("keeps managed voice and readiness review in Studio without provider-facing guidance", () => {
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    const catalog = read("src/lib/voice-catalog.ts");
    expect(voice).toContain("OPENAI_REALTIME_VOICES");
    expect(catalog).toContain("Marin");
    expect(catalog).toContain("Cedar");
    expect(catalog).toContain('provider: "openai"');
    expect(voice).not.toContain("Browser tests the words");
    expect(voice).not.toContain("Speech-to-Speech");
    expect(voice).not.toContain("live PSTN");
    expect(studioPanel).toContain("<SimpleVoicePicker");
    expect(studioPanel).toContain("Phone Voice");
    expect(studioPanel).not.toMatch(/VoiceGallery|AgentPresenceLivePreview/);
    expect(studioReview).toContain("Phone voice");
    expect(studioReview).toContain("No phone connected");
  });

  it("makes Fast Start brief-first, posture-neutral, and free of provider complexity", () => {
    expect(create).toContain("language.setupPrompt");
    expect(create).toContain("Start from a Role");
    expect(create).toContain("language.createCta");
    expect(create).toContain("BOT_ROLE_TEMPLATES.map");
    expect(create).toContain("BOT_CHANNELS.map");
    expect(create).toContain('aria-label="Bot role starters"');
    expect(create).toContain("phoneProvisionRequested: false");
    expect(create).toContain("&section=setup");
    expect(create).not.toMatch(
      /setPosture|rolesForPosture|VoicePickerField|CreateAgentCatalogFacePicker/,
    );
    expect(create).not.toMatch(/Provision a number|video-presenter/);
  });

  it("keeps secondary surfaces mounted to current destinations and shared page rhythm", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    const knowledge = read("src/pages/KnowledgePage.tsx");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
    const billing = read("src/pages/BillingSettings.tsx");
    expect(connections).not.toContain("IntegrationOperatingMap");
    expect(connections).toContain("CrmConnectionCard");
    expect(knowledge).toContain("WorkspaceControlBand");
    expect(knowledge).toContain("WorkspaceTabStrip");
    expect(settingsTabs).toContain('href: "/settings/apps", label: "Apps"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
    expect(billing).toContain("Runtime Balance");
  });
});
