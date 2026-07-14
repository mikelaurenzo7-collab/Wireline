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
  const studioTest = read("src/components/StudioWorkroom.tsx");
  const studioReview = read("src/components/StudioAgentReviewPanel.tsx");

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
    expect(overview).toMatch(/Google Business Profile/);
    expect(overview).toMatch(/missed-call forwarding/);
    expect(overview).toMatch(/Review follow-ups/);
  });

  it("does not offer live calling before a line exists", () => {
    expect(overview).toMatch(/hasLiveLine \? \(/);
    expect(overview).toMatch(/Start a call/);
    expect(overview).toMatch(/Test employee/);
    expect(overview).toMatch(/hasConversationHistory/);
    expect(overview).toMatch(/No new conversations today\. Your customer line is still ready/);
  });

  it("keeps activation inside the current guided workflow", () => {
    expect(activation).toMatch(/Get ready for real customers/);
    expect(activation).toMatch(/Job and greeting defined/);
    expect(activation).toMatch(/Business facts added/);
    expect(activation).toMatch(/Phone number connected/);
    expect(activation).toMatch(/Test conversation completed/);
    expect(activation).toMatch(/First live customer handled/);
    expect(activation).toMatch(/First follow-up reviewed/);
    expect(activation).toMatch(/\/studio\?section=setup/);
    expect(activation).toMatch(/\/studio\?section=test/);
    expect(activation).not.toMatch(/knowledge\?tab=simulator/);
    expect(activation).not.toMatch(/Voice previewed/);
  });

  it("keeps Studio on a simple setup, test, review loop", () => {
    expect(studioWorkspace).toMatch(/"setup" \| "test" \| "review"/);
    expect(studioWorkspace).toMatch(/StudioAgentReviewPanel/);
    expect(studioWorkspace).not.toMatch(/StudioAgentCanvas/);
    expect(studioTest).toMatch(/Customer says:/);
    expect(studioTest).toMatch(/Browser roleplay only/);
    expect(studioReview).toMatch(/Confirm the essentials, run one realistic conversation/);
    expect(studioReview).toMatch(/Connect phone/);
  });
});
