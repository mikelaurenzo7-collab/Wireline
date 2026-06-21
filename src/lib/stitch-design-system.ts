export const STITCH_DESIGN_SYSTEM = {
  projectId: "15464421841872665077",
  projectUrl: "https://stitch.withgoogle.com/projects/15464421841872665077",
  title: "Precision Operator",
  designSpec: ".stitch/DESIGN.md",
  sourceManifest: ".stitch/precision-operator/manifest.json",
} as const;

export const STITCH_SCREENS = {
  "/studio": { source: "studio_agent_training", component: "src/components/StudioWorkspaceV2.tsx" },
  "/studio?create=1": { source: "studio_create_agent_modal", component: "src/components/StudioWorkspaceV2.tsx" },
  "/agents": { source: "agents_fleet_roster", component: "src/pages/AgentsPage.tsx", states: ["agents_empty_state", "agents_loading_state", "agents_degraded_state"] },
  "/knowledge": { source: "knowledge_facts_rules", component: "src/pages/KnowledgePage.tsx", states: ["knowledge_empty_state"] },
  "/actions": { source: "actions_permissions_connections", component: "src/pages/IntegrationsPage.tsx" },
  "/ops": { source: "live_real_time_ops", component: "src/pages/OperationsPage.tsx", states: ["live_handoffs_queue", "live_quality_review"] },
  "/settings": { source: "settings_workspace_admin", component: "src/pages/SettingsPage.tsx" },
} as const;

export const STITCH_CODE_SYSTEM = {
  tokens: "src/styles/precision-operator-web.css",
  patterns: "src/styles/stitch-patterns.css",
  workspace: "src/components/WorkspaceShell.tsx",
  designMd: ".stitch/DESIGN.md",
  sourceManifest: ".stitch/precision-operator/manifest.json",
} as const;
