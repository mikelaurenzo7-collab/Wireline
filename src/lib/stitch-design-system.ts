/**
 * Wireline ↔ Google Stitch bridge.
 * Local export: stitch_wireline_operator_design_system/
 * Live project: https://stitch.withgoogle.com/projects/6981221452983374608
 */
export const STITCH_DESIGN_SYSTEM = {
  projectId: "6981221452983374608",
  projectUrl: "https://stitch.withgoogle.com/projects/6981221452983374608",
  title: "Wireline Operator Design System",
  localExport: "stitch_wireline_operator_design_system",
  designSpec: ".stitch/DESIGN.md",
} as const;

/** Stitch screen folder → Wireline route (copy tailored for personal + business assistants) */
export const STITCH_SCREENS = {
  "/": {
    stitchFolder: "wireline-ai-agent-fleet-for-business",
    component: "src/pages/LandingPage.tsx",
    note: "Stitch bento layout; personal-first hero and copy.",
  },
  "/signin": {
    stitchFolder: "sign_in_wireline",
    stitchFile: ".stitch-export/sign-in-wireline.html",
    component: "src/components/AuthPortal.tsx",
  },
  "/studio": {
    stitchFolder: "agent_studio_integrated_creation",
    component: "src/components/StudioWorkspaceV2.tsx",
  },
  "/agents": {
    stitchFolder: "agent_fleet_list_polished",
    component: "src/pages/AgentsPage.tsx",
    note: "Assistants grid — personal/business language, not fleet ops copy.",
  },
  "/knowledge": {
    stitchFolder: "knowledge_base_polished",
    component: "src/components/KnowledgeWorkspace.tsx",
  },
  "/integrations": {
    stitchFolder: "actions_integrations_polished",
    component: "src/components/IntegrationsWorkspace.tsx",
  },
  "/ops": {
    stitchFolder: "live_ops_polished",
    component: "src/pages/OperationsPage.tsx",
  },
  "/settings": {
    stitchFolder: "workspace_settings",
    component: "src/pages/SettingsPage.tsx",
  },
  "/solutions/sales": {
    stitchFile: ".stitch-export/sales-solutions-wireline.html",
    component: "src/pages/SolutionsPage.tsx",
  },
  "/solutions/support": {
    stitchFile: ".stitch-export/support-solutions-wireline.html",
    component: "src/pages/SolutionsPage.tsx",
  },
  "/pricing": {
    stitchFile: ".stitch-export/pricing-wireline.html",
    component: "src/pages/Pricing.tsx",
  },
} as const;

export const STITCH_CODE_SYSTEM = {
  tokens: "src/styles/foundation.css",
  patterns: "src/styles/stitch-patterns.css",
  marketing: "src/styles/cta-readability.css",
  workspace: "src/styles/workspace-buttons.css",
  classes: "src/lib/wireline-design-system.ts",
  designMd: ".stitch/DESIGN.md",
  apiExport: ".stitch-export/manifest.json",
} as const;
