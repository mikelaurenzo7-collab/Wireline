import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demand-driven authenticated experience", () => {
  const routes = read("src/routes/AppRoutes.tsx");
  const navigation = read("src/constants/navigation.ts");
  const activation = read("src/components/ActivationChecklist.tsx");
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
    expect(navigation).toContain('href: "/insights", label: "Activity"');
    expect(navigation.indexOf('href: "/connections"')).toBeGreaterThan(
      navigation.indexOf('href: "/phone"'),
    );
  });

  it("uses one role-first next action when the workspace is empty", () => {
    expect(studio).toContain('title="Start With One Job"');
    expect(studio).toContain("BOT_LANGUAGE.setupPrompt");
    expect(studio).toContain("Create Bot");
    expect(studio).toContain("Choose a role starter or make it entirely custom.");
    expect(studio).not.toContain("posture=");
  });

  it("keeps live calling gated behind a connected line", () => {
    expect(studio).toContain("allowOutbound={Boolean(active.phone_number)}");
    expect(workroom).toContain("allowOutbound = false");
    expect(workroom).toContain('mode === "test" && allowOutbound');
    expect(review).toContain("const hasPhone = Boolean(phoneNumber)");
    expect(review).toContain("Browser-ready; live line not connected");
    expect(review).toContain("Connect phone");
  });

  it("keeps Inbox and Activity as independent canonical read surfaces", () => {
    expect(inbox).toContain('label: "Email"');
    expect(inbox).toContain('label: "Text"');
    expect(inbox).toContain("WorkspaceControlBand");
    expect(activity).toContain("WorkspaceControlBand");
    expect(activity).toContain('aria-label="Activity view"');
    expect(activity).not.toContain("AppChromeSubTabs");
  });

  it("tracks only verifiable customer-readiness milestones", () => {
    expect(activation).toContain("Ready for customers");
    expect(activation).toContain("Job and greeting defined");
    expect(activation).toContain("Business facts added");
    expect(activation).toContain("Phone number connected");
    expect(activation).toContain("First live customer handled");
    expect(activation).toContain("First follow-up reviewed");
    expect(activation).toContain('actionLabel: "Connect phone number"');
    expect(activation).not.toContain("Test conversation completed");
  });

  it("keeps Studio on a simple Setup, Test, Review loop with progressive disclosure", () => {
    expect(studio).toContain('"setup" | "test" | "review"');
    expect(studio).toContain('label: "Setup"');
    expect(studio).toContain('label: "Test"');
    expect(studio).toContain('label: "Review"');
    expect(studio).toContain("StudioAgentReviewPanel");
    expect(studio).not.toContain("StudioAgentCanvas");
    expect(setup).not.toMatch(/AgentPresenceLivePreview|VoiceGallery/);
    expect(setup).toContain("<details");
    expect(setup).toContain("AgentToolPermissions");
    expect(workroom).toContain("/test/stream");
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
    expect(workroom).toContain("messages.slice(-12)");
    expect(workroom).toContain('history: mode === "test" ? history');
  });

  it("keeps voice choice customer-facing rather than narrating provider topology", () => {
    expect(voice).toMatch(/<MessageCircle[^>]*>[\s\S]*?Test\s*<\/button>/);
    expect(voice).not.toContain("Browser tests the words");
    expect(voice).not.toContain("Speech-to-Speech");
    expect(voice).not.toContain("live PSTN");
    expect(voice).not.toMatch(/Choose how live calls sound|Test call|hear it during a test call/);
  });
});
