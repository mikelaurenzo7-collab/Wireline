export const PRODUCT_NAMING = {
  company: "Wireline",
  platform: "Wireline",
  wizard: "Wireline Wizard",
  studio: "Agent Studio",
  directorMode: "Director Mode",
} as const;

export const PRODUCT_NAMING_RULES = {
  wizard:
    "Use Wireline Wizard for the main user-facing AI builder/copilot that helps users build, tune, test, launch, and understand agents.",
  directorMode:
    "Use Director Mode for advanced fleet operations: multi-agent routing, live ops, QA, escalation, insights, and governance.",
  internalDirector:
    "Keep director-* internal implementation names until a deliberate cleanup pass; do not expose Director as the default assistant name.",
} as const;

export const PERSONAL_WIZARD_POSITIONING = {
  headline: "Your personal AI for the calls you avoid.",
  lede:
    "Tell Wireline Wizard what you need, approve the script, and let your agent call, wait on hold, schedule, dispute, follow up, or report back.",
  safety:
    "Wireline Wizard only acts within the bounds you approve, with live visibility and review before sensitive actions.",
  useCases: [
    "Appointment booking",
    "Customer service and returns",
    "Billing disputes and follow-ups",
    "Phone anxiety and accessibility support",
  ],
} as const;

export const BUSINESS_DIRECTOR_POSITIONING = {
  headline: "Wireline Wizard builds your agents. Director Mode runs the fleet.",
  lede:
    "Build agents in Agent Studio with Wireline Wizard, then manage call volume, routing, QA, escalations, and performance from Director Mode.",
  useCases: [
    "Inbound call coverage",
    "Outbound speed-to-lead",
    "Email and SMS follow-up",
    "Agent QA and post-call coaching",
    "Team routing and escalation governance",
  ],
} as const;
