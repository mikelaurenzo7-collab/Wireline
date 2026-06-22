/**
 * Wireline Recaps – instrument-grade design contract.
 * Copy + class hooks for Recaps, floor, and setup nudges.
 * Palette: Ametrine Precision (see foundation.css).
 */

import { WL_BRAND } from "./wireline-design-system";
import { WL_SIGNAL_CLASSES } from "./wireline-signal-design";
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
  /** Re-export for ops panels that embed signal chrome */
  emptyStateSignal: WL_SIGNAL_CLASSES.emptyStateSignal,
  /** Insights tab section labels (mono instrument typography) */
  insightLabel: "wl-insight-label",
} as const;

/** Sentiment chart – active green positive; Ametrine primary neutral; rose negative */
export const OPS_SENTIMENT_COLORS = {
  positive: WL_BRAND.accentHex,
  neutral: BRAND.teal,
  negative: BRAND.rose,
} as const;

export const OPS_PULSE_METRICS = {
  live: { label: "Live callers", mono: true },
  pending: { label: "Pending actions", mono: true },
  Assistants: { label: "Assistants", mono: true },
  escalations: { label: "Escalations", mono: true },
} as const;

export const OPS_COPY = {
  floorQuiet: "Floor is quiet – active conversations appear here.",
  floorLoading: "Loading Active calls",
  floorTitle: (n: number) => (n === 0 ? "Active calls" : `${n} live caller${n === 1 ? "" : "s"}`),
  intelHub: "Action queue",
  intelEmpty: "All clear – no Account Holder approvals waiting.",
  telemetryTitle: "Assistant activity",
  telemetryActive: "Streaming",
  growthTitle: "Autonomous outreach",
  growthBody: "Queue an outreach run when your assistant is deployed.",
  growthCta: "Queue outreach",
  growthCtaBusy: "Queuing…",
  growthDeployFirst: "Deploy an assistant first",
  analyticsSection: "Assistant analytics",
  sentimentEmptyTitle: "No conversations yet",
  sentimentEmptyHint: "Run a test call to populate sentiment.",
  roiLabel: "Assistant efficiency",
  setupEyebrow: "Assistant setup",
  setupBody: (done: number, total: number) =>
    `${done} of ${total} complete – assistant, knowledge, number, and first useful call.`,
  setupHint: "Activation = one real phone conversation, not browser test alone.",
  testCallNumber: "(630) 642-5661",
  testCallHref: "tel:+16306425661",
} as const;

/** Channel & ops empty states – one copy source for route-level CTAs */
export const OPS_CHANNEL_EMPTY = {
  floor: {
    eyebrow: "Active calls",
    title: "No active callers",
    description: "Active conversations stream here in real time – listen in, get callbacks, or take over.",
    actions: [
      { label: "View call history", to: "/phone" },
      { label: "Chat with assistant", to: "/agents", primary: true },
    ],
  },
  fleetRail: {
    eyebrow: "Assistants",
    title: "No assistants deployed",
    description: "Deploy an assistant to see availability and assignments.",
    actions: [{ label: "Deploy assistant", to: "/agents", primary: true }],
  },
  fleetAgents: {
    eyebrow: "Assistants",
    title: "No assistants yet",
    description:
      "Create your first AI assistant below – it will answer calls, book appointments, and follow up for you.",
  },
  agentRecall: {
    eyebrow: "Recall",
    title: "No calls yet",
    description:
      "Once this assistant takes calls, conversation summaries appear here as follow-up context.",
  },
  agentDockCalls: {
    eyebrow: "Latest calls",
    title: "No calls yet",
    description: "When this assistant starts taking calls, the latest outcomes show here.",
  },
  phone: {
    eyebrow: "Call history",
    title: "No calls yet",
    description:
      "When your assistants handle calls, recaps and analytics appear here. Configure a number in Settings to go live.",
    actions: [
      { label: "Configure a number", to: "/settings", primary: true },
      { label: "Start outbound", to: "/phone?tab=outbound" },
    ],
  },
  phoneNoMatch: {
    eyebrow: "Call history",
    title: "No matching calls",
    description: "Try a different search term or switch the direction filter to All.",
  },
  sms: {
    eyebrow: "SMS",
    title: "No SMS yet",
    description:
      "Conversations land here when an assistant sends a text or a customer replies. Configure your sender in Settings, then run outbound.",
    actions: [
      { label: "Configure SMS sender", to: "/settings?tab=carrier", primary: true },
      { label: "Start outbound", to: "/phone?tab=outbound" },
    ],
  },
  email: {
    eyebrow: "Email",
    title: "No threads yet",
    description:
      "Connect Gmail, Outlook, or Yahoo in Actions so assistants can triage and reply.",
    actions: [
      { label: "Connect email", to: "/actions", primary: true },
      { label: "Ask Assistant", to: "/agents" },
    ],
  },
  inboxDetail: {
    eyebrow: "Conversation",
    title: "Select a thread",
    description: "Pick a conversation from the list to monitor or reply.",
  },
  pipeline: {
    eyebrow: "Pipeline",
    title: "No leads in the pipeline",
    description:
      "Track outbound leads. Upload a CSV in Outbound or capture leads from inbound calls.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Connect actions", to: "/actions" },
    ],
  },
  training: {
    eyebrow: "Training",
    title: "No assistants to train yet",
    description:
      "Create your first assistant in Assistants, then return here for knowledge, voice, and flow.",
    actions: [
      { label: "Open Assistants", to: "/agents", primary: true },
    ],
  },
  integrations: {
    eyebrow: "Email carriers",
    title: "No carriers linked",
    description:
      "Connect Gmail, Outlook, or Yahoo – assistants triage and reply from there.",
  },
  audit: {
    eyebrow: "Audit",
    title: "Audit trail is quiet",
    description:
      "Every assistant action, callback, and policy check writes here. Deploy an assistant to start the feed.",
    actions: [
      { label: "Deploy an assistant", to: "/agents", primary: true },
      { label: "Open Recaps", to: "/overview" },
    ],
  },
  auditNoMatch: {
    eyebrow: "Audit",
    title: "No matches",
    description: "Try a different search term or widen the time range filter.",
  },
  intel: {
    eyebrow: "Action queue",
    title: "All clear",
    description:
      "No Account Holder approvals waiting. Autonomous actions land here when assistants need your sign-off.",
    actions: [
      { label: "Open Recaps", to: "/overview", primary: true },
      { label: "Coach in chat", to: "/agents" },
    ],
  },
  sentiment: {
    eyebrow: "Assistant analytics",
    title: "No conversations yet",
    description: "Run a test call to populate sentiment and unit economics.",
    actions: [{ label: "Call test line", to: "tel:+16306425661", primary: true }],
  },
  campaigns: {
    eyebrow: "Campaigns",
    title: "No campaigns yet",
    description:
      "Group outbound lists into campaigns – track dials, connects, and outcomes in one place.",
    actions: [
      { label: "Create campaign", to: "/phone?tab=outbound", primary: true },
      { label: "Import leads", to: "/pipeline" },
    ],
  },
  outboundQueue: {
    eyebrow: "Outbound queue",
    title: "Queue is idle",
    description:
      "Upload a CSV of contacts and your assistant will dial through them with full call notes saved to the CRM.",
  },
  campaignLeads: {
    eyebrow: "Campaign leads",
    title: "No leads in campaign",
    description:
      "Upload a CSV from Dispatch (Bulk mode) and assign this campaign – leads land here.",
  },
  callbacks: {
    eyebrow: "Callbacks",
    title: "No scheduled callbacks",
    description:
      "When assistants schedule callbacks during a call, those contacts appear here and are auto-dialed.",
  },
  cadences: {
    eyebrow: "Sequences",
    title: "No sequences yet",
    description:
      "Define call – SMS – email steps with delays. Enroll leads from Pipeline or the API – the job worker runs each step automatically.",
  },
  appointmentsUpcoming: {
    eyebrow: "Appointments",
    title: "No active commitments",
    description: "Book manually or let assistants schedule during calls.",
  },
  appointmentsHistory: {
    eyebrow: "History",
    title: "No completed appointments yet",
    description: "Completed and cancelled commitments appear here for follow-up.",
  },
  contactNotFound: {
    eyebrow: "Contact",
    title: "Contact not found",
    description: "This number may have been merged, removed, or never synced to your assistant.",
    actions: [{ label: "Back to pipeline", to: "/pipeline", primary: true }],
  },
  contactTimeline: {
    eyebrow: "Timeline",
    title: "No interactions yet",
    description: "Calls and appointments with this contact appear here once assistants engage.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "View call history", to: "/phone" },
    ],
  },
} as const;

/** Dense training / Assistants editor panel empties (nested sections, not route-level) */
export const OPS_TRAINING_PANEL = {
  rules: "No rules yet – add one below to set hard limits your assistant always respects.",
  directives: "No directives yet – add tactical constraints below.",
  facts: "No facts yet – add knowledge entries below.",
  pronunciation: "No rules yet. Add a row below.",
  knowledge: {
    eyebrow: "Knowledge base",
    title: "No entries yet",
    description:
      "Upload a PDF, paste a policy, or add a FAQ below so this assistant answers consistently.",
  },
} as const;

/** Triage panel accent rails – Ametrine Purple + status tokens */
export const OPS_TRIAGE_ACCENTS = {
  hotLeads: WL_BRAND.accentHex,
  openTasks: BRAND.tealBright,
  escalations: BRAND.rose,
  compliance: BRAND.rose,
  knowledgeGaps: BRAND.teal,
} as const;

/** Triage panel empty states – Recaps `?tab=triage` widget columns */
export const OPS_TRIAGE_EMPTY = {
  hotLeads: {
    eyebrow: "Hot leads",
    title: "No hot leads yet",
    description: "High-intent callers surface here after outbound dials or inbound conversations.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Monitor floor", to: "/overview?tab=floor" },
    ],
  },
  compliance: {
    eyebrow: "Compliance",
    title: "All clear",
    description: "No DNC or policy flags need review right now.",
  },
  openTasks: {
    eyebrow: "Open tasks",
    title: "Inbox zero",
    description: "No Account Holder approvals waiting in the queue.",
    actions: [{ label: "View action queue", to: "/overview?tab=intel" }],
  },
  knowledgeGaps: {
    eyebrow: "Knowledge gaps",
    title: "Coverage looks solid",
    description: "Repeated stump questions will appear here so you can teach assistants fast.",
    actions: [{ label: "Open training", to: "/studio" }],
  },
  escalations: {
    eyebrow: "Escalations",
    title: "No escalations",
    description: "Supervisor handoffs and urgent calls will land here.",
    actions: [{ label: "Active calls", to: "/overview?tab=floor" }],
  },
} as const;

/** Triage page-level copy – toolbar + all-clear banner */
export const OPS_TRIAGE_COPY = {
  allClearStat: "All clear",
  allClearBannerTitle: "Nothing needs attention",
  allClearBannerBody:
    "Tasks, compliance flags, and escalations will surface here as your assistants run. Hot leads are worked autonomously by your assistants.",
  allClearBannerCta: "Monitor Active calls",
  /** Slim hot-lead signal strip – replaces the old full-height Hot Leads panel. */
  hotStripLabel: (n: number) => `${n} hot lead${n === 1 ? "" : "s"}`,
  hotStripHint: "Assistants are following up autonomously",
  hotStripCta: "Brief Assistant",
  hotStripPrompt: (n: number) =>
    `Brief me on my ${n} hottest lead${n === 1 ? "" : "s"} right now – who they are, why they're hot, and what the assistant is doing to close them.`,
  escalationCoachPrompt: (number: string, summary: string) =>
    `Coach me through the escalated call from ${number}. Context: ${summary.slice(0, 400)}`,
} as const;

/**
 * Training "Assistant assists" – replaces the old recipe pop-out modals with
 * deep-links that prefill Director chat (mobile-safe, no modal to fail).
 */
export const OPS_TRAINING_ASSISTS = [
  {
    label: "Performance review",
    prompt:
      "Review this assistant's recent calls and give me a performance read: wins, misses, and the top 3 coaching directives to add.",
  },
  {
    label: "Clone persona",
    prompt:
      "Clone this assistant's persona into a new assistant – keep the voice and tone, and summarize what carries over.",
  },
  {
    label: "Ingest a URL",
    prompt: "Ingest this URL into the assistant's knowledge base: ",
  },
  {
    label: "Objection drills",
    prompt:
      "Run objection drills against this assistant: throw the 5 most common objections for its vertical and grade the responses.",
  },
  {
    label: "Call playbook",
    prompt:
      "Draft a call playbook for this assistant: opening, discovery, objection handling, and close.",
  },
  {
    label: "Pre-call brief",
    prompt: "Prepare a pre-call brief for this assistant's next outbound call.",
  },
] as const;

export const OPS_TRAINING_ASSISTS_COPY = {
  eyebrow: "Assistant assists",
  hint: "Runs in Assistant chat",
} as const;

/**
 * Studio co-pilot assists – setup-oriented prompts on the assistant canvas.
 * Where Training assists review performance, these help BUILD the assistant:
 * each deep-links into Director coach mode scoped to the focused assistant,
 * where the Director proposes config changes the Account Holder approves.
 */
export const OPS_STUDIO_ASSISTS = [
  {
    label: "Write the greeting",
    prompt:
      "Write a warm, on-brand opening greeting for this assistant and propose it as the first message.",
  },
  {
    label: "Sharpen the persona",
    prompt:
      "Rewrite this assistant's personality block – keep the role, make it sharper, warmer, and more specific to my business.",
  },
  {
    label: "Set the schedule",
    prompt: "Help me set this assistant's business hours and an out-of-hours message for my timezone.",
  },
  {
    label: "Pick the right tools",
    prompt:
      "Review this assistant's enabled tools for its role and propose which to turn on or off, with one-line reasons.",
  },
  {
    label: "Prep a test call",
    prompt:
      "Give me a 60-second test-call script to verify this assistant's greeting, knowledge, and escalation handling.",
  },
 ] as const;

export const OPS_STUDIO_ASSISTS_COPY = {
  eyebrow: "Assistant co-pilot",
  hint: "Opens Assistant scoped to this assistant",
} as const;

/** Deep-link into Director chat with an assistant focused and the composer prefilled. */
export function directorAssistHref(assistantId: string, prompt: string): string {
  return `/agents?agent=${encodeURIComponent(assistantId)}&prompt=${encodeURIComponent(prompt)}`;
}

/** Deep-link into Director chat with only a prefilled prompt. */
export function directorPromptHref(prompt: string): string {
  return `/agents?prompt=${encodeURIComponent(prompt)}`;
}

/** In-app help route – quick paths + page chrome */
export const OPS_HELP = {
  title: "Help & demos",
  eyebrow: "Support",
  subtitle: "Team lines, demos, and shortcuts back into Wireline.",
  stat: (live: number, demos: number) =>
    `${live} live line${live === 1 ? "" : "s"} -+ ${demos} demo${demos === 1 ? "" : "s"}`,
  quickLinks: [
    { label: "Assistant Chat", to: "/agents", hint: "Deploy assistants & ask questions" },
    { label: "Actions", to: "/actions", hint: "Gmail, Outlook, Yahoo" },
    { label: "Studio", to: "/studio", hint: "Knowledge, voice, flows" },
    { label: "System status", to: "/status", hint: "Public uptime feed" },
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
    analytics: "Assistant analytics",
    triage: (n: number) => OPS_CHANNEL_TOOLBAR.triage.stat(n),
  },
  insights: {
    stat: (days: number) => `${days}-day window`,
    export: "Export CSV",
  },
  training: {
    loading: "Loading Studio",
    stat: (n: number) => `${n} assistant${n === 1 ? "" : "s"}`,
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
    agentsStat: (n: number) => `${n} assistant${n === 1 ? "" : "s"}`,
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
    add: "Add number",
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
    carrier: "Carrier & routing",
    subscription: "Billing",
    team: "Team access",
    flywheel: "Growth engine",
    system: "System health",
    activity: "Audit activity",
  },
  saveLabels: {
    branding: "Save branding",
    carrier: "Save carrier settings",
    carrierMessaging: "Save messaging config",
    subscription: "Save billing",
    growth: "Save growth settings",
  },
} as const;

export type OpsAdminTab = keyof typeof OPS_ADMIN.tabLabels;

export const WL_ADMIN_CLASSES = {
  panel: "wl-admin-panel",
  saveBar: "wl-admin-save-bar",
  helpCard: "wl-help-assistant-card",
} as const;

/** Founder command surface copy */
export const OPS_FOUNDER = {
  loading: "Loading staff",
  stat: (n: number) => `${n} staff assistant${n === 1 ? "" : "s"}`,
  broadcastPlaceholder: "e.g. From today, always confirm the caller's email by spelling it back.",
  broadcastSend: "Send to all 6",
} as const;

/** KPI / metric tiles – founder dashboard, recaps summaries */
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

/** Assistants roster row class hooks (shared with AgentListPanel) */
export const WL_FLEET_CLASSES = {
  agentRow: "wl-Assistants-agent-row touch-press",
  agentRowActive: "wl-Assistants-agent-row--active",
  agentRowList: "wl-Assistants-agent-row--list",
  agentAvatar: "wl-Assistants-agent-avatar",
  agentAvatarActive: "wl-Assistants-agent-avatar--active",
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
    tabs: ["funnel", "goals", "heatmap", "leaderboard"] as const,
  },
  {
    id: "reliability",
    label: "Reliability",
    tabs: ["reliability"] as const,
  },
  {
    id: "quality",
    label: "Quality",
    tabs: ["failures", "latency", "quality", "learning"] as const,
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
    eyebrow: "Do-Not-Call",
    title: "No numbers blocked",
    description:
      "Add numbers manually or import a CSV to prevent them from being dialed by any assistant.",
  },
  dncNoMatch: {
    eyebrow: "Do-Not-Call",
    title: "No matches",
    description: "Try a different search term or clear the filter.",
  },
  auditCompliance:
    "Audit events are retained for compliance review. Export CSV for external archival or regulator requests.",
} as const;

/** Audit severity legend – mirrors DNC compliance chip vocabulary */
export const OPS_AUDIT_SEVERITY = {
  info: { label: "Info", hint: "Routine operations" },
  warning: { label: "Warning", hint: "Review recommended" },
  error: { label: "Error", hint: "Failed or blocked action" },
  critical: { label: "Critical", hint: "Immediate attention" },
} as const;

/** Insights tab empty states – data-driven panels with route CTAs */
export const OPS_INSIGHTS_EMPTY = {
  funnel: {
    eyebrow: "Conversion",
    title: "No funnel data yet",
    description: "Your funnel populates as assistants handle calls – try a test call or outbound dial.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Recaps", to: "/overview" },
    ],
  },
  leaderboard: {
    eyebrow: "Leaderboard",
    title: "No ranked assistants yet",
    description: "Assistants appear here once they run calls in the selected window.",
    actions: [
      { label: "Deploy assistant", to: "/agents", primary: true },
      { label: "View call history", to: "/phone" },
    ],
  },
  latency: {
    eyebrow: "Voice latency",
    title: "No latency samples yet",
    description: "Run live calls to populate TTFT, tool timing, and voice health metrics.",
    actions: [
      { label: "Recaps", to: "/overview", primary: true },
      { label: "Call history", to: "/phone" },
    ],
  },
  reliability: {
    eyebrow: "Voice reliability",
    title: "No reliability samples yet",
    description:
      "Run production calls to populate latency, hangups, tool-call success, escalations, webhook health, and COGS/min.",
    actions: [
      { label: "Recaps", to: "/overview", primary: true },
      { label: "Call history", to: "/phone" },
    ],
  },
  spend: {
    eyebrow: "AI spend",
    title: "No AI usage in this window",
    description:
      "Try a longer date range, or run Assistant recipes and live calls to accumulate usage.",
    actions: [
      { label: "Ask Assistant", to: "/agents", primary: true },
      { label: "Recaps", to: "/overview" },
    ],
  },
  attribution: {
    eyebrow: "Campaign attribution",
    title: "No tagged calls yet",
    description:
      "Tag phone numbers with a campaign label in Settings – Carrier. Every call to that number gets the tag and shows up here.",
    actions: [
      { label: "Open Settings – Carrier", to: "/settings?tab=carrier", primary: true },
      { label: "Start outbound", to: "/phone?tab=outbound" },
    ],
  },
  quality: {
    eyebrow: "Call quality",
    title: "No QA scores yet",
    description:
      "Score an individual call in Call Logs, or batch-evaluate up to 20 unscored calls at once.",
    actions: [
      { label: "View call history", to: "/phone" },
      { label: "Recaps", to: "/overview" },
    ],
  },
  topics: {
    eyebrow: "Topics",
    title: "Not enough call data",
    description: "Topic clusters need analyzed conversations. Run calls, then refresh this tab.",
    actions: [
      { label: "View call history", to: "/phone", primary: true },
      { label: "Open training", to: "/studio" },
    ],
  },
  failureModesOk: {
    eyebrow: "Failure modes",
    title: "No failure clusters",
    description: "When assistants stumble, patterns cluster here with recommended fixes.",
    actions: [{ label: "Monitor floor", to: "/overview", primary: true }],
  },
} as const;
