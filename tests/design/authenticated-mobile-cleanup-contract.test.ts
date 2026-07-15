import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated mobile cleanup", () => {
  it("renders existing short tab labels without weakening accessible names", () => {
    const tabStrip = read("src/components/layout/WorkspaceTabStrip.tsx");
    const tabs = read("src/lib/page-sub-tabs.ts");

    expect(tabStrip).toContain("shortLabel?: string");
    expect(tabStrip).toContain('className="sm:hidden"');
    expect(tabStrip).toContain('className="hidden sm:inline"');
    expect(tabStrip).toContain("`${fullLabel} (${tab.shortLabel})`");
    expect(tabs).toContain('shortLabel: "Camps"');
    expect(tabs).toContain('shortLabel: "Seq"');
    expect(tabs).toContain('shortLabel: "Calls"');
  });

  it("keeps authenticated metrics glanceable instead of stacking full cards", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");

    expect(overview).toContain("grid grid-cols-2 gap-2");
    expect(overview).toContain("wl-metric-tile--compact");
    expect(overview).toContain("wl-metric-tile__detail hidden sm:block");
    expect(knowledge).toContain("grid grid-cols-3 gap-2");
    expect(knowledge).toContain("wl-metric-tile--compact");
  });

  it("keeps outbound controls concise without duplicating empty-state actions", () => {
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const cadences = read("src/components/Cadences.tsx");
    const outbound = read("src/components/outbound/OutboundHub.tsx");

    expect(campaigns).toContain(
      "flex flex-col items-stretch gap-2 sm:flex-row",
    );
    expect(campaigns).toContain('aria-label="Refresh campaigns"');
    expect(campaigns).toContain("campaigns.length > 0 ?");
    expect(cadences).toContain(
      "Build timed call, SMS, and email follow-up sequences.",
    );
    expect(cadences).not.toMatch(/job-worker|\/pipeline/);
    expect(cadences).toContain("cadences.length > 0 && !showBuilder");
    expect(outbound).toMatch(/Consent checks run\s+before every dial/);
    expect(outbound).not.toContain("grid grid-cols-3 gap-2");
  });

  it("keeps heavy-user exceptions and phone-width actions in view", () => {
    const activation = read("src/components/ActivationChecklist.tsx");
    const outcomes = read("src/components/OutcomeLedger.tsx");
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");
    const knowledgePage = read("src/pages/KnowledgePage.tsx");
    const connections = read("src/pages/ConnectionsPage.tsx");
    const mailbox = read("src/components/MailboxConnectionCard.tsx");
    const callLogs = read("src/components/CallLogsClaude.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const phone = read("src/pages/PhonePage.tsx");

    expect(activation).toContain("grid grid-cols-2 gap-2 lg:grid-cols-3");
    expect(activation).toContain("hidden text-[11px] leading-4");
    expect(outcomes).toContain("line-clamp-3");
    expect(outcomes).toContain('row.compliance_state !== "clear"');
    expect(outcomes).toContain("row.lead_score > 0");
    expect(knowledge).toContain("sm:[&>button]:w-auto");
    expect(knowledgePage).toContain('shortLabel: "Knowledge"');
    expect(connections).not.toContain("Connect a channel");
    expect(mailbox).not.toContain("Optional next");
    expect(callLogs).toContain('shortLabel: "Stats"');
    expect(callLogs).toContain('aria-label="Export calls as CSV"');
    expect(studio).toContain("hidden size-4 shrink-0 sm:block");
    expect(phone).toContain('title="Connect a calendar"');
  });

  it("keeps guidance once, next to the decision it supports", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");
    const voice = read("src/components/voice/SimpleVoicePicker.tsx");
    const inbox = read("src/components/EmailInbox.tsx");

    expect(setup).not.toMatch(/Set the tone, greeting, essential facts/);
    expect(setup).not.toMatch(
      /Add only what the first customer workflow needs/,
    );
    expect(review).not.toMatch(/Keep the loop small/);
    expect(voice).toMatch(
      /Browser tests the words\. Place a real call to verify the selected\s+audio\./,
    );
    expect(inbox).toContain(
      "Connect Gmail or Outlook to sync customer threads.",
    );
  });
});
