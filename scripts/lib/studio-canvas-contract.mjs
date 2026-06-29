/**
 * Studio Canvas contract for design:check — mirrors src/lib/studio-canvas-contract.ts.
 * Keep in sync when vision invariants change.
 */
export const STUDIO_CANVAS_VISION = {
  defaultSurface: "chat-plus-canvas",
  canvasSurface: "spatial-cards",
  agentSwitcher: "horizontal-bar",
  railWidthPx: 236,
  workspaceDepthParam: "view=workspace",
  minTouchTargetPx: 44,
};

export const STUDIO_CANVAS_SURFACES = {
  shell: "src/components/WorkspaceShell.tsx",
  canvas: "src/components/StudioWorkspaceV2.tsx",
  spatialCanvas: "src/components/StudioAgentCanvas.tsx",
  workroom: "src/components/StudioWorkroom.tsx",
  workspacePanel: "src/components/StudioAgentWorkspacePanel.tsx",
  studioHome: "src/pages/AgentStudioHome.tsx",
  agentPreference: "src/lib/studio-agent-preference.ts",
  activeAgentHook: "src/hooks/useStudioActiveAgentId.ts",
  authContext: "src/contexts/AuthContext.tsx",
  designVision: "src/lib/wireline-design-vision.ts",
};

export const STUDIO_CANVAS_FORBIDDEN = {
  canvas: [
    { id: "no-agent-card-grid", pattern: /Your agents/ },
    { id: "no-demo-alert", pattern: /\balert\s*\(/ },
    { id: "no-query-selector-hacks", pattern: /document\.querySelector/ },
  ],
  spatialCanvas: [
    { id: "no-prototype-mock-agent", pattern: /\bSarah\b/ },
    { id: "no-demo-alert", pattern: /\balert\s*\(/ },
    { id: "no-query-selector-hacks", pattern: /document\.querySelector/ },
  ],
  shell: [{ id: "no-rail-agent-stack", pattern: /function DesktopRail[\s\S]*agents\.map/ }],
  workspacePanel: [
    { id: "no-fake-wired-badge", pattern: />\s*wired\s*</ },
  ],
};

export const STUDIO_CANVAS_REQUIRED = {
  shell: [
    { id: "branded-rail", pattern: /aria-label="Workspace navigation"/ },
    { id: "rail-width", pattern: /w-\[236px\]/ },
    { id: "rail-wordmark", pattern: /Wireline\s*<\/span>/ },
    { id: "rail-user-card", pattern: /rosterLabel/ },
    { id: "horizontal-switcher", pattern: /StudioAgentBar/ },
    { id: "tablist-semantics", pattern: /role="tablist"/ },
    { id: "touch-target-44", pattern: /min-h-\[44px\][\s\S]*min-w-\[44px\]/ },
    { id: "keyboard-roving", pattern: /useRovingTabIndex/ },
    { id: "scroll-active-pill", pattern: /scrollIntoView/ },
    { id: "native-switcher", pattern: /NativeStudioAgentBar/ },
    { id: "settings-affordance", pattern: /aria-label="Settings"/ },
    { id: "shared-mru-hook", pattern: /useStudioActiveAgentId/ },
  ],
  canvas: [
    { id: "chat-left-workroom", pattern: /<StudioWorkroom/ },
    { id: "spatial-canvas-default", pattern: /<StudioAgentCanvas/ },
    { id: "shared-mru-hook", pattern: /useStudioActiveAgentId/ },
    { id: "workspace-depth-gate", pattern: /view"\) === "workspace"/ },
    { id: "deep-editor-panel", pattern: /StudioAgentWorkspacePanel/ },
    { id: "canvas-key", pattern: /StudioAgentCanvas[\s\S]*key=\{active\.id\}/ },
    { id: "workroom-key", pattern: /<StudioWorkroom[\s\S]*key=\{active\.id\}/ },
    { id: "strip-legacy-mode", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state-wire-one", pattern: /Wire one\./ },
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
    { id: "enabled-tools-binding", pattern: /enabledTools/ },
    { id: "directives-binding", pattern: /directives/ },
    { id: "connector-lines", pattern: /border-dashed/ },
    { id: "edit-section-callback", pattern: /onEditSection/ },
  ],
  workroom: [
    { id: "composer-dock", pattern: /wl-composer-dock/ },
    { id: "canvas-layout", pattern: /layout === "canvas"/ },
    { id: "composer-focus-handle", pattern: /focusComposer/ },
  ],
  workspacePanel: [
    { id: "scoped-workspace-copy", pattern: /per this[\s\S]*workspace only/ },
    { id: "world-connections", pattern: /World Connections/ },
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "voice-search-a11y", pattern: /htmlFor="voice-search"/ },
    { id: "elevenlabs-cap-disclosure", pattern: /first 12/ },
    { id: "honest-integration-keys", pattern: /key=\{integ\.id\}/ },
    { id: "honest-integration-status", pattern: /integ\.connection/ },
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
  studioHome: [
    { id: "brief-param", pattern: /params\.get\("brief"\)/ },
    { id: "shell-canvas-compose", pattern: /WorkspaceShell[\s\S]*StudioWorkspaceV2/ },
  ],
  authContext: [{ id: "logout-clears-mru", pattern: /clearStudioLastAgentId/ }],
};

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
  "src/components/StudioOverview.tsx",
  STUDIO_CANVAS_SURFACES.workspacePanel,
];

export function assertStudioCanvasContract(sources, { mustInclude, mustExclude }) {
  const get = (key) => sources[key] ?? "";

  for (const rule of STUDIO_CANVAS_FORBIDDEN.canvas) {
    mustExclude(STUDIO_CANVAS_SURFACES.canvas, get("canvas"), rule.pattern, rule.id);
  }
  for (const rule of STUDIO_CANVAS_FORBIDDEN.spatialCanvas ?? []) {
    mustExclude(STUDIO_CANVAS_SURFACES.spatialCanvas, get("spatialCanvas"), rule.pattern, rule.id);
  }
  for (const rule of STUDIO_CANVAS_FORBIDDEN.shell) {
    mustExclude(STUDIO_CANVAS_SURFACES.shell, get("shell"), rule.pattern, rule.id);
  }
  for (const rule of STUDIO_CANVAS_FORBIDDEN.workspacePanel ?? []) {
    mustExclude(
      STUDIO_CANVAS_SURFACES.workspacePanel,
      get("workspacePanel"),
      rule.pattern,
      rule.id,
    );
  }

  for (const [surfaceKey, rules] of Object.entries(STUDIO_CANVAS_REQUIRED)) {
    const path = STUDIO_CANVAS_SURFACES[surfaceKey];
    const text = get(surfaceKey);
    for (const rule of rules) {
      mustInclude(path, text, rule.pattern, `studio canvas: ${rule.id}`);
    }
  }

  for (const path of STUDIO_CANVAS_LINK_SURFACES) {
    const key = path.includes("OverviewPage")
      ? "overviewPage"
      : path.includes("StudioOverview")
        ? "studioOverview"
        : "workspacePanel";
    mustExclude(path, get(key), /mode=workroom/, "legacy workroom mode must not appear in studio links");
  }

  mustInclude(
    STUDIO_CANVAS_SURFACES.designVision,
    get("designVision"),
    /studioCanvas:\s*\{[\s\S]*minTouchTargetPx:\s*44/,
    "design vision must document studio canvas touch targets",
  );
}