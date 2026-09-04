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

  it("makes the global rail foldable, resizable, and canonically owned", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const polish = read("src/styles/application-polish.css");
    expect(shell).toContain("WorkspaceResizablePanel");
    expect(shell).toContain("defaultSize={232}");
    expect(shell).toContain("minSize={208}");
    expect(shell).toContain("maxSize={320}");
    expect(shell).toContain("collapsedSize={68}");
    expect(shell).toContain("wireline:workspace-rail:v1");
    expect(shell).toContain('className="wl-shell-nav-item wl-focus-ring-halo"');
    expect(shell).toContain('className="wl-shell-bot-context wl-focus-ring-halo"');
    expect(shell).toContain(
      'className="wl-shell-account min-h-[44px] wl-focus-ring-halo"',
    );
    expect(shell).not.toContain("wl-rail-link");
    expect(shell).not.toContain("wl-rail-agent-link");
    expect(shell).not.toContain("lg:grid-cols-[236px_minmax(0,1fr)]");
    expect(polish).not.toContain("grid-template-columns: 224px");
    expect(polish).not.toMatch(
      /aside\[aria-label="Workspace navigation"\][^{]*\{[^}]*width:\s*224px/s,
    );
  });

  it("keeps Inbox empty, search-miss, and initial-error states on one intentional pane", () => {
    const email = read("src/components/EmailInbox.tsx");
    const sms = read("src/components/SmsThreads.tsx");
    const polish = read("src/styles/authenticated-visual-qa.css");

    for (const source of [email, sms]) {
      expect(source).toContain("wl-channel-inbox-grid");
      expect(source).toContain('data-empty={listOwnsOnlyState ? "true" : undefined}');
    }
    expect(email).toContain('title="No matching email"');
    expect(email).toContain("setDetail(null);");
    expect(email).toContain("setDetailError(null);");
    expect(email).toContain("detailError && !detail");
    expect(email).toContain("function EmailBackButton");
    expect(email).toContain('title="Conversation needs attention"');
    expect(email).toContain("onClick={() => void loadThreadDetail(selectedId)}");
    expect(sms).toContain('title="No matching texts"');
    expect(sms).toContain('title="Texts unavailable"');
    expect(sms).toContain("onClick={() => void fetchThreads()}");
    expect(polish).toContain('.wl-channel-inbox-grid[data-empty="true"]');
    expect(polish).not.toContain(".wl-channel-inbox-grid:has(");
  });

  it("keeps the custom Team invite dialog scrollable on short viewports", () => {
    const team = read("src/pages/TeamSettings.tsx");
    expect(team).toContain("px-[max(0.75rem,env(safe-area-inset-left))]");
    expect(team).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(team).toContain("pt-[max(0.75rem,env(safe-area-inset-top))]");
    expect(team).toContain(
      "max-h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top))-max(1.5rem,env(safe-area-inset-bottom)))]",
    );
    expect(team).toContain("overflow-y-auto overscroll-contain");
  });

  it("keeps a Studio page heading when the active Bot name becomes a switcher", () => {
    const chrome = read("src/components/studio/StudioContextChrome.tsx");
    const multipleAgents = chrome.slice(
      chrome.indexOf("{agents.length > 1 ? ("),
      chrome.indexOf(") : (", chrome.indexOf("{agents.length > 1 ? (")),
    );

    expect(multipleAgents).toContain('<h1 className="sr-only">{activeAgent.name}</h1>');
    expect(multipleAgents).toContain('aria-label="Switch Bot"');
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
    expect(studio.match(/compact=\{splitWorkspace\}/g)).toHaveLength(2);
    expect(studio).toContain('layout={splitWorkspace ? "split" : "standalone"}');
    expect(setup).toContain('data-wireline-studio-setup-density={compact ? "inspector" : "page"}');
    expect(setup).toContain("Define the role. {agentName} owns the outcome.");
    expect(setup).toContain("Then let {agentName} handle the work end");
    expect(setup).not.toContain("one clear job");
    expect(setup).toContain("wl-preserve-case text-lg font-semibold");
    expect(review).toContain(
      'data-wireline-studio-review-density={compact ? "inspector" : "page"}',
    );
  });

  it("keeps the Studio composer compact, adaptive, and keyboard-native", () => {
    const workroom = read("src/components/StudioWorkroom.tsx");
    expect(workroom).toContain("showStarterPrompts");
    expect(workroom).toContain("quickPrompts.slice(0, 3)");
    expect(workroom).toContain("rows={1}");
    expect(workroom).toContain('textarea.style.minHeight = "52px"');
    expect(workroom).toContain("Math.min(Math.max(textarea.scrollHeight, 52), 160)");
    expect(workroom).toContain('window.matchMedia("(pointer: fine)").matches');
    expect(workroom).toContain("event.shiftKey");
    expect(workroom).not.toContain("Shift+Enter line break");
  });

  it("keeps the canonical shell readable and preserves semantic surfaces", () => {
    const shell = read("src/styles/workspace-shell.css");
    const master = read("src/styles/botbound-master-polish.css");
    const typeIntegrity = read("src/styles/type-integrity.css");

    expect(shell).not.toMatch(/font-weight:\s*(560|650)/);
    expect(shell).not.toMatch(/font-size:\s*0\.(5625|625)rem/);
    expect(shell).not.toContain(".wl-rail-link");
    expect(shell).not.toContain(".wl-rail-agent-link");
    expect(shell).toContain(
      '.wl-shell-bot-context[data-wireline-bot-selected="true"]',
    );
    expect(shell).toContain(
      '.wl-shell-bot-context[data-wireline-bot-selected="true"]::before',
    );
    expect(master).not.toContain("--bb-polish-content-max");
    expect(master).toContain("--bb-polish-shadow: var(--wireline-elevation-md);");
    expect(master).toContain(':not([class*="bg-"])');
    expect(master).not.toContain(".wl-workspace-shell .wl-workspace-rail-panel");
    expect(master).not.toContain('.wl-workspace-shell nav[aria-label="Workspace navigation"]');
    expect(master).not.toMatch(/wl-workspace-shell[\s\S]{0,180}:focus-visible/);
    expect(master).not.toMatch(/wl-workspace-shell[\s\S]{0,180}:active/);
    expect(typeIntegrity).toContain(".wl-shell-dock-item");
    expect(typeIntegrity).toContain(".wl-shell-more-group-label");
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
    expect(calls).toContain("if (!desktop || selectedId || !visibleCalls.length) return");
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
    expect(routes).toContain('path="/settings/phone" element={<PhoneSettingsRedirect />}');
    expect(routes).toContain('search.set("tab", "setup")');
    expect(routes).not.toContain("const PhoneSettings = lazy");
    expect(settingsTabs).not.toContain('href: "/settings/phone"');
    expect(settingsTabs).toContain("WorkspaceControlBand");
  });

  it("gives outbound dispatch an empty queue instead of a lone intake accordion", () => {
    const hub = read("src/components/outbound/OutboundHub.tsx");
    expect(hub).toContain('title="No dispatch queue"');
    expect(hub).toContain('label: "Lead Hunt"');
    expect(hub).toContain('onViewChange("campaigns")');
    expect(hub).toContain("Lead intake");
  });

  it("keeps Lead Hunt as the empty campaign canvas and reveals past appointments", () => {
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const appointments = read("src/components/AppointmentsPanel.tsx");
    const cadences = read("src/components/Cadences.tsx");
    const inbox = read("src/components/EmailInbox.tsx");

    expect(campaigns).toContain("{!showCreate ? (");
    expect(campaigns).toContain("OPS_CHANNEL_EMPTY.campaigns.title");
    expect(campaigns).not.toContain("icon={Megaphone}");
    expect(appointments).toContain("open={pastOpen ?? upcoming.length === 0}");
    expect(appointments).not.toContain("defaultOpen");
    expect(cadences).not.toContain("Multi-touch cadences");
    expect(cadences).toContain("flex-col items-stretch");
    expect(cadences).toContain("whitespace-normal");
    expect(inbox).toContain("mailboxConnected === false");
  });
});

// Exact-head certification marker: the Vercel preview for this commit must run the full clean-room estate.
