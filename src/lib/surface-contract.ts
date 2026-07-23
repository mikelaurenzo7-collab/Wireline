const KNOWLEDGE_TABS = ["Business knowledge", "Reports"] as const;

const SETTINGS_TABS = [
  "Account",
  "Billing",
  "Phone",
  "Team",
  "Appearance",
  "Apps",
  "Compliance",
] as const;

const PAGE_CHROME_MODES = ["standard", "narrow", "operate", "studio"] as const;

const NAV_GROUPS = ["Workspace", "Agents", "Operate"] as const;

const MOBILE_PRIMARY_LABELS = ["Overview", "AI Employee", "Inbox", "Calls", "More"] as const;

const MOBILE_MORE_LABELS = [
  "Connections",
  "Knowledge",
  "Approvals",
  "Activity",
  "Settings",
] as const;

export const AUTHENTICATED_SURFACE_CONTRACT = {
  brand: {
    system: "Wireline Letterpress (Aurora)",
    doctrine: "obsidian canvas, electric violet action, silver wire",
    retired: ["warm cream paper", "forest green primary", "copper wire rule"],
  },
  navigation: {
    groups: NAV_GROUPS,
    mobilePrimary: MOBILE_PRIMARY_LABELS,
    mobileMore: MOBILE_MORE_LABELS,
    sourceOfTruth: "src/constants/navigation.ts",
  },
  pageChrome: {
    modes: PAGE_CHROME_MODES,
    standard: {
      maxWidth: "980px",
      header: "WorkspacePageIntro start-aligned",
      surfaces: ["Overview", "Knowledge", "Connections", "Approvals", "Apps", "Inbox"],
    },
    narrow: {
      maxWidth: "700px",
      header: "Settings tabs + intro",
      surfaces: ["Account", "Billing", "Team", "Compliance"],
    },
    operate: {
      fullBleed: true,
      header: "thin operate title bar with tabs",
      surfaces: ["Phone", "Insights"],
    },
    studio: {
      fullBleed: true,
      header: "StudioContextChrome only",
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
      "PhoneSettings",
      "TeamSettings",
      "CustomizationSettings",
      "ComplianceCenterPage",
    ],
    narrowTabs: ["Account", "Billing", "Team", "Compliance"],
    standardTabs: ["Phone", "Appearance"],
    requiredPhoneSections: [
      "Your Wireline number",
      "company-identity",
      "Routing",
      "Brand surfaces",
    ],
    retiredPatterns: ["settingsDestinations", "link tile hub", "Call forwarding card grid"],
  },
  knowledge: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
    requiredSections: ["Business knowledge", "Reports"],
    retiredPatterns: ["trainingNav", "six item section map", "Voice/Flows/Simulator tabs"],
  },
  training: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
  },
  hierarchy: {
    overview: "complete agent roster, health summary, and next-action home",
    studio: "full bleed chat plus spatial canvas",
    agentsRoute: "defensive redirect to overview for old assistant-roster bookmarks",
  },
} as const;
