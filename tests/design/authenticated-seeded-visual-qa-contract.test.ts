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
    const advancedInventory = connections.slice(
      connections.indexOf("data-wireline-integration-map"),
    );
    expect(advancedInventory).toMatch(
      /<AccordionTrigger[^>]*>[\s\S]*?Advanced[\s\S]*?<\/AccordionTrigger>/,
    );
    expect(advancedInventory).toContain("<AccordionContent");
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

  it("keeps Studio home task-first, compact, and free of a separate dashboard greeting", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    const routes = read("src/routes/AppRoutes.tsx");

    expect(routes).toContain('<Route path="/" element={<Navigate to="/studio" replace />} />');
    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(studio).toContain('title="Start With One Job"');
    expect(studio).toContain("Create Bot");
    expect(studio).not.toContain("Good morning");
    expect(studio).not.toContain("dayGreeting");
    expect(chrome).toContain('aria-label="Switch Bot"');
    expect(chrome).toContain("/inbox?agent=");
    expect(chrome).toContain("/phone?agent=");
  });

  it("removes decorative ledger treatment from authenticated task surfaces", () => {
    const css = read("src/styles/workspace-polish.css");
    expect(css).toMatch(/\.wl-workspace-shell::before\s*\{[\s\S]*content: none;/);
    expect(css).toContain("reserve color for state and action");
  });

  it("captures internal scroll ends and deduplicates runtime findings", () => {
    const visualQa = read("scripts/capture-visual-qa.mjs");
    expect(visualQa).toContain("captureInternalScrollEnd");
    expect(visualQa).toContain('file.replace(/\\.png$/, "-end.png")');
    expect(visualQa).toContain("issues.some");
    expect(visualQa).toContain('localStorage.setItem("wireline_cookie_consent", "acknowledged")');
  });

  it("keeps authenticated category tabs inside a real horizontal scroller on phones", () => {
    const css = read("src/styles/system-refinement-pass-two.css");
    const tabs = read("src/components/layout/ClientSubTabs.tsx");
    const rule =
      css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(
          /:where\(\[role="tablist"\]\.tab-strip-scroll, \.app-tab-strip\)\s*\{[^}]*\}/,
        )?.[0] ?? "";

    expect(rule).not.toBe("");
    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("max-width: 100%");
    expect(tabs).toContain("tab-strip-scroll");
    expect(tabs).toContain("min-w-0 max-w-full");
  });
});
