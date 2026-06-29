export const AUTHENTICATED_SURFACE_CONTRACT = {
  settings: {
    route: "/settings",
    tabs: ["Account", "Billing", "Phone", "Team"],
    requiredScreens: ["SettingsPage", "BillingSettings", "PhoneSettings", "TeamSettings"],
    requiredPhoneSections: ["Your Wireline number", "Call forwarding", "VIP contacts", "Connected devices"],
    retiredPatterns: ["settingsDestinations", "link-tile hub"],
  },
  training: {
    route: "/knowledge",
    tabs: ["Knowledge", "Voice", "Flows", "Simulator"],
    requiredSections: ["Voice engine", "Pronunciation dictionary", "Flow Composer", "Scenario library", "Run test call"],
    retiredPatterns: ["trainingNav", "six-item section map"],
  },
  hierarchy: {
    overview: "dashboard preview",
    assistants: "full management directory",
  },
} as const;
