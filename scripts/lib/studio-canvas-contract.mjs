import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

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
  spatialCanvas: "src/components/StudioAgentCanvas.tsx",
  workroom: "src/components/StudioWorkroom.tsx",
  workspacePanel: "src/components/StudioAgentWorkspacePanel.tsx",
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
    { id: "agent-tablist", pattern: /role="tablist"/ },
  ],
  studioChrome: [{ id: "roster-loop", pattern: /agents\.map/ }],
  canvas: [{ id: "agent-roster-grid", pattern: /Your agents/ }],
  spatialCanvas: [{ id: "prototype-name", pattern: /\bSarah\b/ }],
  workspacePanel: [{ id: "fake-badge", pattern: />\s*wired\s*</ }],
};

export const STUDIO_CANVAS_REQUIRED = {
  appRoutes: [
    { id: "claude-studio-route", pattern: /AgentStudioHomeClaude/ },
    // Retired /agents page redirects into Studio (agent-first IA owns the roster).
    { id: "agents-redirect", pattern: /path="\/agents" element=\{<Navigate to="\/studio" replace \/>\}/ },
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
    { id: "studio-label", pattern: /label: "Studio"/ },
    { id: "studio-active-state", pattern: /target === "\/studio"/ },
    { id: "apps-breadcrumb", pattern: /"\/apps": "Apps"/ },
  ],
  studioChrome: [
    { id: "breadcrumb", pattern: /Studio breadcrumb|Studio context|Assistant breadcrumb/ },
    { id: "readiness", pattern: /Active|Training/ },
    { id: "test-call", pattern: /Run test call|Test call/ },
    { id: "deploy", pattern: /Deploy/ },
  ],
  overview: [
    // Nav carries the "Overview" label; the page itself leads with a
    // personalized greeting headline.
    { id: "overview-greeting", pattern: /dayGreeting\(\)/ },
    // Agent language only; Assistant was retired by the migration plan.
    { id: "new-agent", pattern: /New agent|Wire your first agent|Wire one/ },
    { id: "personal-agents", pattern: /Personal agents/ },
    { id: "business-agents", pattern: /Business agents/ },
    { id: "full-roster", pattern: /agents\.map/ },
    { id: "studio-target", pattern: /\/studio\?agent=/ },
  ],
  canvas: [
    { id: "chat-left", pattern: /<StudioWorkroom/ },
    { id: "spatial-canvas", pattern: /<StudioAgentCanvas/ },
    { id: "workspace-depth", pattern: /view"\) === "workspace"/ },
    { id: "deep-editor", pattern: /StudioAgentWorkspacePanel/ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  spatialCanvas: [
    { id: "agent-canvas-label", pattern: /Agent Canvas/ },
    { id: "real-config", pattern: /agent-config/ },
    { id: "identity", pattern: /Identity/ },
    { id: "voice", pattern: /Voice/ },
    { id: "workflows", pattern: /Workflows & Capabilities/ },
    { id: "knowledge", pattern: /Knowledge Base/ },
    { id: "situations", pattern: /Situations/ },
    { id: "connector-lines", pattern: /border-dashed/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "split-layout", pattern: /split/ },
    { id: "composer-focus", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "real-config", pattern: /agent-config/ },
    { id: "voice-search", pattern: /voice-search/ },
    { id: "world-connections", pattern: /World Connections/ },
  ],
  agentPreference: [{ id: "mru-key", pattern: /wireline:studio:last-agent-id/ }],
  activeAgentHook: [{ id: "url-agent-param", pattern: /params\.get\("agent"\)/ }],
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
    for (const rule of rules) mustExclude(STUDIO_CANVAS_SURFACES[surfaceKey], get(surfaceKey), rule.pattern, rule.id);
  }
  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_REQUIRED)) {
    for (const rule of rules) mustInclude(STUDIO_CANVAS_SURFACES[surfaceKey], get(surfaceKey), rule.pattern, `studio canvas: ${rule.id}`);
  }
  for (const path of STUDIO_CANVAS_LINK_SURFACES) {
    const key = path.includes("OverviewPage") ? "overview" : path.includes("StudioOverview") ? "studioOverview" : "workspacePanel";
    mustExclude(path, get(key), /mode=workroom/, "legacy workroom mode must not appear in studio links");
  }
  mustInclude(STUDIO_CANVAS_SURFACES.designVision, get("designVision"), /minTouchTargetPx:\s*44/, "design vision must document Studio touch targets");
}
