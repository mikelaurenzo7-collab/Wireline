/**
 * Wireline Recaps – instrument-grade design contract.
 * Copy + class hooks for Recaps, floor, and setup nudges.
 * Palette: Wireline Letterpress (see foundation.css).
 */

/** Channel & ops empty states – one copy source for route-level CTAs */
export const OPS_CHANNEL_EMPTY = {
  floor: {
    title: "No Active Callers",
    actions: [
      { label: "View Call History", to: "/phone?tab=logs" },
      { label: "Open Workspace", to: "/studio", primary: true },
    ],
  },
  fleetRail: {
    title: "No Bots Yet",
    actions: [{ label: "Open Workspace", to: "/studio", primary: true }],
  },
  fleetAgents: {
    title: "No Roster Yet",
  },
  agentRecall: {
    title: "No Calls Yet",
  },
  agentDockCalls: {
    title: "No Calls Yet",
  },
  phone: {
    title: "No Calls Yet",
    actions: [
      { label: "Configure a Number", to: "/phone?tab=lines", primary: true },
      { label: "Start Outbound", to: "/phone?tab=outbound" },
    ],
  },
  phoneNoMatch: {
    title: "No Matching Calls",
  },
  sms: {
    title: "No SMS Yet",
    actions: [
      { label: "Configure SMS Sender", to: "/phone?tab=lines", primary: true },
      { label: "Start Outbound", to: "/phone?tab=outbound" },
    ],
  },
  email: {
    title: "No Threads Yet",
    actions: [
      { label: "Connect Email", to: "/connections", primary: true },
      { label: "Open Workspace", to: "/studio" },
    ],
  },
  inboxDetail: {
    title: "Select a Thread",
  },
  pipeline: {
    title: "No Leads in the Pipeline",
    actions: [
      { label: "Call", to: "/phone?tab=outbound", primary: true },
      { label: "Open Connections", to: "/connections" },
    ],
  },
  training: {
    title: "No Bots to Train Yet",
    actions: [{ label: "Open Workspace", to: "/studio", primary: true }],
  },
  integrations: {
    title: "No Carriers Linked",
  },
  audit: {
    title: "Audit Trail Is Quiet",
    actions: [
      { label: "Deploy a Bot", to: "/studio?create=1", primary: true },
      { label: "Open Activity", to: "/insights" },
    ],
  },
  auditNoMatch: {
    title: "No Matches",
  },
  intel: {
    title: "All Clear",
    actions: [
      { label: "Open Activity", to: "/insights", primary: true },
      { label: "Open Workspace", to: "/studio" },
    ],
  },
  sentiment: {
    title: "No Conversations Yet",
    actions: [{ label: "Call Demo Line", to: "tel:+16306425661", primary: true }],
  },
  campaigns: {
    title: "No Campaigns Yet",
    actions: [
      { label: "Create Campaign", to: "/phone?tab=outbound&view=campaigns", primary: true },
    ],
  },
  outboundQueue: {
    title: "Queue Is Idle",
  },
  campaignLeads: {
    title: "No Leads in Campaign",
  },
  callbacks: {
    title: "No Scheduled Callbacks",
    actions: [
      { label: "Open Dispatch", to: "/phone?tab=outbound&view=dispatch", primary: true },
      { label: "View Call History", to: "/phone?tab=logs" },
    ],
  },
  cadences: {
    title: "No Sequences Yet",
    actions: [
      { label: "Create Sequence", to: "/phone?tab=outbound&view=sequences", primary: true },
    ],
  },
  appointmentsUpcoming: {
    title: "No Active Commitments",
  },
  appointmentsHistory: {
    title: "No Completed Appointments Yet",
  },
  contactNotFound: {
    title: "Contact Not Found",
    actions: [{ label: "Back to Pipeline", to: "/pipeline", primary: true }],
  },
  contactTimeline: {
    title: "No Interactions Yet",
    actions: [
      { label: "Start Outbound", to: "/phone?tab=outbound", primary: true },
      { label: "View Call History", to: "/phone?tab=logs" },
    ],
  },
} as const;

/** Triage page-level copy – toolbar + all-clear banner */
export const OPS_TRIAGE_COPY = {
  allClearStat: "All clear",
  allClearBannerTitle: "All Clear",
  allClearBannerCta: "Active calls",
  /** Slim hot-lead signal strip – replaces the old full-height Hot Leads panel. */
  hotStripLabel: (n: number) => `${n} hot lead${n === 1 ? "" : "s"}`,
  hotStripCta: "Brief agent",
  hotStripPrompt: (n: number) =>
    `Brief me on my ${n} hottest lead${n === 1 ? "" : "s"} right now, who they are, why they're hot, and what the agent is doing to close them.`,
  escalationCoachPrompt: (number: string, summary: string) =>
    `Coach me through the escalated call from ${number}. Context: ${summary.slice(0, 400)}`,
} as const;

/** Deep-link into Studio with an agent focused and the workroom composer prefilled. */
export function directorAssistHref(agentId: string, prompt: string): string {
  return `/studio?agent=${encodeURIComponent(agentId)}&command=${encodeURIComponent(prompt)}`;
}

/** Channel toolbar copy – ClientToolbar left labels + loading states */
export const OPS_CHANNEL_TOOLBAR = {
  phone: {
    loading: "Loading call history",
    stat: (n: number) => `${n} call${n === 1 ? "" : "s"}`,
    searchPlaceholder: "Search signals…",
  },
  email: {
    loading: "Loading inbox",
    stat: (n: number) => `${n} thread${n === 1 ? "" : "s"}`,
    sync: "Sync inbox",
  },
  sms: {
    loading: "Loading SMS threads",
    stat: (n: number) => `${n} conversation${n === 1 ? "" : "s"}`,
    refresh: "Refresh",
  },
  audit: {
    loading: "Loading audit log",
    stat: (n: number) => `${n.toLocaleString()} event${n === 1 ? "" : "s"}`,
    export: "Export CSV",
    refresh: "Refresh",
  },
  pipeline: {
    loading: "Loading pipeline",
  },
  triage: {
    loading: "Scanning triage",
    stat: (n: number) => (n === 0 ? OPS_TRIAGE_COPY.allClearStat : `${n} need attention`),
    refresh: "Refresh",
  },
  ops: {
    loading: "Syncing Recaps",
    floor: (n: number) => `${n} live caller${n === 1 ? "" : "s"}`,
    intel: (n: number) => `${n} pending action${n === 1 ? "" : "s"}`,
    analytics: "Agent analytics",
    triage: (n: number) => OPS_CHANNEL_TOOLBAR.triage.stat(n),
  },
  insights: {
    stat: (days: number) => `${days}-day window`,
    export: "Export CSV",
  },
  training: {
    loading: "Loading Workspace",
    stat: (n: number) => `${n} agent${n === 1 ? "" : "s"}`,
  },
  appointments: {
    loading: "Loading appointments",
    stat: (n: number) => `${n} scheduled`,
    book: "Book",
  },
  outbound: {
    loading: "Loading queue",
    stat: (queued: number, total: number) =>
      total > 0 ? `${queued} queued -+ ${total} leads` : "Queue idle",
    export: "Export",
  },
  cadences: {
    loading: "Loading sequences",
  },
  contact: {
    loading: "Loading contact",
    stat: (events: number) => `${events} event${events === 1 ? "" : "s"}`,
  },
  Assistants: {
    templatesStat: (n: number) => `${n} template${n === 1 ? "" : "s"}`,
    agentsStat: (n: number) => `${n} agent${n === 1 ? "" : "s"}`,
  },
  integrations: {
    loading: "Loading integrations",
    stat: (n: number) => `${n} carrier${n === 1 ? "" : "s"}`,
    sync: "Sync all",
  },
  dnc: {
    loading: "Loading DNC list",
    stat: (n: number) => `${n} blocked`,
    refresh: "Refresh",
    import: "Import CSV",
    add: "Add Number",
  },
} as const;

/** Settings hub – settings tabs, panel padding, save footers */
export const OPS_ADMIN = {
  loading: "Loading settings",
  saving: "Saving…",
  tabLabels: {
    accounts: "Accounts",
    branding: "Branding",
    carrier: "Carrier & Routing",
    subscription: "Billing",
    team: "Team Access",
    system: "System Health",
    activity: "Audit Activity",
  },
  saveLabels: {
    branding: "Save Branding",
    carrier: "Save Carrier Settings",
    carrierMessaging: "Save Messaging Settings",
    subscription: "Save Billing",
    growth: "Save Growth Settings",
  },
} as const;

export type OpsAdminTab = keyof typeof OPS_ADMIN.tabLabels;

export const WL_ADMIN_CLASSES = {
  panel: "wl-admin-panel",
  saveBar: "wl-admin-save-bar",
  helpCard: "wl-help-agent-card",
} as const;

/** Insights tab groups – Performance / Quality / Revenue */
export const OPS_INSIGHTS_GROUPS = [
  {
    id: "performance",
    label: "Performance",
    tabs: ["funnel", "goals"] as const,
  },
  {
    id: "reliability",
    label: "Reliability",
    tabs: ["reliability"] as const,
  },
  {
    id: "quality",
    label: "Quality",
    tabs: ["quality"] as const,
  },
  {
    id: "sources",
    label: "Sources",
    tabs: ["topics"] as const,
  },
] as const;

/** Compliance & settings empty states */
export const OPS_SUPPORT_EMPTY = {
  dnc: {
    title: "No Numbers Blocked",
  },
  dncNoMatch: {
    title: "No Matches",
  },
} as const;

/** Insights tab empty states — title + CTA only; no coaching copy. */
export const OPS_INSIGHTS_EMPTY = {
  funnel: {
    title: "No Funnel Data",
    actions: [
      { label: "Start Outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Workspace", to: "/studio" },
    ],
  },
  reliability: {
    title: "No Reliability Samples",
    actions: [
      { label: "Workspace", to: "/studio", primary: true },
      { label: "Call History", to: "/phone?tab=logs" },
    ],
  },
  quality: {
    title: "No QA Scores",
    actions: [
      { label: "Call History", to: "/phone?tab=logs" },
      { label: "Workspace", to: "/studio" },
    ],
  },
  topics: {
    title: "Not Enough Calls",
    actions: [
      { label: "Call History", to: "/phone?tab=logs", primary: true },
      { label: "Workspace", to: "/studio" },
    ],
  },
} as const;
