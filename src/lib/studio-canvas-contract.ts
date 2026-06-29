/**
 * Studio Canvas — behavioral contract derived from WIRELINE_DESIGN_VISION.
 * Tests and design:check import this module; implementation must satisfy invariants,
 * not the other way around.
 */
import { WIRELINE_DESIGN_VISION } from "./wireline-design-vision";

export const STUDIO_CANVAS_VISION = WIRELINE_DESIGN_VISION.studioCanvas;

/** Canonical surfaces for the authenticated studio canvas IA. */
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
} as const;

export type StudioCanvasSurfaceKey = keyof typeof STUDIO_CANVAS_SURFACES;

/** Product invariants — if any match, the vision is violated. */
export const STUDIO_CANVAS_FORBIDDEN = {
  canvas: [
    // The roster lives in the horizontal switcher, never as a grid in the canvas.
    { id: "no-agent-card-grid", pattern: /Your agents/ },
    { id: "no-demo-alert", pattern: /\balert\s*\(/ },
    { id: "no-query-selector-hacks", pattern: /document\.querySelector/ },
  ],
  spatialCanvas: [
    // The Agent Canvas binds to the real config record, never the prototype mock.
    { id: "no-prototype-mock-agent", pattern: /\bSarah\b/ },
    { id: "no-demo-alert", pattern: /\balert\s*\(/ },
    { id: "no-query-selector-hacks", pattern: /document\.querySelector/ },
  ],
  shell: [
    {
      id: "no-rail-agent-stack",
      // Agent roster must not render inside the narrow left rail.
      pattern: /function DesktopRail[\s\S]*agents\.map/,
    },
  ],
  workspacePanel: [{ id: "no-fake-wired-badge", pattern: />\s*wired\s*</ }],
} as const;

export const STUDIO_CANVAS_LEGACY_LINK_PATTERN = /mode=workroom/;

/** Required behaviors per surface — absence means the vision is not shipped. */
export const STUDIO_CANVAS_REQUIRED = {
  shell: [
    { id: "branded-rail", pattern: /aria-label="Workspace navigation"/ },
    // Letterpress sidebar: full-width branded rail (Claude Design), not the legacy 56px strip.
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
    // Claude Design: chat + spatial Agent Canvas is the default right pane.
    { id: "spatial-canvas-default", pattern: /<StudioAgentCanvas/ },
    { id: "shared-mru-hook", pattern: /useStudioActiveAgentId/ },
    // ?view=workspace still gates the deep editor form behind the canvas.
    { id: "workspace-depth-gate", pattern: /view"\) === "workspace"/ },
    { id: "deep-editor-panel", pattern: /StudioAgentWorkspacePanel/ },
    { id: "canvas-key", pattern: /StudioAgentCanvas[\s\S]*key=\{active\.id\}/ },
    { id: "workroom-key", pattern: /<StudioWorkroom[\s\S]*key=\{active\.id\}/ },
    { id: "strip-legacy-mode", pattern: /next\.delete\("mode"\)/ },
    { id: "empty-state-wire-one", pattern: /Wire one\./ },
    { id: "command-nonce", pattern: /commandNonce/ },
  ],
  spatialCanvas: [
    // Cards bind to the real agent-config record, not fabricated state.
    { id: "real-config-api", pattern: /\/api\/agent-config\// },
    { id: "agent-canvas-label", pattern: /Agent Canvas/ },
    { id: "identity-card", pattern: /Identity/ },
    { id: "voice-card", pattern: /Voice/ },
    { id: "workflows-card", pattern: /Workflows & Capabilities/ },
    { id: "knowledge-card", pattern: /Knowledge Base/ },
    { id: "situations-card", pattern: /Situations/ },
    // Honest workflow active-state comes from enabledTools; situations from directives.
    { id: "enabled-tools-binding", pattern: /enabledTools/ },
    { id: "directives-binding", pattern: /directives/ },
    // Dashed connectors link the spatial rows.
    { id: "connector-lines", pattern: /border-dashed/ },
    // Every card opens the deep editor — no capability is lost.
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
} as const;

export const STUDIO_CANVAS_LINK_SURFACES = [
  "src/pages/OverviewPage.tsx",
  "src/components/StudioOverview.tsx",
  STUDIO_CANVAS_SURFACES.workspacePanel,
] as const;
