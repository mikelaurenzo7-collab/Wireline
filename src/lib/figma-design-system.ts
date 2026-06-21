/**
 * Wireline ↔ Figma design system bridge.
 * Source of truth for tokens: src/styles/foundation.css + shadcn semantic vars.
 * Figma library: Wireline Design System v1
 */
export const FIGMA_DESIGN_SYSTEM = {
  fileKey: "0DRoWTyl71bfUBrK5W59e8",
  fileUrl: "https://www.figma.com/design/0DRoWTyl71bfUBrK5W59e8/Wireline-Design-System-v1",
  figJam: {
    routingMap: "https://www.figma.com/board/IZcX3HcGRi72SHFTG8k2fn",
    productIa: "https://www.figma.com/board/HjqmcLUaayF7kmKOlnGo4o",
  },
} as const;

/** Screen code · TOOL-DASH +DENSE unless noted */
export const FIGMA_SCREENS = {
  "/studio": {
    frame: "/studio/default",
    page: "Product / Studio",
    code: "CHAT-OPS",
    component: "src/components/StudioWorkspaceV2.tsx",
    states: ["/studio/default", "/studio/create-modal"],
  },
  "/agents": {
    frame: "/agents/list-default",
    page: "Product / Agents",
    code: "TOOL-DASH +DENSE",
    component: "src/pages/AgentsPage.tsx",
    states: ["/agents/list-default", "/agents/empty", "/agents/loading", "/agents/degraded"],
  },
  "/knowledge": {
    frame: "/knowledge/default",
    page: "Product / Knowledge",
    code: "TOOL-DASH +DENSE",
    component: "src/pages/KnowledgePage.tsx",
    states: ["/knowledge/default", "/knowledge/empty"],
  },
  "/integrations": {
    frame: "/integrations/default",
    page: "Product / Actions",
    code: "TOOL-DASH +DENSE",
    component: "src/pages/IntegrationsPage.tsx",
    /** Nav and page title both use "Actions". */
    navLabel: "Actions",
    pageTitle: "Actions",
  },
  "/ops": {
    frame: "/ops/live-default",
    page: "Product / Live",
    code: "TOOL-DASH +DENSE",
    component: "src/pages/OperationsPage.tsx",
    navLabel: "Live",
    pageTitle: "Live",
    states: ["/ops/live-default", "/ops/handoffs-default", "/ops/review-default"],
  },
  "/settings": {
    frame: "/settings/default",
    page: "Product / Settings",
    code: "TOOL-DASH +DENSE",
    component: "src/pages/SettingsPage.tsx",
  },
} as const;

export const FIGMA_COMPONENTS = {
  Button: {
    figmaPage: "Components / Button",
    code: "src/components/ui/shadcn/ShadButton.tsx",
  },
  Input: {
    figmaPage: "Components / Input",
    code: "src/components/ui/shadcn/Input.tsx",
  },
  Card: {
    figmaPage: "Components / Card",
    code: "src/components/ui/shadcn/Card.tsx",
  },
  EmptyState: {
    figmaPage: "Components / EmptyState",
    code: "src/components/ui/EmptyState.tsx",
  },
  NavLink: {
    figmaPage: "Components / NavLink",
    code: "src/components/WorkspaceShell.tsx",
  },
  WorkspaceShell: {
    figmaPage: "Patterns / Workspace Shell",
    code: "src/components/WorkspaceShell.tsx",
  },
} as const;

export const FIGMA_TOKEN_COLLECTIONS = [
  "Wireline Primitives",
  "Wireline Semantic",
  "Wireline Spacing",
  "Wireline Radius",
] as const;

/** Code-side class constants aligned with Figma components */
export const FIGMA_CODE_SYSTEM = {
  tokens: "src/styles/foundation.css",
  patterns: "src/styles/design-system.css",
  workspace: "src/styles/workspace-buttons.css",
  classes: "src/lib/wireline-design-system.ts",
} as const;
