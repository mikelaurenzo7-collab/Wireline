import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authenticated workspace design architecture", () => {
  it("keeps adjustable desktop panels accessible, persistent, and cleanup-safe", () => {
    const panel = read("src/components/layout/WorkspaceResizablePanel.tsx");
    expect(panel).toContain('role="separator"');
    expect(panel).toContain('aria-orientation="vertical"');
    expect(panel).toContain("pointermove");
    expect(panel).toContain("ArrowLeft");
    expect(panel).toContain("ArrowRight");
    expect(panel).toContain("localStorage.setItem");
    expect(panel).toContain("onDoubleClick={resetSize}");
    expect(panel).toContain("if (cleanupRef.current === cleanup) cleanupRef.current = null");
  });

  it("makes the global rail foldable and resizable instead of a fixed desktop column", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(shell).toContain("WorkspaceResizablePanel");
    expect(shell).toContain("defaultSize={232}");
    expect(shell).toContain("minSize={208}");
    expect(shell).toContain("maxSize={320}");
    expect(shell).toContain("collapsedSize={68}");
    expect(shell).toContain("wireline:workspace-rail:v1");
    expect(shell).not.toContain("lg:grid-cols-[236px_minmax(0,1fr)]");
  });

  it("keeps daily navigation focused on Studio, Inbox, then Calls", () => {
    const navigation = read("src/constants/navigation.ts");
    const workspaceStart = navigation.indexOf("export const WORKSPACE_NAV");
    const operateStart = navigation.indexOf("export const OPERATE_NAV");
    const workspace = navigation.slice(workspaceStart, operateStart);
    expect(workspace.indexOf('href: "/studio"')).toBeGreaterThanOrEqual(0);
    expect(workspace.indexOf('href: "/inbox"')).toBeGreaterThan(
      workspace.indexOf('href: "/studio"'),
    );
    expect(workspace.indexOf('href: "/phone"')).toBeGreaterThan(
      workspace.indexOf('href: "/inbox"'),
    );
    expect(workspace).not.toContain('href: "/connections"');
  });

  it("uses one shared responsive control band on authenticated section pages", () => {
    const controlBand = read("src/components/layout/WorkspaceControlBand.tsx");
    expect(controlBand).toContain("sm:flex-row sm:items-center");
    expect(controlBand).toContain("data-wireline-control-band");
    expect(controlBand).toContain("embedded");

    for (const path of [
      "src/pages/EmailPage.tsx",
      "src/pages/PhonePage.tsx",
      "src/pages/KnowledgePage.tsx",
      "src/pages/InsightsPage.tsx",
      "src/components/settings/SettingsTabs.tsx",
    ]) {
      expect(read(path), path).toContain("WorkspaceControlBand");
    }
  });

  it("keeps Studio conversation-first on wide screens with a compact adjustable inspector", () => {
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");

    expect(studio).toContain('useMediaQuery("(min-width: 1180px)")');
    expect(studio).toContain("wireline:studio-inspector:v1");
    expect(studio).toContain('side="right"');
    expect(studio).toContain("defaultSize={372}");
    expect(studio).toContain("minSize={312}");
    expect(studio).toContain("maxSize={520}");
    expect(studio).toContain("collapsedSize={44}");
    expect(studio).toContain("compact={splitWorkspace}");
    expect(studio).toContain('layout={splitWorkspace ? "split" : "standalone"}');
    expect(setup).toContain('data-wireline-studio-setup-density={compact ? "inspector" : "page"}');
    expect(review).toContain('data-wireline-studio-review-density={compact ? "inspector" : "page"}');
  });

  it("keeps the Studio composer compact, adaptive, and keyboard-native", () => {
    const workroom = read("src/components/StudioWorkroom.tsx");
    expect(workroom).toContain("showStarterPrompts");
    expect(workroom).toContain("quickPrompts.slice(0, 3)");
    expect(workroom).toContain('rows={1}');
    expect(workroom).toContain('textarea.style.minHeight = "52px"');
    expect(workroom).toContain("Math.min(Math.max(textarea.scrollHeight, 52), 160)");
    expect(workroom).toContain('window.matchMedia("(pointer: fine)").matches');
    expect(workroom).toContain("Shift+Enter line break");
  });

  it("lets call triage resize or fold the history list without changing mobile list-to-report flow", () => {
    const calls = read("src/components/CallLogsClaude.tsx");
    expect(calls).toContain("WorkspaceResizablePanel");
    expect(calls).toContain("wireline:calls-history-pane:v1");
    expect(calls).toContain("SearchField");
    expect(calls).toContain('useMediaQuery("(min-width: 1024px)")');
    expect(calls).toContain('aria-label="Open call list"');
    expect(calls).toContain('aria-label="Collapse call list"');
    expect(calls).toContain('className={`${selected ? "hidden" : "block"} h-full');
  });

  it("flattens Activity to one category strip plus one compact subview control", () => {
    const activity = read("src/pages/InsightsPage.tsx");
    expect(activity).toContain("WorkspaceControlBand");
    expect(activity).toContain('aria-label="Activity view"');
    expect(activity).toContain("chrome.secondary.tabs.map");
    expect(activity).not.toContain("AppChromeSubTabs");
  });

  it("keeps phone line management canonical in Calls rather than duplicated in Settings", () => {
    const routes = read("src/routes/AppRoutes.tsx");
    const settingsTabs = read("src/components/settings/SettingsTabs.tsx");
    expect(routes).toContain('path="/settings/phone" element={<Navigate to="/phone?tab=setup" replace />}');
    expect(routes).not.toContain('const PhoneSettings = lazy');
    expect(settingsTabs).not.toContain('href: "/settings/phone"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
  });
});

// Exact-head certification marker: the Vercel preview for this commit must run the full clean-room estate.