import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

/**
 * The export name is retained for compatibility with the design-check tooling.
 * The current Studio contract is a focused setup -> test -> review workspace,
 * not the retired spatial canvas prototype.
 */
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
  studioHome: "src/pages/AgentStudioHomeClaude.tsx",
  agentPreference: "src/lib/studio-agent-preference.ts",
  activeAgentHook: "src/hooks/useStudioActiveAgentId.ts",
  authContext: "src/contexts/AuthContext.tsx",
} as const;

export type StudioCanvasSurfaceKey = keyof typeof STUDIO_CANVAS_SURFACES;

export const STUDIO_CANVAS_FORBIDDEN = {
  appRoutes: [{ id: "old-studio-route", pattern: /pages\/AgentStudioHome"/ }],
  studioPageShell: [
    { id: "duplicate-rail", pattern: /aria-label="Workspace navigation"/ },
    { id: "agent-switcher", pattern: /StudioAgentBar/ },
  ],
  studioChrome: [{ id: "roster-loop", pattern: /agents\.map/ }],
  canvas: [
    { id: "agent-roster-grid", pattern: /Your agents/ },
    { id: "retired-spatial-canvas", pattern: /<StudioAgentCanvas/ },
    { id: "retired-workspace-depth", pattern: /view"\) === "workspace"/ },
  ],
  workspacePanel: [
    { id: "fake-badge", pattern: />\s*wired\s*</ },
    { id: "embedded-advanced-library", pattern: /<VoiceGallery[\s\S]*embedded/ },
  ],
} as const;

export const STUDIO_CANVAS_LEGACY_LINK_PATTERN = /mode=workroom/;

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "studio-route", pattern: /AgentStudioHomeClaude/ },
    { id: "authenticated-studio-path", pattern: /path="\/studio"/ },
    {
      id: "agents-redirect",
      pattern: /path="\/agents" element=\{<Navigate to="\/studio" replace \/>\}/,
    },
  ],
  studioHome: [
    { id: "dedicated-studio-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "guided-orchestrator", pattern: /StudioWorkspaceV2/ },
    { id: "post-create-guide", pattern: /PostCreateActivationWizard/ },
  ],
  studioPageShell: [
    { id: "shared-workspace-shell", pattern: /WorkspaceShell/ },
    { id: "full-bleed-studio", pattern: /fullBleed/ },
  ],
  studioShell: [
    { id: "workspace-navigation", pattern: /aria-label="Workspace navigation"/ },
    { id: "rail-width", pattern: /w-\[236px\]/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "nav-source", pattern: /from "\.\.\/constants\/navigation"/ },
    { id: "mobile-more", pattern: /MobileNavMoreSheet/ },
    { id: "touch-target", pattern: /min-h-\[44px\]|min-h-\[48px\]/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  navigation: [
    { id: "studio-route", pattern: /target === "\/studio"/ },
    { id: "studio-label", pattern: /label: "AI Employee"/ },
    { id: "connections-label", pattern: /label: "Connections"/ },
    { id: "apps-breadcrumb", pattern: /"\/apps": "Apps"/ },
  ],
  studioChrome: [
    { id: "employee-context", pattern: /aria-label="AI employee context"/ },
    { id: "readiness", pattern: /Setup needed|Live/ },
    { id: "new-employee", pattern: /New employee/ },
    { id: "page-heading", pattern: /<h1/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
  ],
  overview: [
    { id: "demand-metric", pattern: /Customer conversations today/ },
    { id: "demand-readiness", pattern: /DemandReadinessCard/ },
    { id: "customer-outcomes", pattern: /Customer outcomes/ },
    { id: "employee-roster", pattern: /AI employees/ },
    { id: "studio-target", pattern: /\/studio\?agent=/ },
  ],
  canvas: [
    {
      id: "guided-sections",
      pattern: /type WorkspaceSection = "setup" \| "test" \| "review"/,
    },
    { id: "setup-panel", pattern: /StudioAgentWorkspacePanel/ },
    { id: "test-workroom", pattern: /StudioWorkroom/ },
    { id: "review-panel", pattern: /StudioAgentReviewPanel/ },
    { id: "accessible-tabs", pattern: /role="tablist"/ },
    { id: "keyboard-tabs", pattern: /useRovingTabIndex/ },
    { id: "shared-agent-hook", pattern: /useStudioActiveAgentId/ },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  workroom: [
    { id: "shared-composer-dock", pattern: /WL_COMPOSER_CLASSES\.composerDock/ },
    { id: "composer-focus", pattern: /focusComposer/ },
    { id: "customer-test-route", pattern: /\/test\/stream/ },
    { id: "accessible-log", pattern: /role="log"/ },
  ],
  workspacePanel: [
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "atomic-essentials", pattern: /\/essentials/ },
    { id: "customer-job", pattern: /Customer-facing job/ },
    { id: "simple-voice", pattern: /SimpleVoicePicker/ },
    { id: "save-and-test", pattern: /Save and test/ },
    { id: "progressive-disclosure", pattern: /Advanced options/ },
  ],
  reviewPanel: [
    { id: "browser-readiness", pattern: /lastBrowserTestAt/ },
    { id: "readiness-question", pattern: /ready for customers/ },
    { id: "test-action", pattern: /Test conversation/ },
    { id: "connect-action", pattern: /Connect phone/ },
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
