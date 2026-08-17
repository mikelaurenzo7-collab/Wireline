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
    expect(css).toContain(":has(h1.sr-only)::after");
    expect(css).toContain(":has(> section:first-child .wl-empty-state)");
    expect(css).not.toContain("article:nth-of-type(n + 4)");
    expect(css).not.toContain(":nth-child(n + 7):not(:last-child)");
  });

  it("keeps the Overview header a short left-aligned line, with no salutation", () => {
    const css = read("src/styles/authenticated-visual-qa.css");
    const overview = read("src/pages/OverviewPage.tsx");

    expect(css).toContain(".wl-overview-greeting .wl-display-2");
    expect(css).toContain("max-width: 22ch");
    expect(css).toContain("margin: 0.9rem 0 0");
    expect(css).not.toContain("margin: 0.9rem auto 0");
    // No "Good morning, <name>": it was the largest type in the product
    // carrying the least information, and on first run it sat directly above a
    // panel whose own heading said the only thing worth saying.
    expect(overview).not.toContain("dayGreeting");
    expect(overview).not.toContain("Let's put your first");
    expect(overview).toContain("wl-overview-greeting text-left");
    // First run has exactly one title, and it is the activation heading.
    expect(overview).toContain('id="first-run-title"');
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
    expect(visualQa).toContain('localStorage.setItem("wireline_cookie_consent", "acknowledged")');
  });

  it("hides a singleton Insights secondary strip that would reprint the category", () => {
    const chrome = read("src/components/layout/AppChromeSubTabs.tsx");
    expect(chrome).toContain("secondary.tabs.length > 1");
  });

  it("keeps Insights category tabs inside a real horizontal scroller on phones", () => {
    const css = read("src/styles/system-refinement-pass-two.css");
    const tabs = read("src/components/layout/ClientSubTabs.tsx");
    const rule =
      css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(
          /:where\(\[role="tablist"\]\.tab-strip-scroll, \.app-tab-strip\)\s*\{[^}]*\}/,
        )?.[0] ?? "";

    expect(
      rule,
      "tab rails must declare overflow-x so Revenue cannot escape the viewport",
    ).not.toBe("");
    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("max-width: 100%");
    expect(tabs).toContain("tab-strip-scroll");
    expect(tabs).toContain("min-w-0 max-w-full");
    expect(tabs).not.toContain("flex shrink-0 items-center");
  });
});
