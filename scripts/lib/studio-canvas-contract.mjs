import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

export const STUDIO_CANVAS_VISION = {
  defaultSurface: "chat-plus-canvas",
  canvasSurface: "browser-workbench",
  agentSwitcher: "context-chrome",
  railBehavior: "resizable-and-collapsible",
  railWidthPx: 232,
  railMinPx: 208,
  railMaxPx: 320,
  railCollapsedPx: 68,
  workspaceDepthParam: "view=workspace",
  minTouchTargetPx: 44,
};

export const STUDIO_CANVAS_SURFACES = {
  appRoutes: "src/routes/AppRoutes.tsx",
  studioShell: "src/components/WorkspaceShell.tsx",
  resizablePanel: "src/components/layout/WorkspaceResizablePanel.tsx",
  navigation: "src/constants/navigation.ts",
  studioPageShell: "src/components/studio/StudioPageShell.tsx",
  studioChrome: "src/components/studio/StudioContextChrome.tsx",
  canvas: "src/components/StudioWorkspaceV2.tsx",
  workroom: "src/components/StudioWorkroom.tsx",
  workspacePanel: "src/components/StudioAgentWorkspacePanel.tsx",
  reviewPanel: "src/components/StudioAgentReviewPanel.tsx",
  studioHome: "src/pages/AgentStudioHome.tsx",
  agentPreference: "src/lib/studio-agent-preference.ts",
  activeAgentHook: "src/hooks/useStudioActiveAgentId.ts",
  authContext: "src/contexts/AuthContext.tsx",
  designVision: "src/lib/wireline-design-vision.ts",
};

export const STUDIO_CANVAS_FORBIDDEN = {
  appRoutes: [{ id: "provider-bound-studio-route", pattern: /AgentStudioHomeClaude/ }],
  studioPageShell: [
    { id: "duplicate-rail", pattern: /aria-label="Workspace navigation"/ },
    { id: "agent-tablist", pattern: /role="tablist"/ },
  ],
  studioChrome: [
    { id: "full-roster-copy", pattern: /Your agents|All Bots/ },
    { id: "duplicate-workspace-sections", pattern: /WorkspaceSectionNav/ },
  ],
  canvas: [
    { id: "agent-roster-grid", pattern: /Your agents/ },
    { id: "spatial-canvas", pattern: /StudioAgentCanvas/ },
  ],
  workspacePanel: [
    { id: "fake-badge", pattern: />\s*wired\s*</ },
    { id: "external-voice", pattern: /VoiceGallery|AgentPresenceLivePreview/ },
  ],
};

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "provider-neutral-studio-route", pattern: /pages\/AgentStudioHome"/ },
    { id: "root-to-studio", pattern: /path="\/" element=\{<Navigate to="\/studio"/ },
    { id: "overview-retired", pattern: /path="\/overview" element=\{<ToStudioRedirect/ },
    { id: "agents-redirect", pattern: /path="\/agents" element=\{<ToStudioRedirect/ },
  ],
  studioHome: [
    { id: "dedicated-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "canvas", pattern: /StudioWorkspaceV2/ },
  ],
  studioPageShell: [{ id: "shared-shell", pattern: /WorkspaceShell/ }],
  studioShell: [
    { id: "workspace-navigation", pattern: /Workspace navigation/ },
    { id: "resizable-rail", pattern: /WorkspaceResizablePanel/ },
    { id: "rail-default", pattern: /defaultSize=\{232\}/ },
    { id: "rail-range", pattern: /minSize=\{208\}[\s\S]*maxSize=\{320\}/ },
    { id: "rail-collapse", pattern: /collapsedSize=\{68\}/ },
    { id: "wordmark", pattern: /BotBoundWordmark/ },
    { id: "manage-nav", pattern: /OPERATE_NAV/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "nav-source", pattern: /from "\.\.\/constants\/navigation"/ },
    { id: "mobile-more", pattern: /MobileNavMoreSheet/ },
  ],
  resizablePanel: [
    { id: "persistent-panel", pattern: /localStorage\.setItem/ },
    { id: "pointer-resize", pattern: /pointermove/ },
    { id: "keyboard-resize", pattern: /ArrowLeft[\s\S]*ArrowRight/ },
    { id: "separator", pattern: /role="separator"/ },
    { id: "double-click-reset", pattern: /onDoubleClick=\{resetSize\}/ },
  ],
  navigation: [
    { id: "studio-label", pattern: /label: "Work"/ },
    { id: "scoped-workspace-navigation", pattern: /scopedWorkspaceHref/ },
    { id: "studio-active-state", pattern: /target === "\/studio"/ },
    {
      id: "daily-work-order",
      pattern: /href: "\/studio"[\s\S]*href: "\/inbox"[\s\S]*href: "\/phone"/,
    },
    { id: "no-mobile-home", pattern: /MOBILE_PRIMARY_NAV[\s\S]*href:\s*"\/studio"/ },
    { id: "apps-breadcrumb", pattern: /"\/apps": "Apps"/ },
  ],
  studioChrome: [
    { id: "context-label", pattern: /aria-label=\{`\$\{language\.singular\} context`\}/ },
    { id: "readiness", pattern: /agentReadinessLabel/ },
    { id: "bot-details", pattern: /BotDetailsMenu/ },
    { id: "bot-switcher", pattern: /onSelectAgent=\{selectAgent\}/ },
    { id: "bot-switch-options", pattern: /agents=\{agents\}/ },
    { id: "settings-entry", pattern: /id="studio-settings-toggle"/ },
    { id: "settings-expanded-state", pattern: /aria-expanded=\{inspectorOpen\}/ },
  ],
  canvas: [
    // Browser work and rehearsal share the side panel without mixing chat scopes.
    { id: "single-workroom", pattern: /onModeChange=\{panelOpen \? undefined : setWorkroomMode\}/ },
    { id: "panel-tabs", pattern: /\{ id: "try", label: "Rehearse" \}/ },
    { id: "computer-panel", pattern: /\{ id: "computer", label: "Browser" \}/ },
    { id: "accessible-panel-tabs", pattern: /role="tablist"[\s\S]*aria-label="Workspace panel"/ },
    { id: "mobile-surface-switch", pattern: /aria-label="Workspace view"/ },
    {
      id: "inspector-body",
      pattern: /activePanelSection === "review"\s*\? reviewPanel\s*: setupPanel/,
    },
    { id: "try-it-beside", pattern: /mode="test"/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "chat-workroom", pattern: /<StudioWorkroom/ },
    { id: "review-panel", pattern: /StudioAgentReviewPanel/ },
    // Request lifetimes are isolated by account, Bot and mode; drafts live above them.
    {
      id: "workroom-key",
      pattern: /<StudioWorkroom[\s\S]*key=\{`\$\{user\?\.id\}:\$\{main\.key\}`\}/,
    },
    {
      id: "workroom-mode-isolation",
      pattern: /const key = `\$\{active\.id\}:\$\{mode\}`/,
    },
    {
      id: "workroom-draft-preservation",
      pattern: /initialDraft=\{workroomDrafts\.get\(main\.key\)\}/,
    },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "create-first-empty-state", pattern: /Create Your Bot/i },
    { id: "command-nonce", pattern: /commandNonce/ },
    { id: "progressive-inspector", pattern: /collapsed=\{!panelOpen\}/ },
    // The conversation hides only when the owner chooses Full width.
    { id: "full-width-panel", pattern: /fill=\{panelFill\}/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /split/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "real-config", pattern: /agent-config/ },
    { id: "managed-voice-picker", pattern: /SimpleVoicePicker/ },
    { id: "voice-heading", pattern: /Phone Voice/i },
    { id: "rehearse-action-in-chat", pattern: /onRehearseVoiceInChat/ },
  ],
  reviewPanel: [
    { id: "go-live-review", pattern: /onRehearse|onEdit/ },
    { id: "phone-readiness", pattern: /phoneNumber/ },
  ],
  agentPreference: [{ id: "mru-key", pattern: /wireline:studio:last-agent-id/ }],
  activeAgentHook: [{ id: "url-agent-param", pattern: /params\.get\("agent"\)/ }],
  authContext: [{ id: "logout-clears-mru", pattern: /clearStudioLastAgentId/ }],
};

export const STUDIO_CANVAS_LINK_SURFACES = [STUDIO_CANVAS_SURFACES.workspacePanel];

function readSurface(key) {
  const path = STUDIO_CANVAS_SURFACES[key];
  if (!path) return "";
  const absolute = resolve(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

export function assertStudioCanvasContract(sources, { mustInclude, mustExclude }) {
  const get = (key) => sources[key] ?? readSurface(key);
  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_FORBIDDEN)) {
    for (const rule of rules)
      mustExclude(STUDIO_CANVAS_SURFACES[surfaceKey], get(surfaceKey), rule.pattern, rule.id);
  }
  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_REQUIRED)) {
    for (const rule of rules)
      mustInclude(
        STUDIO_CANVAS_SURFACES[surfaceKey],
        get(surfaceKey),
        rule.pattern,
        `studio canvas: ${rule.id}`,
      );
  }
  for (const path of STUDIO_CANVAS_LINK_SURFACES) {
    const key = "workspacePanel";
    mustExclude(
      path,
      get(key),
      /mode=workroom/,
      "legacy workroom mode must not appear in studio links",
    );
  }
  mustInclude(
    STUDIO_CANVAS_SURFACES.designVision,
    get("designVision"),
    /minTouchTargetPx:\s*44/,
    "design vision must document Studio touch targets",
  );
}
