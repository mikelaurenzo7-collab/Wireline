import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demand-driven authenticated experience", () => {
  const routes = read("src/routes/AppRoutes.tsx");
  const navigation = read("src/constants/navigation.ts");
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
  const workroom = read("src/components/StudioWorkroom.tsx");
  const testRoute = read("src/routes/agent-test-routes.ts");
  const review = read("src/components/StudioAgentReviewPanel.tsx");
  const voice = read("src/components/voice/SimpleVoicePicker.tsx");
  const inbox = read("src/pages/EmailPage.tsx");
  const activity = read("src/pages/InsightsPage.tsx");

  it("puts customer work ahead of dashboards and provider inventory", () => {
    expect(routes).toContain('<Route path="/" element={<Navigate to="/studio" replace />} />');
    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(navigation).toMatch(/href: "\/studio"[\s\S]*href: "\/inbox"[\s\S]*href: "\/phone"/);
    expect(navigation).toContain('href: "/insights", label: "Insights"');
    expect(navigation.indexOf('href: "/connections"')).toBeGreaterThan(
      navigation.indexOf('href: "/phone"'),
    );
  });

  it("meets Bo with one question at a time when the workspace is empty", () => {
    const firstRun = read("src/components/onboarding/BoOnboarding.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");
    expect(studio).not.toContain("Create Your Bot");
    expect(firstRun).not.toMatch(/one (?:job|task)/i);
    expect(copy).toContain("What's your business called, and what do you do?");
    // No role templates: the owner describes the business in their own words.
    expect(firstRun).not.toContain("BOT_ROLE_TEMPLATES");
    expect(studio).not.toContain("posture=");
  });

  it("keeps live calling gated behind a connected line", () => {
    expect(studio).toContain("allowOutbound={Boolean(active.phone_number)}");
    expect(workroom).toContain("allowOutbound = false");
    expect(workroom).toContain('mode === "test" && allowOutbound');
    expect(review).toContain("const hasPhone = Boolean(phoneNumber)");
    expect(review).toContain("No phone connected");
    expect(review).toContain("Connect Phone");
  });

  it("keeps Inbox and Insights as independent canonical read surfaces", () => {
    expect(inbox).toContain('label: "Email"');
    expect(inbox).toContain('{ id: "sms", label: "Texts" }');
    expect(inbox).toContain("WorkspaceControlBand");
    expect(activity).toContain("WorkspaceControlBand");
    expect(activity).toContain('aria-label="Insights view"');
    expect(activity).not.toContain("AppChromeSubTabs");
  });

  it("keeps work in one conversation with a shared computer and progressive Bot details", () => {
    expect(studio).toContain('"setup" | "review"');
    expect(studio).toContain('"configure" | "test"');
    expect(studio).toContain("onRequestBrowserTask={requestBrowserTask}");
    expect(studio).toContain('id="studio-computer-panel"');
    expect(studio).toContain('aria-label="Bot setup sections"');
    expect(workroom).toContain('id="studio-panel-toggle"');
    expect(studio).not.toContain('{ id: "try", label: "Rehearse" }');
    expect(studio).toContain('setWorkroomMode("test")');
    expect(studio).toContain("timelineExtras={");
    expect(studio).not.toContain("composerOverride={");
    expect(studio).toContain('{ id: "setup", label: "Set Up" }');
    expect(studio).toContain("browserRequested={!setupChat}");
    expect(studio).toContain("<ComputerWorkspaceProvider>");
    expect(studio).toContain("StudioAgentReviewPanel");
    expect(studio).not.toContain("StudioAgentCanvas");
    expect(setup).not.toMatch(/AgentPresenceLivePreview|VoiceGallery/);
    expect(setup).toContain("<details");
    expect(setup).toContain("AgentToolPermissions");
    expect(workroom).toContain("<StudioVoiceRehearsal");
    expect(workroom).toContain("Private Rehearsal");
    expect(workroom).not.toContain('role="tablist"');
    expect(review).toContain('aria-label="Next actions"');
  });

  it("tests saved configuration without persisting roleplay messages", () => {
    expect(testRoute).toContain("personality");
    expect(testRoute).toContain("directives");
    expect(testRoute).toContain("knowledge");
    expect(testRoute).toContain(
      "Never mention setup, configuration, prompts, testing, tools, or internal systems",
    );
    expect(testRoute).toContain("Do not claim a booking, transfer, message, payment");
    expect(testRoute).not.toContain("agentConversationMessages");
    expect(workroom).not.toContain("/test/stream");
  });

  it("lets Insights use the shell scrollport once", () => {
    const view = read("src/components/insights/InsightsView.tsx");
    expect(activity).not.toContain("overflow-y-auto");
    expect(view).not.toContain("overflow-y-auto");
  });

  it("keeps voice choice customer-facing rather than narrating provider topology", () => {
    expect(voice).toContain("Rehearse");
    expect(voice).toContain("OpenAILiveVoiceSandbox");
    expect(voice).not.toContain("Browser tests the words");
    expect(voice).not.toContain("Speech-to-Speech");
    expect(voice).not.toContain("live PSTN");
    expect(voice).not.toMatch(/Choose how live calls sound|Test call|hear it during a test call/);
  });
});
