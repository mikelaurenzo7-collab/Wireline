import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

export const STUDIO_CANVAS_VISION = WIRELINE_DESIGN_VISION.studioCanvas;

export const STUDIO_CANVAS_SURFACES = {
  appRoutes: "src/routes/AppRoutes.tsx",
  studioShell: "src/components/studio/StudioPageShell.tsx",
  studioChrome: "src/components/studio/StudioContextChrome.tsx",
  canvas: "src/components/StudioWorkspaceV2.tsx",
  spatialCanvas: "src/components/StudioAgentCanvas.tsx",
  workroom: "src/components/StudioWorkroom.tsx",
  workspacePanel: "src/components/StudioAgentWorkspacePanel.tsx",
  studioHome: "src/pages/AgentStudioHomeClaude.tsx",
  agentPreference: "src/lib/studio-agent-preference.ts",
  activeAgentHook: "src/hooks/useStudioActiveAgentId.ts",
  authContext: "src/contexts/AuthContext.tsx",
} as const;

export type StudioCanvasSurfaceKey = keyof typeof STUDIO_CANVAS_SURFACES;

export const STUDIO_CANVAS_FORBIDDEN = {
  appRoutes: [{ id: "old-studio-route", pattern: /pages\/AgentStudioHome"/ }],
  studioHome: [{ id: "old-shell", pattern: /WorkspaceShell/ }],
  studioShell: [
    { id: "agent-tablist", pattern: /role="tablist"/ },
    { id: "agent-switcher", pattern: /StudioAgentBar/ },
  ],
  studioChrome: [{ id: "roster-loop", pattern: /agents\.map/ }],
  canvas: [{ id: "agent-roster-grid", pattern: /Your agents/ }],
  spatialCanvas: [{ id: "prototype-name", pattern: /\bSarah\b/ }],
  workspacePanel: [{ id: "fake-badge", pattern: />\s*wired\s*</ }],
} as const;

export const STUDIO_CANVAS_LEGACY_LINK_PATTERN = /mode=workroom/;

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "claude-studio-route", pattern: /AgentStudioHomeClaude/ },
    { id: "studio-route", pattern: /path="\/studio"/ },
  ],
  studioHome: [
    { id: "dedicated-studio-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "canvas-orchestrator", pattern: /StudioWorkspaceV2/ },
  ],
  studioShell: [
    { id: "workspace-navigation", pattern: /aria-label="Workspace navigation"/ },
    { id: "rail-width", pattern: /w-\[236px\]/ },
    { id: "wordmark", pattern: /Wireline\s*<\/span>/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "apps-route", pattern: /href: "\/apps"/ },
    { id: "studio-route", pattern: /href === "\/studio"/ },
    { id: "user-card", pattern: /rosterLabel/ },
    { id: "touch-target", pattern: /min-h-\[44px\]/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  studioChrome: [
    { id: "breadcrumb", pattern: /Studio breadcrumb/ },
    { id: "readiness", pattern: /94% ready|82% ready/ },
    { id: "test-call", pattern: /Run test call/ },
    { id: "deploy", pattern: /Deploy/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  canvas: [
    { id: "chat-left-workroom", pattern: /<StudioWorkroom/ },
    { id: "spatial-canvas-default", pattern: /<StudioAgentCanvas/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
    { id: "workspace-depth", pattern: /view"\) === "workspace"/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "canvas-key", pattern: /StudioAgentCanvas[\s\S]*key=\{active\.id\}/ },
    { id: "workroom-key", pattern: /<StudioWorkroom[\s\S]*key=\{active\.id\}/ },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state", pattern: /Wire one\./ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  spatialCanvas: [
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "agent-canvas-label", pattern: /Agent Canvas/ },
    { id: "identity-card", pattern: /Identity/ },
    { id: "voice-card", pattern: /Voice/ },
    { id: "workflows-card", pattern: /Workflows & Capabilities/ },
    { id: "knowledge-card", pattern: /Knowledge Base/ },
    { id: "situations-card", pattern: /Situations/ },
    { id: "enabled-tools", pattern: /enabledTools/ },
    { id: "directives", pattern: /directives/ },
    { id: "connector-lines", pattern: /border-dashed/ },
    { id: "edit-section", pattern: /onEditSection/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /layout === "split"|layout="split"/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "scoped-workspace-copy", pattern: /per this[\s\S]*workspace only/ },
    { id: "world-connections", pattern: /World Connections/ },
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "voice-search", pattern: /htmlFor="voice-search"/ },
    { id: "voice-cap", pattern: /first 12/ },
    { id: "integration-keys", pattern: /key=\{integ\.id\}/ },
    { id: "integration-status", pattern: /integ\.connection/ },
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

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
  "src/components/StudioOverview.tsx",
  STUDIO_CANVAS_SURFACES.workspacePanel,
] as const;
