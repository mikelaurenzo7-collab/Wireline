const KNOWLEDGE_TABS = ["Knowledge", "Reports"] as const;

const SETTINGS_TABS = ["Account", "Billing", "Team", "Appearance", "Apps", "Compliance"] as const;

const PAGE_CHROME_MODES = ["standard", "narrow", "operate", "studio"] as const;
const NAV_GROUPS = ["Work", "Manage"] as const;
const MOBILE_PRIMARY_LABELS = ["Studio", "Inbox", "Calls", "More"] as const;
const MOBILE_MORE_LABELS = [
  "Connections",
  "Knowledge",
  "Approvals",
  "Activity",
  "Settings",
] as const;

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
    primaryWork: ["Studio", "Inbox", "Calls"],
    mobilePrimary: MOBILE_PRIMARY_LABELS,
    mobileMore: MOBILE_MORE_LABELS,
    sourceOfTruth: "src/constants/navigation.ts",
    doctrine:
      "There is no separate Home dashboard. Studio is home. Inbox owns written conversations; Calls owns voice; More owns lower-frequency management surfaces.",
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
      surfaces: ["Account", "Billing", "Team", "Compliance"],
    },
    operate: {
      fullBleed: true,
      header: "thin operate title bar with tabs",
      surfaces: ["Calls", "Activity"],
    },
    studio: {
      fullBleed: true,
      header: "Bot context plus workroom; setup/review becomes an inspector on wide screens",
      surfaces: ["Studio"],
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
    studio: "canonical home and Bot workspace: create, select, configure, test, and improve",
    inbox:
      "email and text conversations, globally or scoped to one Bot; providers are filters, not navigation",
    calls:
      "voice operations, lines, history, outbound work, and reports, globally or scoped to one Bot",
    overviewRoute: "compatibility redirect to Studio; never a competing dashboard",
    agentsRoute: "compatibility redirect to Studio for old roster bookmarks",
  },
} as const;
