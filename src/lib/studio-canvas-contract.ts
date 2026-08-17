import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

export const STUDIO_CANVAS_VISION = WIRELINE_DESIGN_VISION.studioCanvas;

export const STUDIO_CANVAS_SURFACES = {
  appRoutes: "src/routes/AppRoutes.tsx",
  studioShell: "src/components/WorkspaceShell.tsx",
  navigation: "src/constants/navigation.ts",
  studioPageShell: "src/components/studio/StudioPageShell.tsx",
  studioChrome: "src/components/studio/StudioContextChrome.tsx",
  canvas: "src/components/StudioWorkspaceV2.tsx",
  workroom: "src/components/StudioWorkroom.tsx",
  workspacePanel: "src/components/StudioAgentWorkspacePanel.tsx",
  reviewPanel: "src/components/StudioAgentReviewPanel.tsx",
  overview: "src/pages/OverviewPage.tsx",
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
  studioChrome: [{ id: "roster-loop", pattern: /agents\.map/ }],
  canvas: [
    { id: "agent-roster-grid", pattern: /Your agents/ },
    // The spatial-card prototype was retired with the managed Vapi runtime.
    { id: "spatial-canvas", pattern: /StudioAgentCanvas/ },
  ],
  workspacePanel: [
    { id: "fake-badge", pattern: />\s*wired\s*</ },
    // External voice/avatar experiments stay out of the managed setup panel.
    { id: "external-voice", pattern: /VoiceGallery|AgentPresenceLivePreview/ },
  ],
} as const;

export const STUDIO_CANVAS_LEGACY_LINK_PATTERN = /mode=workroom/;

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "provider-neutral-studio-route", pattern: /pages\/AgentStudioHome"/ },
    { id: "studio-route", pattern: /path="\/studio"/ },
    // Retired /agents directory page redirects into Studio, which owns the
    // roster under the agent-first IA. Query/hash are preserved for deep-links.
    {
      id: "agents-redirect",
      pattern:
        /path="\/agents"[\s\S]*AgentsToStudioRedirect|AgentsToStudioRedirect[\s\S]*\/studio\$\{location\.search\}/,
    },
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
    { id: "rail-width", pattern: /w-\[236px\]/ },
    { id: "wordmark", pattern: /Wireline\s*<\/span>/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "apps-route", pattern: /OPERATE_NAV/ },
    { id: "nav-source", pattern: /from "\.\.\/constants\/navigation"/ },
    { id: "mobile-more", pattern: /MobileNavMoreSheet/ },
    { id: "touch-target", pattern: /min-h-\[44px\]|min-h-\[48px\]/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  navigation: [
    { id: "studio-route", pattern: /target === "\/studio"/ },
    { id: "studio-label", pattern: /label: "Agent Studio"/ },
    { id: "apps-breadcrumb", pattern: /"\/apps": "Apps"/ },
  ],
  studioChrome: [
    { id: "context-label", pattern: /aria-label=\{`\$\{language\.singular\} context`\}/ },
    { id: "readiness", pattern: /Live|Needs setup/ },
    { id: "create-entry", pattern: /\/studio\?create=1/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  overview: [
    { id: "overview-title", pattern: /wl-app-page-title/ },
    { id: "first-agent-cta", pattern: /\{language\.createCta\}/ },
    { id: "all-agents", pattern: /previewAgents\.map/ },
    { id: "studio-link", pattern: /to=\{`\/studio\?agent=\$\{enc\}`\}/ },
  ],
  canvas: [
    // Studio is a three-step orchestrator: Set up → Test → Review.
    { id: "setup-section", pattern: /section === "setup"/ },
    { id: "test-section", pattern: /section === "test"/ },
    { id: "review-section", pattern: /section === "review"/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "chat-workroom", pattern: /<StudioWorkroom/ },
    { id: "review-panel", pattern: /StudioAgentReviewPanel/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
    { id: "workroom-key", pattern: /<StudioWorkroom[\s\S]*key=\{active\.id\}/ },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state", pattern: /Start with one job/ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /layout === "split"|layout="split"/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "managed-voice-picker", pattern: /SimpleVoicePicker/ },
    { id: "voice-heading", pattern: /Phone voice/ },
    { id: "test-in-chat", pattern: /onTestVoiceInChat/ },
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

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
  STUDIO_CANVAS_SURFACES.workspacePanel,
] as const;
