import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

/**
 * Authenticated product architecture contract: Studio is the workspace root;
 * Inbox and Calls are canonical global surfaces with optional Bot-scoped lenses;
 * advanced configuration is progressively disclosed instead of becoming nav.
 */
export const STUDIO_CANVAS_VISION = WIRELINE_DESIGN_VISION.studioCanvas;

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
} as const;

export type StudioCanvasSurfaceKey = keyof typeof STUDIO_CANVAS_SURFACES;

export const STUDIO_CANVAS_FORBIDDEN = {
  appRoutes: [{ id: "provider-bound-studio-route", pattern: /AgentStudioHomeClaude/ }],
  studioPageShell: [
    { id: "duplicate-rail", pattern: /aria-label="Workspace navigation"/ },
    { id: "agent-switcher", pattern: /StudioAgentBar/ },
  ],
  studioChrome: [{ id: "full-roster-copy", pattern: /Your agents|All Bots/ }],
  canvas: [
    { id: "agent-roster-grid", pattern: /Your agents/ },
    { id: "spatial-canvas", pattern: /StudioAgentCanvas/ },
  ],
  workspacePanel: [
    { id: "fake-badge", pattern: />\s*wired\s*</ },
    { id: "external-voice", pattern: /VoiceGallery|AgentPresenceLivePreview/ },
  ],
} as const;

export const STUDIO_CANVAS_LEGACY_LINK_PATTERN = /mode=workroom/;

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "provider-neutral-studio-route", pattern: /pages\/AgentStudioHome"/ },
    { id: "studio-route", pattern: /path="\/studio"/ },
    { id: "root-to-studio", pattern: /path="\/" element=\{<Navigate to="\/studio"/ },
    { id: "overview-retired", pattern: /path="\/overview" element=\{<ToStudioRedirect/ },
    { id: "agents-redirect", pattern: /path="\/agents" element=\{<ToStudioRedirect/ },
  ],
  studioHome: [
    { id: "dedicated-studio-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "canvas-orchestrator", pattern: /StudioWorkspaceV2/ },
  ],
  studioPageShell: [
    { id: "shared-workspace-shell", pattern: /WorkspaceShell/ },
    { id: "full-bleed-studio", pattern: /fullBleed/ },
  ],
  studioShell: [
    { id: "workspace-navigation", pattern: /aria-label="Workspace navigation"/ },
    { id: "resizable-rail", pattern: /WorkspaceResizablePanel/ },
    { id: "rail-default", pattern: /defaultSize=\{232\}/ },
    { id: "rail-range", pattern: /minSize=\{208\}[\s\S]*maxSize=\{320\}/ },
    { id: "rail-collapse", pattern: /collapsedSize=\{68\}/ },
    { id: "wordmark", pattern: /BotBoundWordmark/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "manage-nav", pattern: /OPERATE_NAV/ },
    { id: "nav-source", pattern: /from "\.\.\/constants\/navigation"/ },
    { id: "mobile-more", pattern: /MobileNavMoreSheet/ },
    { id: "touch-target", pattern: /min-h-\[44px\]|min-h-\[48px\]/ },
  ],
  resizablePanel: [
    { id: "persistent-panel", pattern: /localStorage\.setItem/ },
    { id: "pointer-resize", pattern: /pointermove/ },
    { id: "keyboard-resize", pattern: /ArrowLeft[\s\S]*ArrowRight/ },
    { id: "separator", pattern: /role="separator"/ },
    { id: "double-click-reset", pattern: /onDoubleClick=\{resetSize\}/ },
  ],
  navigation: [
    { id: "studio-route", pattern: /target === "\/studio"/ },
    { id: "studio-label", pattern: /label: "Bot Studio"/ },
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
    { id: "create-entry", pattern: /\/studio\?create=1/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
    { id: "bot-switcher", pattern: /aria-label="Switch Bot"/ },
    { id: "bot-switch-options", pattern: /agents\.map/ },
    { id: "settings-entry", pattern: /id="studio-settings-toggle"/ },
    { id: "settings-expanded-state", pattern: /aria-expanded=\{inspectorOpen\}/ },
  ],
  canvas: [
    { id: "single-workroom", pattern: /onModeChange=\{setWorkroomMode\}/ },
    { id: "inspector-toggle", pattern: /\["setup", "review"\] as const/ },
    { id: "inspector-body", pattern: /inspectorSection === "review" \? reviewPanel : setupPanel/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "chat-workroom", pattern: /<StudioWorkroom/ },
    { id: "review-panel", pattern: /StudioAgentReviewPanel/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
    // Request lifetimes are isolated by account, Bot and mode; drafts live above them.
    {
      id: "workroom-key",
      pattern: /<StudioWorkroom[\s\S]*key=\{`\$\{user\?\.id\}:\$\{workroomKey\}`\}/,
    },
    {
      id: "workroom-mode-isolation",
      pattern: /const workroomKey = `\$\{active\.id\}:\$\{workroomMode\}`/,
    },
    {
      id: "workroom-draft-preservation",
      pattern: /initialDraft=\{workroomDrafts\.get\(workroomKey\)\}/,
    },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state", pattern: /Create Your Bot/i },
    { id: "command-nonce", pattern: /commandNonce/ },
    { id: "progressive-inspector", pattern: /collapsed=\{!inspectorOpen\}/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /layout === "split"|layout="split"/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "managed-voice-picker", pattern: /SimpleVoicePicker/ },
    { id: "voice-heading", pattern: /Phone Voice/i },
    { id: "rehearse-in-chat", pattern: /onRehearseVoiceInChat/ },
  ],
  reviewPanel: [
    { id: "go-live-review", pattern: /onTest|onEdit/ },
    { id: "phone-readiness", pattern: /phoneNumber/ },
  ],
  agentPreference: [
    { id: "mru-key", pattern: /wireline:studio:last-agent-id/ },
    { id: "resolve-helper", pattern: /resolveStudioActiveAgentId/ },
    { id: "clear-on-logout", pattern: /clearStudioLastAgentId/ },
  ],
  activeAgentHook: [
    { id: "resolve-mru", pattern: /resolveStudioActiveAgentId/ },
    { id: "url-agent-param", pattern: /params\.get\("agent"\)/ },
  ],
  authContext: [{ id: "logout-clears-mru", pattern: /clearStudioLastAgentId/ }],
} as const;

export const STUDIO_CANVAS_LINK_SURFACES = [STUDIO_CANVAS_SURFACES.workspacePanel] as const;
