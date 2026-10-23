/**
 * Wireline Recaps – instrument-grade design contract.
 * Copy + class hooks for Recaps, floor, and setup nudges.
 * Palette: Wireline Letterpress (see foundation.css).
 */

import { WL_BRAND } from "./wireline-design-system";
import { BRAND } from "../constants/brand-colors";

export const WL_OPS_CLASSES = {
  canvas: "wl-ops-canvas",
  pulseStrip: "wl-ops-pulse-strip",
  metric: "wl-ops-metric",
  metricInteractive: "wl-ops-metric wl-ops-metric--interactive",
  metricValue: "wl-ops-metric-value",
  metricLabel: "wl-ops-metric-label",
  floorFrame: "wl-ops-floor-frame",
  callCard: "wl-ops-call-card",
  callCardEscalated: "wl-ops-call-card wl-ops-call-card--escalated",
  railCard: "wl-ops-rail-card",
  scoreBadge: "wl-ops-score-badge",
  setupNudge: "wl-setup-nudge",
  /** Toolbar filter / action chip typography */
  filterChip: "wl-ops-chip",
  triageGrid: "wl-ops-triage-grid",
  dotSep: "wl-dot-sep",
  divider: "wl-ops-divider",
  /** Insights tab section labels (mono instrument typography) */
  insightLabel: "wl-insight-label",
} as const;

/** Sentiment chart – active green positive; monochrome neutral; rose negative */
export const OPS_SENTIMENT_COLORS = {
  positive: WL_BRAND.accentHex,
  neutral: BRAND.colors.outline,
  negative: BRAND.colors.error,
} as const;

export const OPS_PULSE_METRICS = {
  live: { label: "Live callers", mono: true },
  pending: { label: "Pending actions", mono: true },
  Assistants: { label: "Agents", mono: true },
  escalations: { label: "Escalations", mono: true },
} as const;

export const OPS_COPY = {
  floorQuiet: "No live calls. Active conversations appear here.",
  floorLoading: "Loading Active calls",
  floorTitle: (n: number) => (n === 0 ? "Active Calls" : `${n} Live Caller${n === 1 ? "" : "s"}`),
  intelHub: "Action queue",
  intelEmpty: "All clear. No approvals waiting.",
  telemetryTitle: "Agent Activity",
  telemetryActive: "Streaming",
  growthTitle: "Autonomous Outreach",
  growthBody: "Queue an outreach run when your agent is deployed.",
  growthCta: "Queue outreach",
  growthCtaBusy: "Queuing…",
  growthDeployFirst: "Deploy an agent first",
  analyticsSection: "Agent analytics",
  sentimentEmptyTitle: "No Conversations Yet",
  sentimentEmptyHint: "Complete a conversation with your Bot to populate sentiment.",
  roiLabel: "Agent efficiency",
  setupEyebrow: "Agent setup",
  setupBody: (done: number, total: number) =>
    `${done} of ${total} complete, agent, Training, number, and first useful call.`,
  setupHint:
    "Activation requires a real phone conversation; a private browser rehearsal does not activate it.",
  testCallNumber: "(630) 642-5661",
  testCallHref: "tel:+16306425661",
} as const;

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
      { label: "Configure a Number", to: "/phone?tab=setup", primary: true },
      { label: "Start Outbound", to: "/phone?tab=outbound" },
    ],
  },
  phoneNoMatch: {
    title: "No Matching Calls",
  },
  sms: {
    title: "No SMS Yet",
    actions: [
      { label: "Configure SMS Sender", to: "/phone?tab=setup", primary: true },
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
      { label: "Reviewed Calls", to: "/phone?tab=outbound", primary: true },
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

/** Dense Training / Agents editor panel empties (nested sections, not route-level) */
export const OPS_TRAINING_PANEL = {
  rules: "No rules. Add below.",
  directives: "No directives. Add below.",
  facts: "No facts. Add below.",
  knowledge: {
    title: "No Entries Yet",
  },
} as const;

/** Triage panel accent rails – monochrome neutrals + status tokens */
export const OPS_TRIAGE_ACCENTS = {
  hotLeads: WL_BRAND.accentHex,
  openTasks: BRAND.colors.primary,
  escalations: BRAND.colors.error,
  compliance: BRAND.colors.error,
  knowledgeGaps: BRAND.colors.outline,
} as const;

/** Triage panel empty states – Recaps `?tab=triage` widget columns */
export const OPS_TRIAGE_EMPTY = {
  hotLeads: {
    title: "No Hot Leads Yet",
    actions: [
      { label: "Start Outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Call Activity", to: "/phone?tab=logs" },
    ],
  },
  compliance: {
    title: "All Clear",
  },
  openTasks: {
    title: "Inbox Zero",
    actions: [{ label: "View Action Queue", to: "/approvals" }],
  },
  knowledgeGaps: {
    title: "Coverage Looks Solid",
    actions: [{ label: "Open Training", to: "/studio" }],
  },
  escalations: {
    title: "No Escalations",
    actions: [{ label: "Active Calls", to: "/phone" }],
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

/**
 * Training assists – replaces the old recipe pop-out modals with
 * deep-links that prefill Director chat (mobile-safe, no modal to fail).
 */
export const OPS_TRAINING_ASSISTS = [
  {
    label: "Performance review",
    prompt:
      "Review this agent's recent calls and give me a performance read: wins, misses, and the top 3 coaching directives to add.",
  },
  {
    label: "Clone persona",
    prompt:
      "Clone this agent's persona into a new agent, keep the voice and tone, and summarize what carries over.",
  },
  {
    label: "Ingest a URL",
    prompt: "Ingest this URL into this agent's Training sources: ",
  },
  {
    label: "Objection drills",
    prompt:
      "Run objection drills against this agent: throw the 5 most common objections for its vertical and grade the responses.",
  },
  {
    label: "Call playbook",
    prompt:
      "Draft a call playbook for this agent: opening, discovery, objection handling, and close.",
  },
  {
    label: "Pre-call brief",
    prompt: "Prepare a pre-call brief for this agent's next outbound call.",
  },
] as const;

export const OPS_TRAINING_ASSISTS_COPY = {
  hint: "Runs in the Workspace chat",
} as const;

/**
 * Studio co-pilot assists – setup-oriented prompts on the agent canvas.
 * Where Training assists review performance, these help BUILD the agent:
 * each deep-links into Director coach mode scoped to the focused agent,
 * where the Director proposes config changes the Account Holder approves.
 */
export const OPS_STUDIO_ASSISTS = [
  {
    label: "Write the greeting",
    prompt:
      "Write a warm, on-brand opening greeting for this agent and propose it as the first message.",
  },
  {
    label: "Sharpen the persona",
    prompt:
      "Rewrite this agent's personality block, keep the role, make it sharper, warmer, and more specific to my business.",
  },
  {
    label: "Set the schedule",
    prompt: "Help me set this agent's business hours and an out-of-hours message for my timezone.",
  },
  {
    label: "Pick the right tools",
    prompt:
      "Review this agent's enabled tools for its role and propose which to turn on or off, with one-line reasons.",
  },
  {
    label: "Prep a rehearsal call",
    prompt:
      "Give me a 60-second rehearsal script to review this Bot's greeting, Training, and escalation handling.",
  },
] as const;

export const OPS_STUDIO_ASSISTS_COPY = {
  hint: "Opens the Workspace for this Bot",
} as const;

/** Deep-link into Studio with an agent focused and the workroom composer prefilled. */
export function directorAssistHref(agentId: string, prompt: string): string {
  return `/studio?agent=${encodeURIComponent(agentId)}&command=${encodeURIComponent(prompt)}`;
}

/** Deep-link into Studio with only a prefilled workroom command. */
export function directorPromptHref(prompt: string): string {
  return `/studio?command=${encodeURIComponent(prompt)}`;
}

/** In-app help route – quick paths + page chrome */
export const OPS_HELP = {
  title: "Help and Demos",
  subtitle: "Team lines, demos, and shortcuts back into BotBound.",
  stat: (live: number, demos: number) =>
    `${live} live line${live === 1 ? "" : "s"} -+ ${demos} demo${demos === 1 ? "" : "s"}`,
  quickLinks: [
    { label: "Workspace", to: "/studio", hint: "Open your Bot workspace" },
    { label: "Connections", to: "/connections", hint: "Numbers, email, and integrations" },
    { label: "Details", to: "/studio?section=setup", hint: "Job, greeting, facts, and voice" },
    { label: "Support", to: "/support", hint: "Get help with your BotBound workspace" },
  ],
} as const;

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

/** Pipeline kanban copy */
export const OPS_PIPELINE = {
  emptyColumn: "Drop leads here",
  dragHint: "Drag to move stage",
} as const;

/** Integration preview + live card class hooks */
export const WL_INTEGRATION_CLASSES = {
  previewCard: "wl-integration-preview-card",
  liveCard: "wl-integration-live-card",
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
    flywheel: "Growth Engine",
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

/** Founder command surface copy */
export const OPS_FOUNDER = {
  loading: "Loading staff",
  stat: (n: number) => `${n} staff agent${n === 1 ? "" : "s"}`,
  broadcastPlaceholder: "e.g. From today, always confirm the caller's email by spelling it back.",
  broadcastSend: "Send to all 6",
} as const;

/** KPI / metric tiles - founder overview and recaps summaries */
export const WL_STAT_CLASSES = {
  tile: "wl-stat-tile",
  tileBrand: "wl-stat-tile wl-stat-tile--brand",
  tileInk: "wl-stat-tile wl-stat-tile--ink",
  tileRose: "wl-stat-tile wl-stat-tile--rose",
  tileMuted: "wl-stat-tile wl-stat-tile--muted",
  value: "wl-stat-tile__value",
  valueBrand: "wl-stat-tile__value wl-stat-tile__value--brand",
  valueInk: "wl-stat-tile__value wl-stat-tile__value--ink",
  valueRose: "wl-stat-tile__value wl-stat-tile__value--rose",
  valueMuted: "wl-stat-tile__value wl-stat-tile__value--muted",
  label: "wl-stat-tile__label wl-label-muted",
} as const;

/** Agent roster row class hooks (shared with AgentListPanel) */
export const WL_FLEET_CLASSES = {
  agentRow: "wl-agents-row touch-press",
  agentRowActive: "wl-agents-row--active",
  agentRowList: "wl-agents-row--list",
  agentAvatar: "wl-agents-avatar",
  agentAvatarActive: "wl-agents-avatar--active",
} as const;

/** Mobile drawer section labels */
/** Dense list / channel metadata – 10px floor (see index.css wl-micro-*) */
export const WL_MICRO_CLASSES = {
  label: "wl-label",
  labelMuted: "wl-label-muted",
  meta: "wl-micro-meta",
  metaMuted: "wl-micro-meta--muted",
  badge: "wl-micro-badge",
} as const;

export const WL_CHROME_CLASSES = {
  drawerSection: "wl-drawer-section-label",
  railItemActive: "wl-rail-item--active",
  railFooterActive: "wl-rail-footer--active",
  inverseHover: "chrome-inverse-hover hover:bg-white/10",
  paper: "chrome-paper",
  paperFaint: "chrome-paper-faint",
  wordmark: "brand-wordmark chrome-wordmark",
} as const;

/** Channel inbox + list table class hooks (phone, email, SMS). */
export const WL_CHANNEL_CLASSES = {
  inboxGrid:
    "wl-channel-inbox-grid h-full min-h-[360px] grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_1fr] xl:grid-cols-[minmax(340px,380px)_1fr] 2xl:grid-cols-[minmax(380px,440px)_1fr]",
  inboxList:
    "min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border wl-panel rounded-none lg:rounded-l-md",
  inboxListHeader:
    "shrink-0 px-3 py-2 border-b border-white/6 flex items-center justify-between gap-2",
  inboxDetail: "min-h-0 flex flex-col bg-white/[0.02] lg:rounded-r-md",
  listColHeader:
    "hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem] gap-2 px-3 py-2 border-b border-white/6 bg-black/[0.02]",
  threadRow:
    "w-full text-left rounded-md p-3 border border-border bg-white/[0.04] transition-all hover:border-brand/25 touch-press",
  threadRowActive: "bg-brand/8 border-brand/30",
} as const;

/** Insights tab groups – Performance / Quality / Revenue */
export const OPS_INSIGHTS_GROUPS = [
  {
    id: "performance",
    label: "Performance",
    tabs: ["funnel", "calls", "goals", "heatmap", "leaderboard"] as const,
  },
  {
    id: "reliability",
    label: "Reliability",
    tabs: ["reliability"] as const,
  },
  {
    id: "quality",
    label: "Quality",
    tabs: ["failures", "latency"] as const,
  },
  {
    id: "revenue",
    label: "Revenue",
    tabs: ["attribution", "topics", "spend"] as const,
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

/** Audit severity legend – mirrors DNC compliance chip vocabulary */
export const OPS_AUDIT_SEVERITY = {
  info: { label: "Info", hint: "Routine operations" },
  warning: { label: "Warning", hint: "Review recommended" },
  error: { label: "Error", hint: "Failed or blocked action" },
  critical: { label: "Critical", hint: "Immediate attention" },
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
  leaderboard: {
    title: "No Ranked Bots",
    actions: [
      { label: "Create Bot", to: "/studio", primary: true },
      { label: "Call History", to: "/phone?tab=logs" },
    ],
  },
  latency: {
    title: "No Latency Samples",
    actions: [
      { label: "Workspace", to: "/studio", primary: true },
      { label: "Call History", to: "/phone?tab=logs" },
    ],
  },
  reliability: {
    title: "No Reliability Samples",
    actions: [
      { label: "Workspace", to: "/studio", primary: true },
      { label: "Call History", to: "/phone?tab=logs" },
    ],
  },
  spend: {
    title: "No AI Usage",
    actions: [
      { label: "Workspace", to: "/studio", primary: true },
      { label: "Calls", to: "/phone" },
    ],
  },
  attribution: {
    title: "No Tagged Calls",
    actions: [
      { label: "Call Setup", to: "/phone?tab=setup", primary: true },
      { label: "Reviewed Calls", to: "/phone?tab=outbound" },
    ],
  },
  quality: {
    title: "No QA Scores",
    actions: [
      { label: "Call History", to: "/phone?tab=logs" },
      { label: "Workspace", to: "/studio" },
    ],
  },
  heatmap: {
    title: "No Call Activity",
    actions: [
      { label: "Call History", to: "/phone?tab=logs", primary: true },
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
  failureModesOk: {
    title: "No Failure Clusters",
    actions: [{ label: "Calls", to: "/phone?tab=logs", primary: true }],
  },
} as const;
