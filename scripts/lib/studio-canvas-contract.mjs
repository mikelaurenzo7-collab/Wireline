/**
 * Studio Canvas contract for design:check — mirrors src/lib/studio-canvas-contract.ts.
 * Keep in sync when vision invariants change.
 */
export const STUDIO_CANVAS_VISION = {
  defaultSurface: "chat-composer",
  agentSwitcher: "horizontal-bar",
  railWidthPx: 56,
  workspaceDepthParam: "view=workspace",
  minTouchTargetPx: 44,
};

export const STUDIO_CANVAS_SURFACES = {
  shell: "src/components/WorkspaceShell.tsx",
  canvas: "src/components/StudioWorkspaceV2.tsx",
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
    { id: "no-card-open-workspace-cta", pattern: /Open workspace\s*→/ },
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
    { id: "minimal-rail", pattern: /aria-label="Workspace navigation"/ },
    { id: "rail-width", pattern: /w-\[56px\]/ },
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
    { id: "chat-first-workroom", pattern: /<StudioWorkroom/ },
    { id: "shared-mru-hook", pattern: /useStudioActiveAgentId/ },
    { id: "workspace-depth-gate", pattern: /view"\) === "workspace"/ },
    { id: "extracted-workspace-panel", pattern: /StudioAgentWorkspacePanel/ },
    { id: "workspace-panel-key", pattern: /key=\{active\.id\}/ },
    { id: "strip-legacy-mode", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state-wire-one", pattern: /Wire one\./ },
    { id: "command-nonce", pattern: /commandNonce/ },
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