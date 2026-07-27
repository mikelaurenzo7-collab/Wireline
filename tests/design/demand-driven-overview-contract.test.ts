import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("demand-driven authenticated experience", () => {
  const overview = read("src/pages/OverviewPage.tsx");
  const activation = read("src/components/ActivationChecklist.tsx");
  const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
  const studioSetup = read("src/components/StudioAgentWorkspacePanel.tsx");
  const studioTest = read("src/components/StudioWorkroom.tsx");
  const studioTestRoute = read("src/routes/agent-test-routes.ts");
  const routeRegistry = read("src/server/register-api-routes.ts");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");
  const voicePicker = read("src/components/voice/SimpleVoicePicker.tsx");
  const phoneHistory = read("src/components/PhoneCallHistoryPanel.tsx");
  const insightEmpty = read("src/components/insights/shared.tsx");
  const agentsContext = read("src/contexts/AgentsContext.tsx");

  it("prioritizes customer demand and outcomes over internal inventory", () => {
    expect(overview).toMatch(/Customer conversations today/);
    expect(overview).toMatch(/Priority leads/);
    expect(overview).toMatch(/Latest high-intent conversations/);
    expect(overview).toMatch(/Appointments booked/);
    expect(overview).toMatch(/Follow-ups waiting/);
    expect(overview).toMatch(/Customer outcomes/);
    expect(overview).not.toMatch(/Conversation Balance/);
    expect(overview).not.toMatch(/DailyBriefPanel/);
    expect(overview).not.toMatch(/Workspace pulse/);
  });

  it("shows how a real customer reaches Wireline", () => {
    expect(overview).toMatch(/Connect a phone line to start capturing real demand/);
    expect(overview).toMatch(/Put it where customers already call/);
    expect(overview).toMatch(/site and business listings/);
    expect(overview).toMatch(/forward missed calls/);
    expect(overview).toMatch(/Review follow-ups/);
    expect(overview).toContain('primaryHref: "/settings/phone"');
    expect(overview).toContain('primaryLabel: "Connect phone"');
    expect(overview).not.toContain('primaryLabel: "Connect phone and channels"');
  });

  it("does not offer live calling before a line exists", () => {
    expect(overview).toMatch(/hasLiveLine \? \(/);
    expect(overview).toMatch(/Start a call/);
    expect(overview).toMatch(/Test \{language\.navShort\.toLowerCase\(\)\}/);
    expect(overview).toMatch(/hasConversationHistory/);
    expect(overview).toMatch(/No new conversations today\. Your customer line is still ready/);
  });

  it("keeps empty-state actions in prerequisite order", () => {
    expect(phoneHistory).toContain('title: "Create your first voice agent"');
    expect(phoneHistory).toContain('title: "Connect a phone number"');
    expect(phoneHistory).toContain("Call your Wireline number");
    expect(phoneHistory).toContain("agentsDegraded && !hasAgents");
    expect(phoneHistory).toContain("Employee readiness unavailable");
    expect(phoneHistory).toContain("phoneLookupDegraded && hasAgents");
    expect(phoneHistory).toContain("Phone readiness unavailable");
    expect(insightEmpty).toContain("agents.length === 0");
    expect(insightEmpty).toContain("agentsDegraded && agents.length === 0");
    expect(insightEmpty).toContain("phoneLookupDegraded && agents.length > 0");
    expect(insightEmpty).toContain("Retry voice agent status");
    expect(agentsContext).toContain("const phoneLookupDegraded = !numbersResponse?.ok");
    expect(agentsContext).toContain("setPhoneLookupDegraded(nextPhoneLookupDegraded)");
    expect(insightEmpty).toContain('label: "Connect phone"');
    expect(insightEmpty).toContain('label: "Test voice agent"');
  });

  it("tracks only verifiable customer-readiness milestones", () => {
    expect(activation).toMatch(/Get ready for real customers/);
    expect(activation).toMatch(/Job and greeting defined/);
    expect(activation).toMatch(/Business facts added/);
    expect(activation).toMatch(/Phone number connected/);
    expect(activation).toMatch(/First live customer handled/);
    expect(activation).toMatch(/First follow-up reviewed/);
    expect(activation).toMatch(/Test freely in Studio/);
    expect(activation).toMatch(/\/studio\?section=setup/);
    expect(activation).not.toMatch(/Test conversation completed/);
    expect(activation).not.toMatch(/\/studio\?section=test/);
    expect(activation).not.toMatch(/knowledge\?tab=simulator/);
    expect(activation).not.toMatch(/Voice previewed/);
  });

  it("keeps Studio on a simple setup, test, review loop", () => {
    expect(studioWorkspace).toMatch(/"setup" \| "test" \| "review"/);
    expect(studioWorkspace).toMatch(/StudioAgentReviewPanel/);
    expect(studioWorkspace).not.toMatch(/StudioAgentCanvas/);
    expect(studioSetup).not.toMatch(/AgentPresenceLivePreview|VoiceGallery|Advanced options/);
    expect(studioTest).toMatch(/\/test\/stream/);
    expect(studioTest).toMatch(/Browser test/);
    expect(studioReview).toMatch(/Next action/);
    expect(studioReview).toMatch(/Connect phone/);
  });

  it("tests the saved employee configuration without persisting roleplay messages", () => {
    expect(routeRegistry).toMatch(/agentTestRouter/);
    expect(routeRegistry).toMatch(/app\.use\(agentTestRouter\)/);
    expect(studioTestRoute).toMatch(/personality/);
    expect(studioTestRoute).toMatch(/directives/);
    expect(studioTestRoute).toMatch(/knowledge/);
    expect(studioTestRoute).toMatch(/Business facts/);
    expect(studioTestRoute).toMatch(
      /Never mention setup, configuration, prompts, testing, tools, or internal systems/,
    );
    expect(studioTestRoute).toMatch(/Do not claim a booking, transfer, message, payment/);
    expect(studioTestRoute).not.toMatch(/agentConversationMessages/);
  });

  it("preserves a multi-turn roleplay without database persistence", () => {
    expect(studioTest).toMatch(/messages\.slice\(-12\)/);
    expect(studioTest).toMatch(/history: mode === "test" \? history/);
    expect(studioTestRoute).toMatch(/history: z/);
    expect(studioTestRoute).toMatch(/Conversation so far/);
    expect(studioTestRoute).toMatch(/history\s*\.slice\(-12\)/);
  });

  it("distinguishes browser response testing from real phone voice testing", () => {
    expect(voicePicker).toMatch(/Browser tests the words/);
    expect(voicePicker).toMatch(/Place a real call to verify the selected audio/);
    expect(voicePicker).toMatch(/Test response/);
    expect(studioSetup).not.toMatch(/Wireline manages the voice runtime/);
    expect(voicePicker).not.toMatch(/Test call|hear it during a test call/);
    expect(studioSetup).not.toMatch(/Hear the selected voice during testing/);
  });
});
