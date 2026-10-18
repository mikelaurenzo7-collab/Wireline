const KNOWLEDGE_TABS = ["Knowledge", "Reports"] as const;

const SETTINGS_TABS = ["Account", "Billing", "Team", "Appearance", "Apps", "Compliance"] as const;

const PAGE_CHROME_MODES = ["standard", "narrow", "operate", "studio"] as const;
const NAV_GROUPS = ["Work", "Manage"] as const;
const WORKSPACE_SECTION_LABELS = ["Set Up", "Knowledge", "Computer"] as const;
const MOBILE_PRIMARY_LABELS = ["Workspace", "Inbox", "Calls", "Insights", "More"] as const;
const MOBILE_MORE_LABELS = ["Calendar", "Connections", "Settings"] as const;

export const AUTHENTICATED_SURFACE_CONTRACT = {
  brand: {
    system: "BotBound Design System",
    doctrine:
      "near-black canvas, restrained electric-violet action, off-white primary text, quiet secondary text, and semantic status",
    namingRule:
      "BotBound is the only customer-facing product name. Use functional visual terms only: canvas, surface, raised, recessed, text, violet, signal, and status.",
    typography:
      "Inter Tight for display and the BotBound wordmark, Inter for body and controls, IBM Plex Mono only for compact metadata and system labels.",
    retired: [
      "the pre-BotBound customer-facing company name",
      "Letterpress as a design-system name",
      "Obsidian as a design-system name",
      "Aurora as a design-system name",
      "named material themes",
      "warm cream paper",
      "forest green primary",
      "copper wire rule",
      "all-caps product wordmarks",
    ],
  },
  navigation: {
    groups: NAV_GROUPS,
    primaryWork: ["Workspace", "Inbox", "Calls", "Calendar"],
    workspaceSections: WORKSPACE_SECTION_LABELS,
    mobilePrimary: MOBILE_PRIMARY_LABELS,
    mobileMore: MOBILE_MORE_LABELS,
    sourceOfTruth: "src/constants/navigation.ts",
    doctrine:
      "There is no separate Home dashboard. The Workspace is home: everything about one Bot (Set Up with Try It beside it, Knowledge, Computer). Inbox owns written conversations; Calls owns voice history and lines; Insights owns performance across channels; More owns lower-frequency management surfaces.",
  },
  pageChrome: {
    modes: PAGE_CHROME_MODES,
    standard: {
      maxWidth: "980px",
      header: "WorkspacePageIntro start-aligned",
      surfaces: ["Knowledge", "Connections", "Approvals", "Apps", "Inbox"],
    },
    narrow: {
      maxWidth: "700px",
      header: "Settings tabs + intro",
      surfaces: ["Account", "Billing", "Team", "Appearance", "Compliance"],
    },
    operate: {
      fullBleed: true,
      header: "thin operate title bar with tabs",
      surfaces: ["Calls", "Insights"],
    },
    studio: {
      fullBleed: true,
      header:
        "Bot context with Workspace sections; Try It, Details, and Summary share a side panel on wide screens",
      surfaces: ["Workspace"],
    },
  },
  statePrimitives: {
    routeLoad: "RouteFallback",
    panelLoad: "skeleton-presets",
    soleEmpty: "EmptyState | wl-empty",
    error: "StatusNotice (destructive)",
    primaryAction: "atoms/Button",
  },
  settings: {
    route: "/settings",
    tabs: SETTINGS_TABS,
    requiredScreens: [
      "SettingsPage",
      "BillingSettings",
      "TeamSettings",
      "CustomizationSettings",
      "ComplianceCenterPage",
    ],
    standardTabs: SETTINGS_TABS,
    phoneOwnership: "Calls → Lines is canonical; /settings/phone is compatibility-only",
    retiredPatterns: [
      "duplicate phone setup inside Settings",
      "settingsDestinations",
      "link tile hub",
      "Call forwarding card grid",
    ],
  },
  knowledge: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
    requiredSections: ["Knowledge", "Reports"],
    retiredPatterns: ["trainingNav", "six item section map", "Voice/Flows/Simulator tabs"],
  },
  training: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
  },
  hierarchy: {
    studio:
      "canonical home and Bot Workspace: create, select, change, try, ground in knowledge, and assign computer work",
    inbox:
      "email and text conversations, globally or scoped to one Bot; providers are filters, not navigation",
    calls: "voice history, outbound work, and lines, globally or scoped to one Bot",
    insights: "performance, reliability, quality, and revenue across every channel",
    overviewRoute: "compatibility redirect to the Workspace; never a competing dashboard",
    agentsRoute: "compatibility redirect to the Workspace for old roster bookmarks",
    workspaceRoute: "readable alias for the Workspace, whose canonical route stays /studio",
  },
} as const;
