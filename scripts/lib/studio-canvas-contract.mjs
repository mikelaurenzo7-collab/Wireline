import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

// Executable mirror of src/lib/studio-canvas-contract.ts — keep the two in
// lockstep when Studio surfaces change (tests import the TS manifest; the
// design gate runs this module without a TS loader).
export const STUDIO_CANVAS_VISION = {
  defaultSurface: "chat-plus-canvas",
  canvasSurface: "spatial-cards",
  agentSwitcher: "context-chrome",
  railWidthPx: 236,
  workspaceDepthParam: "view=workspace",
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
};

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "provider-neutral-studio-route", pattern: /pages\/AgentStudioHome"/ },
    // Retired /agents page redirects into Studio (agent-first IA owns the roster),
    // preserving query/hash so legacy deep-links keep working.
    {
      id: "agents-redirect",
      pattern:
        /path="\/agents"[\s\S]*AgentsToStudioRedirect|AgentsToStudioRedirect[\s\S]*\/studio\$\{location\.search\}/,
    },
  ],
  studioHome: [
    { id: "dedicated-shell", pattern: /StudioPageShell/ },
    { id: "context-chrome", pattern: /StudioContextChrome/ },
    { id: "canvas", pattern: /StudioWorkspaceV2/ },
  ],
  studioPageShell: [{ id: "shared-shell", pattern: /WorkspaceShell/ }],
  studioShell: [
    { id: "workspace-navigation", pattern: /Workspace navigation/ },
    { id: "rail-width", pattern: /w-\[236px\]/ },
    { id: "apps-route", pattern: /OPERATE_NAV/ },
    { id: "route-active-state", pattern: /useLocation/ },
    { id: "nav-source", pattern: /from "\.\.\/constants\/navigation"/ },
    { id: "mobile-more", pattern: /MobileNavMoreSheet/ },
  ],
  navigation: [
    { id: "studio-label", pattern: /label: "Agent Studio"/ },
    { id: "studio-active-state", pattern: /target === "\/studio"/ },
    { id: "apps-breadcrumb", pattern: /"\/apps": "Apps"/ },
  ],
  studioChrome: [
    { id: "context-label", pattern: /aria-label=\{`\$\{language\.singular\} context`\}/ },
    { id: "readiness", pattern: /Live|Setup needed/ },
    { id: "create-entry", pattern: /\/studio\?create=1/ },
  ],
  overview: [
    // Nav carries the "Overview" label; the page itself leads with a
    // personalized greeting headline and the first-agent path.
    { id: "overview-greeting", pattern: /dayGreeting\(\)/ },
    { id: "first-agent-cta", pattern: /\{language\.createCta\}/ },
    { id: "full-roster", pattern: /agents\.map/ },
    { id: "studio-target", pattern: /\/studio\?agent=/ },
  ],
  canvas: [
    // Studio is a three-step orchestrator: Set up → Test → Review.
    { id: "setup-section", pattern: /section === "setup"/ },
    { id: "test-section", pattern: /section === "test"/ },
    { id: "review-section", pattern: /section === "review"/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "chat-workroom", pattern: /<StudioWorkroom/ },
    { id: "review-panel", pattern: /StudioAgentReviewPanel/ },
    { id: "legacy-mode-cleanup", pattern: /next\.delete\("mode"\)/ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /split/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "real-config", pattern: /agent-config/ },
    { id: "managed-voice-picker", pattern: /SimpleVoicePicker/ },
    { id: "voice-heading", pattern: /Phone voice/ },
    { id: "test-in-chat", pattern: /onTestVoiceInChat/ },
  ],
  reviewPanel: [
    { id: "go-live-review", pattern: /onTest|onEdit/ },
    { id: "phone-readiness", pattern: /phoneNumber/ },
  ],
  agentPreference: [{ id: "mru-key", pattern: /wireline:studio:last-agent-id/ }],
  activeAgentHook: [{ id: "url-agent-param", pattern: /params\.get\("agent"\)/ }],
  authContext: [{ id: "logout-clears-mru", pattern: /clearStudioLastAgentId/ }],
};

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
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
    const key = path.includes("OverviewPage") ? "overview" : "workspacePanel";
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
