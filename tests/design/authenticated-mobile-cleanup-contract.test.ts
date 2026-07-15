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
    expect(tabStrip).toContain(
      "tab.ariaLabel ?? (tab.shortLabel ? tab.label : undefined)",
    );
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

  it("stacks campaign controls and removes technical implementation prose", () => {
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const cadences = read("src/components/Cadences.tsx");
    const outbound = read("src/components/outbound/OutboundHub.tsx");

    expect(campaigns).toContain(
      "flex flex-col items-stretch gap-2 sm:flex-row",
    );
    expect(campaigns).toContain('aria-label="Refresh campaigns"');
    expect(cadences).toContain(
      "Build timed call, SMS, and email follow-up sequences.",
    );
    expect(cadences).not.toMatch(/job-worker|\/pipeline/);
    expect(outbound).toContain("grid grid-cols-3 gap-2");
    expect(outbound).toContain("hidden text-xs leading-relaxed");
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
