import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

// The legacy export name is retained for design-check compatibility. Studio's
// current interaction model is the focused setup -> test -> review loop.
export const STUDIO_CANVAS_VISION = {
  defaultSurface: "setup-test-review",
  canvasSurface: "focused-panels",
  agentSwitcher: "context-chrome",
  railWidthPx: 236,
  workspaceDepthParam: "section",
  minTouchTargetPx: 44,
};

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
  designVision: "src/lib/wireline-design-vision.ts",
};

export const STUDIO_CANVAS_FORBIDDEN = {
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
};

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "studio-route", pattern: /AgentStudioHomeClaude/ },
    {
      id: "agents-redirect",
      pattern: /path="\/agents" element=\{<Navigate to="\/studio" replace \/>\}/,
    },
  ],
  studioHome: [
    { id: "dedicated-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "guided-orchestrator", pattern: /StudioWorkspaceV2/ },
    { id: "post-create-guide", pattern: /PostCreateActivationWizard/ },
  ],
  studioPageShell: [
    { id: "shared-shell", pattern: /WorkspaceShell/ },
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
    { id: "studio-label", pattern: /label: "AI Employee"/ },
    { id: "studio-active-state", pattern: /target === "\/studio"/ },
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
    { id: "real-config", pattern: /\/api\/agent-config\// },
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
};

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
  "src/components/StudioOverview.tsx",
  STUDIO_CANVAS_SURFACES.workspacePanel,
];

function readSurface(key) {
  const path = STUDIO_CANVAS_SURFACES[key];
  if (!path) return "";
  const absolute = resolve(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

export function assertStudioCanvasContract(sources, { mustInclude, mustExclude }) {
  const get = (key) => sources[key] ?? readSurface(key);
  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_FORBIDDEN)) {
    for (const rule of rules) {
      mustExclude(STUDIO_CANVAS_SURFACES[surfaceKey], get(surfaceKey), rule.pattern, rule.id);
    }
  }
  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_REQUIRED)) {
    for (const rule of rules) {
      mustInclude(
        STUDIO_CANVAS_SURFACES[surfaceKey],
        get(surfaceKey),
        rule.pattern,
        `studio guided workspace: ${rule.id}`,
      );
    }
  }
  for (const path of STUDIO_CANVAS_LINK_SURFACES) {
    const key = path.includes("OverviewPage")
      ? "overview"
      : path.includes("StudioOverview")
        ? "studioOverview"
        : "workspacePanel";
    mustExclude(
      path,
      get(key),
      /mode=workroom/,
      "legacy workroom mode must not appear in Studio links",
    );
  }
  mustInclude(
    STUDIO_CANVAS_SURFACES.designVision,
    get("designVision"),
    /minTouchTargetPx:\s*44/,
    "design vision must document Studio touch targets",
  );
}
