const KNOWLEDGE_TABS = ["Knowledge", "Voice", "Flows", "Simulator"] as const;

export const AUTHENTICATED_SURFACE_CONTRACT = {
  settings: {
    route: "/settings",
    tabs: ["Account", "Billing", "Phone", "Team"],
    requiredScreens: ["SettingsPage", "BillingSettings", "PhoneSettings", "TeamSettings"],
    requiredPhoneSections: ["Your Wireline number", "Call forwarding", "VIP contacts", "Connected devices"],
    retiredPatterns: ["settingsDestinations", "link tile hub"],
  },
  knowledge: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
    requiredSections: ["Voice engine", "Pronunciation dictionary", "Flow Composer", "Scenario library"],
    retiredPatterns: ["trainingNav", "six item section map"],
  },
  training: {
    route: "/knowledge",
    tabs: KNOWLEDGE_TABS,
  },
  hierarchy: {
    overview: "complete assistant roster and command center",
    studio: "full bleed chat plus spatial canvas",
    assistants: "studio canvas",
    agentsRoute: "redirects to studio",
  },
} as const;
