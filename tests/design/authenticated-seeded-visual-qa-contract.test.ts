import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("authenticated seeded-state visual QA contract", () => {
  it("keeps shared workspace tabs restrained instead of using solid action fills", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    expect(tabs).toContain('data-active={active ? "true" : "false"}');
    expect(tabs).toContain("bg-primary/15 text-primary");
    expect(tabs).not.toContain("bg-primary text-primary-foreground");
  });

  it("keeps the technical integration inventory behind progressive disclosure", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    expect(connections).toContain(
      '<Accordion type="single" collapsible data-wireline-integration-map>',
    );
    expect(connections).toMatch(
      /<AccordionTrigger[^>]*>\s*Integration capabilities\s*<\/AccordionTrigger>/,
    );
    expect(connections).toContain("<IntegrationOperatingMap />");
  });

  it("keeps insights range selection visually secondary to the data", () => {
    const insights = read("src/components/insights/InsightsView.tsx");
    expect(insights).toMatch(/SegmentStrip[\s\S]*variant="soft"/);
  });

  it("collapses redundant seeded-state density without weakening empty states", () => {
    const css = read("src/styles/authenticated-visual-qa.css");
    expect(css).toContain(".wl-workspace-shell .wl-rail-link kbd");
    expect(css).toContain("article:nth-of-type(n + 4)");
    expect(css).toContain(":has(> section:first-child .wl-empty-state)");
  });

  it("removes the decorative ledger treatment from authenticated task surfaces", () => {
    const css = read("src/styles/workspace-polish.css");
    expect(css).toMatch(/\.wl-workspace-shell::before\s*\{[\s\S]*content: none;/);
    expect(css).toContain("reserve color for state and action");
  });

  it("captures the end of internal scroll regions and deduplicates runtime findings", () => {
    const visualQa = read("scripts/capture-visual-qa.mjs");

    expect(visualQa).toContain("captureInternalScrollEnd");
    expect(visualQa).toContain('file.replace(/\\.png$/, "-end.png")');
    expect(visualQa).toContain("issues.some");
  });
});
