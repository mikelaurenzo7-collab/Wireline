export const STITCH_DESIGN_SYSTEM = {
  projectId: "6981221452983374608",
  projectUrl: "https://stitch.withgoogle.com/projects/6981221452983374608",
  title: "Wireline Operating System",
  designSpec: ".stitch/DESIGN.md",
  exportManifest: ".stitch-export/manifest.json",
} as const;

export const STITCH_SCREENS = {
  "/": { stitchFile: ".stitch-export/wireline-ai-agent-fleet-for-business.html", component: "src/pages/LandingPage.tsx" },
  "/signin": { stitchFile: ".stitch-export/sign-in-wireline.html", component: "src/components/AuthPortal.tsx" },
  "/studio": { stitchFile: ".stitch-export/agent-studio-integrated-creation.html", component: "src/components/StudioWorkspaceV2.tsx" },
  "/agents": { stitchFile: ".stitch-export/agent-fleet-list-polished.html", component: "src/pages/AgentsPage.tsx" },
  "/knowledge": { stitchFile: ".stitch-export/knowledge-base-polished.html", component: "src/components/KnowledgeWorkspace.tsx" },
  "/actions": { stitchFile: ".stitch-export/actions-integrations-polished.html", component: "src/components/IntegrationsWorkspace.tsx" },
  "/ops": { stitchFile: ".stitch-export/live-ops-polished.html", component: "src/pages/OperationsPage.tsx" },
  "/settings": { stitchFile: ".stitch-export/workspace-settings.html", component: "src/pages/SettingsPage.tsx" },
  "/solutions/sales": { stitchFile: ".stitch-export/sales-solutions-wireline.html", component: "src/pages/SolutionsPage.tsx" },
  "/solutions/support": { stitchFile: ".stitch-export/support-solutions-wireline.html", component: "src/pages/SolutionsPage.tsx" },
  "/pricing": { stitchFile: ".stitch-export/pricing-wireline.html", component: "src/pages/Pricing.tsx" },
} as const;

export const STITCH_CODE_SYSTEM = {
  tokens: "src/styles/foundation.css",
  patterns: "src/styles/stitch-patterns.css",
  workspace: "src/styles/workspace-buttons.css",
  marketing: "src/styles/cta-readability.css",
  classes: "src/lib/wireline-design-system.ts",
  designMd: ".stitch/DESIGN.md",
  apiExport: ".stitch-export/manifest.json",
} as const;
