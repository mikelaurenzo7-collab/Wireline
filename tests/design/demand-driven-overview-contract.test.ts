import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("demand-driven authenticated experience", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const inbox = read("src/components/overview/UnifiedInbox.tsx");
  const rail = read("src/components/overview/OverviewRail.tsx");
  const firstRun = read("src/components/overview/FirstRunWorkspace.tsx");
  const activation = read("src/components/ActivationChecklist.tsx");
  const studio = read("src/components/StudioWorkspaceV2.tsx");
  const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
  const workroom = read("src/components/StudioWorkroom.tsx");
  const testRoute = read("src/routes/agent-test-routes.ts");
  const review = read("src/components/StudioAgentReviewPanel.tsx");
  const voice = read("src/components/voice/SimpleVoicePicker.tsx");

  it("prioritizes customer demand and outcomes over internal inventory", () => {
    expect(overview).toContain("Customer conversations today");
    expect(overview).toContain("High-intent today");
    expect(overview).toContain("Appointments booked");
    expect(overview).toContain("Needs attention");
    expect(overview).toContain("Customer demand and outcomes");
    expect(overview).toContain("OutcomeLedger");
    expect(inbox).toContain("Unified Inbox");
    expect(inbox).toContain("Recent customer conversations");
    expect(rail).toContain("BotRoster");
    expect(overview).not.toContain("Conversation Balance");
    expect(overview).not.toContain("DailyBriefPanel");
    expect(overview).not.toContain("Workspace pulse");
  });

  it("uses one role-first next action when the workspace is empty", () => {
    expect(overview).toContain("const isFirstRun = !loading && !degraded && !hasBots");
    expect(overview).toContain("<FirstRunWorkspace />");
    expect(firstRun).toContain("Build Your Bot");
    expect(firstRun).toContain("Create Your Own");
    expect(firstRun).toContain("Browse Templates");
    expect(firstRun).toContain("Choose the Job");
    expect(firstRun).toContain("Connect the Channels");
    expect(firstRun).toContain("Launch with Control");
    expect(`${overview}\n${firstRun}`).not.toContain("posture=");
  });

  it("does not offer live calling before a line exists", () => {
    expect(overview).toContain("const hasLiveLine = agents.some");
    expect(overview).toContain("hasLiveLine ? (");
    expect(overview).toContain("Start a Call");
    expect(overview).toContain('hasBots ? "Configure Bot" : "Create Bot"');
    expect(overview).toContain("primaryStudioHref");
  });

  it("isolates partial data failures instead of blanking independent truth", () => {
    expect(overview).toContain("setRecentUnavailable(true)");
    expect(overview).toContain("setMetricsUnavailable(true)");
    expect(overview).toContain("Conversation Preview Partial");
    expect(overview).toContain("Metrics Partial");
    expect(overview).toContain("unavailable={recentUnavailable && conversations.length === 0}");
    expect(overview).toContain("phoneLookupDegraded ? (");
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

  it("keeps Studio on a simple Set Up, Test, Review loop", () => {
    expect(studio).toContain('"setup" | "test" | "review"');
    expect(studio).toContain('label: "Set Up"');
    expect(studio).toContain("StudioAgentReviewPanel");
    expect(studio).not.toContain("StudioAgentCanvas");
    expect(setup).not.toMatch(/AgentPresenceLivePreview|VoiceGallery|Advanced options/);
    expect(workroom).toContain('/test/stream');
    expect(workroom).toContain("Browser test");
    expect(review).toContain('aria-label="Next actions"');
    expect(review).toContain("Connect phone");
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

  it("distinguishes browser response testing from real phone voice testing", () => {
    expect(voice).toContain("Browser tests the words");
    expect(voice).toMatch(/Place a real call to verify the selected audio/);
    expect(voice).toContain("Test response");
    expect(voice).not.toMatch(/Choose how live calls sound|Test call|hear it during a test call/);
  });
});
