import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/studio/BotLivePanel.tsx", "utf8");
const mailRoutes = readFileSync("src/routes/email-routes.ts", "utf8");
const inbox = readFileSync("src/components/EmailInbox.tsx", "utf8");

describe("Bot Live activity source and action contracts", () => {
  it("reads email timestamps and recipients from the actual snake_case API payload", () => {
    expect(mailRoutes).toContain("mapObjectToSnake(");
    expect(mailRoutes).toMatch(/\(\{\s*\.\.\.thread,\s*activityAt: snapshotActivity,?\s*\}\)/);
    expect(panel).toContain("thread.activity_at || thread.last_message_at || thread.created_at");
    expect(panel).toContain("thread.customer_email");
    expect(inbox).toContain(
      "text(row.activity_at) || text(row.last_message_at) || text(row.created_at)",
    );
    expect(panel).not.toContain("thread.snapshotActivity || thread.lastMessageAt");
  });

  it("does not show a prior Bot's activity or let stale poll responses overwrite the current Bot", () => {
    expect(panel).toContain("const [loadedAgentId, setLoadedAgentId] = useState(agentId)");
    expect(panel).toContain("const current = loadedAgentId === agentId;");
    expect(panel).toContain("tasks: current ? tasks : []");
    expect(panel).toContain("calls: current ? calls : []");
    expect(panel).toContain("threads: current ? threads : []");
    expect(panel).toContain("setSourcesLoaded(false)");
    expect(panel).toContain("setSourcesUnavailable(false)");
    expect(panel).toContain("request !== latestRequest");
    expect(panel).toContain("request === latestRequest");
  });

  it("makes waiting computer work and pending approvals actionable without auto-running anything", () => {
    expect(panel).toContain("setSelectedId(activeComputerTask.id)");
    expect(panel).toContain("Reply to task");
    expect(panel).toContain("Watch live work");
    expect(panel).toContain('to="/approvals"');
    expect(panel).toContain("Open Needs You");
    expect(panel).not.toMatch(/approvals? waiting|Review approvals|Approval waiting/);
    expect(panel).toContain("setSourcesUnavailable(successfulSources !== 3)");
    expect(panel).toContain("Checking recent activity…");
    expect(panel).toContain("Activity unavailable");
    expect(panel).toMatch(
      /sourcesUnavailable\s*\? "Couldn’t load recent activity\."\s*:\s*"No recent activity\."/,
    );
    expect(panel).toContain("waitingApprovals.length");
    expect(panel).toContain('"Needs review"');
  });
});
