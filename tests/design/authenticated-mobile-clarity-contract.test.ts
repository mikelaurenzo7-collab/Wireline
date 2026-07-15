import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated mobile clarity contract", () => {
  it("keeps Studio step names complete on narrow phones", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");

    expect(studio).toContain("hidden size-4 shrink-0 sm:block");
    expect(studio).toContain('whitespace-nowrap text-[11px] font-semibold sm:text-sm');
    expect(studio).not.toContain('truncate text-xs font-semibold sm:text-sm');
  });

  it("uses intentional short labels for crowded secondary tab strips", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    const routes = read("src/lib/page-sub-tabs.ts");

    expect(tabs).toContain("shortLabel?: string");
    expect(tabs).toContain('className="sm:hidden"');
    expect(tabs).toContain('className="hidden sm:inline"');
    expect(routes).toContain('shortLabel: "Camps"');
    expect(routes).toContain('shortLabel: "Seq"');
  });

  it("bounds the heavy-account employee selector above fixed mobile chrome", () => {
    const page = read("src/pages/KnowledgePage.tsx");

    expect(page).toContain("SelectContent");
    expect(page).toContain("max-h-[min(20rem,55dvh)]");
    expect(page).not.toContain("NativeSelect");
  });

  it("keeps knowledge stats compact and the upload action in normal mobile flow", () => {
    const knowledge = read("src/components/KnowledgeBaseClaude.tsx");

    expect(knowledge).toContain("grid grid-cols-3");
    expect(knowledge).toContain("wl-metric-tile--compact");
    expect(knowledge).toContain("sm:absolute sm:right-4");
    expect(knowledge).not.toContain('absolute right-4 top-1/2 -translate-y-1/2');
  });

  it("avoids duplicate empty-state creation actions", () => {
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const cadences = read("src/components/Cadences.tsx");

    expect(campaigns).toContain("campaigns.length > 0");
    expect(cadences).toContain("cadences.length > 0");
    expect(cadences).toContain("Or start from a template");
  });

  it("keeps heavy dashboard information scannable", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const outcomes = read("src/components/OutcomeLedger.tsx");

    expect(overview).toContain("grid grid-cols-2 gap-3 lg:grid-cols-4");
    expect(overview).toContain("wl-metric-tile--compact");
    expect(overview).not.toContain("What customers needed, what Wireline completed");
    expect(outcomes).toContain("line-clamp-3");
  });

  it("keeps the disconnected inbox concise", () => {
    const inbox = read("src/components/EmailInbox.tsx");

    expect(inbox).toContain("Connect Gmail or Outlook to see synced threads here.");
    expect(inbox).toContain('variant="ghost"');
    expect(inbox).not.toMatch(/threads\.length === 0[\s\S]{0,500}\n\s+fill/);
  });
});
