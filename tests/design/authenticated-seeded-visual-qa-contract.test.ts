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

  it("keeps the technical integration inventory out of customer Connections", () => {
    const connections = read("src/pages/ConnectionsPage.tsx");
    expect(connections).toContain("MailboxConnectionCard");
    expect(connections).toContain("CrmConnectionCard");
    expect(connections).not.toMatch(/IntegrationOperatingMap|data-wireline-integration-map/);
  });

  it("keeps insights range selection visually secondary to the data", () => {
    const insights = read("src/components/insights/InsightsView.tsx");
    expect(insights).toMatch(/SegmentStrip[\s\S]*variant="soft"/);
  });

  it("collapses redundant seeded-state density without weakening empty states", () => {
    const css = read("src/styles/authenticated-visual-qa.css");
    expect(css).toContain(".wl-workspace-shell .wl-rail-link kbd");
    expect(css).toContain(":has(h1.sr-only)::after");
    expect(css).toContain('.wl-channel-inbox-grid[data-empty="true"]');
    expect(css).not.toContain(".wl-channel-inbox-grid:has(");
    expect(css).not.toContain("article:nth-of-type(n + 4)");
    expect(css).not.toContain(":nth-child(n + 7):not(:last-child)");
  });

  it("keeps Studio home task-first, compact, and free of a separate dashboard greeting", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    const routes = read("src/routes/AppRoutes.tsx");

    expect(routes).toContain('<Route path="/" element={<Navigate to="/studio" replace />} />');
    expect(routes).toContain('path="/overview" element={<ToStudioRedirect />}');
    expect(studio).toContain('title="Build Your Bot"');
    expect(studio).toContain("Create Bot");
    expect(studio).toContain("data-studio-first-run");
    expect(studio).toContain("sm:pt-12 lg:pt-16");
    expect(studio).not.toMatch(/<EmptyState\s+fill\s+icon=\{Sparkles\}/);
    expect(studio).not.toContain("Good morning");
    expect(studio).not.toContain("dayGreeting");
    expect(chrome).toContain('aria-label="Switch Bot"');
    expect(chrome).toContain("/inbox?agent=");
    expect(chrome).toContain("/phone?agent=");
    expect(chrome.match(/hidden size-9 px-0 lg:inline-flex/g)).toHaveLength(2);
  });

  it("uses navigation semantics only for links and pressed-state semantics for in-page tabs", () => {
    const tabs = read("src/components/layout/WorkspaceTabStrip.tsx");
    const linkBranch = tabs.slice(
      tabs.indexOf("if (tab.href)"),
      tabs.indexOf("return (", tabs.indexOf("if (tab.href)") + 30),
    );
    const buttonBranch = tabs.slice(tabs.lastIndexOf("<button"), tabs.lastIndexOf("</button>") + 9);

    expect(linkBranch).toContain('aria-current={active ? "page" : undefined}');
    expect(buttonBranch).toContain("aria-pressed={active}");
    expect(buttonBranch).not.toContain("aria-current");
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

  it("rejects generic loaders and byte-identical screenshots as visual proof", () => {
    const visualQa = read("scripts/capture-visual-qa.mjs");
    expect(visualQa).toContain("productionVisualRouteExpectation");
    expect(visualQa).toContain('document.querySelectorAll("[data-visual-qa-page]")');
    expect(visualQa).toContain('document.querySelectorAll("[data-visual-qa-state]")');
    expect(visualQa).toContain('kind: "loading-state"');
    expect(visualQa).toContain('createHash("sha256")');
    expect(visualQa).toContain('kind: "duplicate-capture"');
    expect(visualQa).toContain("route-specific content was not proven");
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
