import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*label: "Agent Studio"/);
    expect(navigation).toMatch(/href: "\/inbox", label: "Inbox"/);
    expect(navigation).toMatch(/href: "\/phone", label: "Calls"/);
    expect(navigation).toMatch(/href: "\/insights", label: "Activity"/);
    expect(navigation).toMatch(/href: "\/connections"[\s\S]*label: "Connections"/);
    expect(navigation).toContain('route: "/templates", parentHref: "/studio"');
    expect(navigation).toContain('route: "/knowledge", parentHref: "/studio"');
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
    expect(studioChrome).toContain("/inbox?agent=");
    expect(studioChrome).toContain("/phone?agent=");
    expect(shell).toContain("Current Bot");
    expect(shell).not.toContain("orderedAgents");
  });

  it("keeps Studio on a simple Setup, Test, Review loop", () => {
    expect(studio).toContain('type WorkspaceSection = "setup" | "test" | "review"');
    expect(studio).toContain('label: "Setup"');
    expect(studio).toContain('label: "Test"');
    expect(studio).toContain('label: "Review"');
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
    expect(workroom).toContain("Browser test");
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
    expect(voice).toContain("VAPI_CURATED_VOICES");
    expect(voice).toContain("Savannah");
    expect(voice).toContain("Elliot");
    expect(voice).toContain('provider: "vapi"');
    expect(voice).not.toContain("Browser tests the words");
    expect(voice).not.toContain("Speech-to-Speech");
    expect(voice).not.toContain("live PSTN");
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
    expect(connections).toContain("IntegrationOperatingMap");
    expect(connections).toContain("CrmConnectionCard");
    expect(knowledge).toContain("WorkspaceControlBand");
    expect(knowledge).toContain("WorkspaceTabStrip");
    expect(settingsTabs).toContain('href: "/settings/apps", label: "Apps"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
    expect(billing).toContain("Runtime Balance");
  });
});
