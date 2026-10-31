import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/studio/BotLivePanel.tsx", "utf8");
const mailRoutes = readFileSync("src/routes/email-routes.ts", "utf8");

describe("Bot Live activity source and action contracts", () => {
  it("reads email timestamps and recipients from the actual snake_case API payload", () => {
    expect(mailRoutes).toContain("mapObjectToSnake(");
    expect(mailRoutes).toContain("snapshotActivity: _snapshotActivity");
    expect(panel).toContain("thread.last_message_at || thread.created_at");
    expect(panel).toContain("thread.customer_email");
    expect(panel).not.toContain("thread.snapshotActivity || thread.lastMessageAt");
  });

  it("makes waiting computer work and pending approvals actionable without auto-running anything", () => {
    expect(panel).toContain("setSelectedId(activeComputerTask.id)");
    expect(panel).toContain("Reply in Computer");
    expect(panel).toContain("Watch live work");
    expect(panel).toContain('to="/approvals"');
    expect(panel).toContain("Review approvals");
    expect(panel).toContain('setSourcesUnavailable(successfulSources !== 3)');
    expect(panel).toContain("Checking recent activity…");
    expect(panel).toContain("Activity unavailable");
    expect(panel).toContain("This does not mean the Bot has done nothing.");
    expect(panel).toContain('waitingApprovals.length');
    expect(panel).toContain('"Needs review"');
  });
});
