/**
 * Wireline Live Ops — instrument-grade design contract.
 * Copy + class hooks for Command Center, floor, and setup nudges.
 */

import { WIRELINE_DIRECTOR_BRAND } from "./wireline-director-design";
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

/** Sentiment chart — signal only for positive; brand purple neutral; rose negative */
export const OPS_SENTIMENT_COLORS = {
  positive: WIRELINE_DIRECTOR_BRAND.signal,
  neutral: BRAND.purple,
  negative: BRAND.rose,
} as const;

export const OPS_PULSE_METRICS = {
  live: { label: "Live callers", mono: true },
  pending: { label: "Pending actions", mono: true },
  fleet: { label: "Fleet agents", mono: true },
  escalations: { label: "Escalations", mono: true },
} as const;

export const OPS_COPY = {
  floorQuiet: "Floor is quiet — active conversations appear here.",
  floorLoading: "Loading live floor",
  floorTitle: (n: number) => (n === 0 ? "Live floor" : `${n} live caller${n === 1 ? "" : "s"}`),
  intelHub: "Action queue",
  intelEmpty: "All clear — no operator approvals waiting.",
  telemetryTitle: "Fleet pulse",
  telemetryActive: "Streaming",
  growthTitle: "Autonomous prospecting",
  growthBody: "Queue a prospecting run when your fleet is deployed.",
  growthCta: "Queue prospecting",
  growthCtaBusy: "Queuing…",
  growthDeployFirst: "Deploy an agent first",
  analyticsSection: "Fleet analytics",
  sentimentEmptyTitle: "No conversations yet",
  sentimentEmptyHint: "Run a test call to populate sentiment.",
  roiLabel: "Fleet efficiency",
  setupEyebrow: "Fleet setup",
  setupBody: (done: number, total: number) =>
    `${done} of ${total} complete — agent, knowledge, number, and first useful call.`,
  setupHint: "Activation = one real phone conversation, not browser test alone.",
  testCallNumber: "(630) 642-5661",
  testCallHref: "tel:+16306425661",
} as const;

/** Channel & ops empty states — one copy source for route-level CTAs */
export const OPS_CHANNEL_EMPTY = {
  floor: {
    eyebrow: "Live floor",
    title: "No active callers",
    description: "Active conversations stream here in real time — listen in, coach, or escalate.",
    actions: [
      { label: "View call history", to: "/phone" },
      { label: "Coach in chat", to: "/chat", primary: true },
    ],
  },
  fleetRail: {
    eyebrow: "Fleet",
    title: "No agents deployed",
    description: "Deploy an agent to see availability and assignments on the live floor.",
    actions: [{ label: "Deploy agent", to: "/agents", primary: true }],
  },
  fleetAgents: {
    eyebrow: "Fleet",
    title: "No agents yet",
    description:
      "Create your first AI agent below — it will answer calls, book appointments, and follow up for you.",
  },
  agentRecall: {
    eyebrow: "Recall",
    title: "No calls yet",
    description:
      "Once this agent takes calls, conversation summaries appear here as recall context.",
  },
  agentDockCalls: {
    eyebrow: "Latest calls",
    title: "No calls yet",
    description: "When this agent starts taking calls, the latest outcomes show here.",
  },
  phone: {
    eyebrow: "Call history",
    title: "No calls yet",
    description:
      "When your agents handle calls, transcripts and analytics appear here. Wire a number in Settings to go live.",
    actions: [
      { label: "Wire a number", to: "/admin", primary: true },
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
      "Conversations land here when an agent sends a text or a customer replies. Configure your sender in Settings, then run outbound.",
    actions: [
      { label: "Configure SMS sender", to: "/admin?tab=carrier", primary: true },
      { label: "Start outbound", to: "/phone?tab=outbound" },
    ],
  },
  email: {
    eyebrow: "Email",
    title: "No threads yet",
    description:
      "Connect Gmail, Outlook, or Yahoo in Integrations so agents can triage and reply from caller moments.",
    actions: [
      { label: "Connect email", to: "/integrations", primary: true },
      { label: "Ask Director", to: "/chat" },
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
      "Track outbound leads from Cold → Won. Upload a CSV in Outbound or capture leads from inbound calls.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Connect integrations", to: "/integrations" },
    ],
  },
  training: {
    eyebrow: "Training",
    title: "No agents to train yet",
    description:
      "Create your first agent in Chat or Fleet, then return here for knowledge, voice, and flow.",
    actions: [
      { label: "Go to chat", to: "/chat", primary: true },
      { label: "Open fleet", to: "/agents" },
    ],
  },
  integrations: {
    eyebrow: "Email carriers",
    title: "No carriers linked",
    description:
      "Connect Gmail, Outlook, or Yahoo — agents triage and reply from caller moments below.",
  },
  audit: {
    eyebrow: "Audit",
    title: "Audit trail is quiet",
    description:
      "Every agent action, escalation, and policy check writes here. Deploy an agent to start the feed.",
    actions: [
      { label: "Deploy an agent", to: "/agents", primary: true },
      { label: "Open Live Ops", to: "/ops" },
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
      "No operator approvals waiting. Autonomous actions land here when agents need your sign-off.",
    actions: [
      { label: "Open live floor", to: "/ops?tab=floor", primary: true },
      { label: "Coach in chat", to: "/chat" },
    ],
  },
  sentiment: {
    eyebrow: "Fleet analytics",
    title: "No conversations yet",
    description: "Run a test call to populate sentiment and unit economics.",
    actions: [{ label: "Call test line", to: "tel:+16306425661", primary: true }],
  },
  campaigns: {
    eyebrow: "Campaigns",
    title: "No campaigns yet",
    description:
      "Group outbound lists into campaigns — track dials, connects, and outcomes in one place.",
    actions: [
      { label: "Create campaign", to: "/phone?tab=outbound", primary: true },
      { label: "Import leads", to: "/pipeline" },
    ],
  },
  outboundQueue: {
    eyebrow: "Outbound queue",
    title: "Queue is idle",
    description:
      "Upload a CSV of contacts and your agent will dial through them with full call notes saved to the CRM.",
  },
  campaignLeads: {
    eyebrow: "Campaign leads",
    title: "No leads in campaign",
    description:
      "Upload a CSV from Dispatch (Bulk mode) and assign this campaign — leads land here.",
  },
  callbacks: {
    eyebrow: "Callbacks",
    title: "No scheduled callbacks",
    description:
      "When agents use the schedule_callback tool during a call, those contacts appear here and are auto-dialed at the promised time.",
  },
  cadences: {
    eyebrow: "Sequences",
    title: "No sequences yet",
    description:
      "Define call → SMS → email steps with delays. Enroll leads from Pipeline or the API — the job worker runs each step automatically.",
  },
  appointmentsUpcoming: {
    eyebrow: "Appointments",
    title: "No active commitments",
    description: "Book manually or let agents schedule during calls.",
  },
  appointmentsHistory: {
    eyebrow: "History",
    title: "No completed appointments yet",
    description: "Completed and cancelled commitments appear here for follow-up.",
  },
  contactNotFound: {
    eyebrow: "Contact",
    title: "Contact not found",
    description: "This number may have been merged, removed, or never synced to your fleet.",
    actions: [{ label: "Back to pipeline", to: "/pipeline", primary: true }],
  },
  contactTimeline: {
    eyebrow: "Timeline",
    title: "No interactions yet",
    description: "Calls and appointments with this contact appear here once agents engage.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "View call history", to: "/phone" },
    ],
  },
} as const;

/** Dense training / fleet editor panel empties (nested sections, not route-level) */
export const OPS_TRAINING_PANEL = {
  rules: "No rules yet — add one below to set hard limits your agent always respects.",
  directives: "No directives yet — add tactical constraints below.",
  facts: "No facts yet — add knowledge entries below.",
  pronunciation: "No rules yet. Add a row below.",
  knowledge: {
    eyebrow: "Knowledge base",
    title: "No entries yet",
    description:
      "Upload a PDF, paste a policy, or add a FAQ below so this agent answers consistently.",
  },
} as const;

/** Triage panel accent rails — brand-only (no orphan hex in routes) */
export const OPS_TRIAGE_ACCENTS = {
  hotLeads: BRAND.purpleMuted,
  openTasks: BRAND.purple,
  escalations: BRAND.rose,
  compliance: BRAND.rose,
  knowledgeGaps: BRAND.purple,
} as const;

/** Triage panel empty states — Live Ops `?tab=triage` widget columns */
export const OPS_TRIAGE_EMPTY = {
  hotLeads: {
    eyebrow: "Hot leads",
    title: "No hot leads yet",
    description: "High-intent callers surface here after outbound dials or inbound conversations.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Monitor floor", to: "/ops?tab=floor" },
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
    description: "No operator approvals waiting in the queue.",
    actions: [{ label: "View action queue", to: "/ops?tab=intel" }],
  },
  knowledgeGaps: {
    eyebrow: "Knowledge gaps",
    title: "Coverage looks solid",
    description: "Repeated stump questions will appear here so you can teach agents fast.",
    actions: [{ label: "Open training", to: "/training" }],
  },
  escalations: {
    eyebrow: "Escalations",
    title: "No escalations",
    description: "Supervisor handoffs and urgent calls will land here.",
    actions: [{ label: "Live floor", to: "/ops?tab=floor" }],
  },
} as const;

/** Triage page-level copy — toolbar + all-clear banner */
export const OPS_TRIAGE_COPY = {
  allClearStat: "All clear",
  allClearBannerTitle: "Nothing needs attention",
  allClearBannerBody:
    "Tasks, compliance flags, and escalations will surface here as your fleet runs. Hot leads are worked autonomously by your agents.",
  allClearBannerCta: "Monitor live floor",
  /** Slim hot-lead signal strip — replaces the old full-height Hot Leads panel. */
  hotStripLabel: (n: number) => `${n} hot lead${n === 1 ? "" : "s"}`,
  hotStripHint: "Agents are following up autonomously",
  hotStripCta: "Brief Director",
  hotStripPrompt: (n: number) =>
    `Brief me on my ${n} hottest lead${n === 1 ? "" : "s"} right now — who they are, why they're hot, and what the fleet is doing to close them.`,
  escalationCoachPrompt: (number: string, summary: string) =>
    `Coach me through the escalated call from ${number}. Context: ${summary.slice(0, 400)}`,
} as const;

/**
 * Training "Director assists" — replaces the old recipe pop-out modals with
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
      "Clone this agent's persona into a new agent — keep the voice and tone, and summarize what carries over.",
  },
  {
    label: "Ingest a URL",
    prompt: "Ingest this URL into the agent's knowledge base: ",
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
  eyebrow: "Director assists",
  hint: "Runs in Director chat",
} as const;

/** Deep-link into Director chat with an agent focused and the composer prefilled. */
export function directorAssistHref(agentId: string, prompt: string): string {
  return `/chat?agent=${encodeURIComponent(agentId)}&prompt=${encodeURIComponent(prompt)}`;
}

/** Deep-link into Director chat with only a prefilled prompt. */
export function directorPromptHref(prompt: string): string {
  return `/chat?prompt=${encodeURIComponent(prompt)}`;
}

/** In-app help route — quick paths + page chrome */
export const OPS_HELP = {
  title: "Help & demos",
  eyebrow: "Support",
  subtitle: "Team lines, demos, and shortcuts back into Wireline.",
  stat: (live: number, demos: number) =>
    `${live} live line${live === 1 ? "" : "s"} · ${demos} demo${demos === 1 ? "" : "s"}`,
  quickLinks: [
    { label: "Director · Chat", to: "/chat", hint: "Deploy agents & ask questions" },
    { label: "Integrations", to: "/integrations", hint: "Gmail, Outlook, Yahoo" },
    { label: "Training", to: "/training", hint: "Knowledge, voice, flows" },
    { label: "System status", to: "/status", hint: "Public uptime feed" },
  ],
} as const;

/** Channel toolbar copy — ClientToolbar left labels + loading states */
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
    loading: "Syncing live ops",
    floor: (n: number) => `${n} live caller${n === 1 ? "" : "s"}`,
    intel: (n: number) => `${n} pending action${n === 1 ? "" : "s"}`,
    analytics: "Fleet analytics",
    triage: (n: number) => OPS_CHANNEL_TOOLBAR.triage.stat(n),
  },
  insights: {
    stat: (days: number) => `${days}-day window`,
    export: "Export CSV",
  },
  training: {
    loading: "Loading training",
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
      total > 0 ? `${queued} queued · ${total} leads` : "Queue idle",
    export: "Export",
  },
  cadences: {
    loading: "Loading sequences",
  },
  contact: {
    loading: "Loading contact",
    stat: (events: number) => `${events} event${events === 1 ? "" : "s"}`,
  },
  fleet: {
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

/** Admin hub — settings tabs, panel padding, save footers */
export const OPS_ADMIN = {
  loading: "Loading settings",
  saving: "Saving…",
  tabLabels: {
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
  helpCard: "wl-help-agent-card",
} as const;

/** Founder command surface copy */
export const OPS_FOUNDER = {
  loading: "Loading staff",
  stat: (n: number) => `${n} staff agent${n === 1 ? "" : "s"}`,
  broadcastPlaceholder: "e.g. From today, always confirm the caller's email by spelling it back.",
  broadcastSend: "Send to all 6",
} as const;

/** KPI / metric tiles — founder dashboard, ops summaries */
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

/** Fleet / founder roster row class hooks (shared with AgentListPanel) */
export const WL_FLEET_CLASSES = {
  agentRow: "wl-fleet-agent-row touch-press",
  agentRowActive: "wl-fleet-agent-row--active",
  agentRowList: "wl-fleet-agent-row--list",
  agentAvatar: "wl-fleet-agent-avatar",
  agentAvatarActive: "wl-fleet-agent-avatar--active",
} as const;

/** Mobile drawer section labels */
/** Dense list / channel metadata — 10px floor (see index.css wl-micro-*) */
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
    "wl-channel-inbox-grid h-full min-h-[360px] grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_1fr]",
  inboxList:
    "min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border wl-panel rounded-none lg:rounded-l-md",
  inboxListHeader:
    "shrink-0 px-3 py-2 border-b border-black/6 flex items-center justify-between gap-2",
  inboxDetail: "min-h-0 flex flex-col bg-white/[0.02] lg:rounded-r-md",
  listColHeader:
    "hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_4.5rem] gap-2 px-3 py-2 border-b border-black/6 bg-black/[0.02]",
  threadRow:
    "w-full text-left rounded-md p-3 border border-border bg-paper/40 transition-all hover:border-brand/25 touch-press",
  threadRowActive: "bg-brand/8 border-brand/30",
} as const;

/** Insights tab groups — Performance / Quality / Revenue */
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

/** Compliance & admin empty states */
export const OPS_SUPPORT_EMPTY = {
  dnc: {
    eyebrow: "Do-Not-Call",
    title: "No numbers blocked",
    description:
      "Add numbers manually or import a CSV to prevent them from being dialed by any agent.",
  },
  dncNoMatch: {
    eyebrow: "Do-Not-Call",
    title: "No matches",
    description: "Try a different search term or clear the filter.",
  },
  auditCompliance:
    "Audit events are retained for compliance review. Export CSV for external archival or regulator requests.",
} as const;

/** Audit severity legend — mirrors DNC compliance chip vocabulary */
export const OPS_AUDIT_SEVERITY = {
  info: { label: "Info", hint: "Routine operations" },
  warning: { label: "Warning", hint: "Review recommended" },
  error: { label: "Error", hint: "Failed or blocked action" },
  critical: { label: "Critical", hint: "Immediate attention" },
} as const;

/** Insights tab empty states — data-driven panels with route CTAs */
export const OPS_INSIGHTS_EMPTY = {
  funnel: {
    eyebrow: "Conversion",
    title: "No funnel data yet",
    description: "Your funnel populates as agents handle calls — try a test call or outbound dial.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Live Ops", to: "/ops" },
    ],
  },
  leaderboard: {
    eyebrow: "Leaderboard",
    title: "No ranked agents yet",
    description: "Agents appear here once they run calls in the selected window.",
    actions: [
      { label: "Deploy agent", to: "/agents", primary: true },
      { label: "View call history", to: "/phone" },
    ],
  },
  latency: {
    eyebrow: "Voice latency",
    title: "No latency samples yet",
    description: "Run live calls to populate TTFT, tool timing, and voice health metrics.",
    actions: [
      { label: "Live Ops", to: "/ops", primary: true },
      { label: "Call history", to: "/phone" },
    ],
  },
  reliability: {
    eyebrow: "Voice reliability",
    title: "No reliability samples yet",
    description:
      "Run production calls to populate latency, hangups, tool-call success, escalations, webhook health, and COGS/min.",
    actions: [
      { label: "Live Ops", to: "/ops", primary: true },
      { label: "Call history", to: "/phone" },
    ],
  },
  spend: {
    eyebrow: "AI spend",
    title: "No AI usage in this window",
    description:
      "Try a longer date range, or run Director recipes and live calls to accumulate usage.",
    actions: [
      { label: "Ask Director", to: "/chat", primary: true },
      { label: "Live Ops", to: "/ops" },
    ],
  },
  attribution: {
    eyebrow: "Campaign attribution",
    title: "No tagged calls yet",
    description:
      "Tag phone numbers with a campaign label in Admin → Carrier. Every call to that number gets the tag and shows up here.",
    actions: [
      { label: "Open Admin → Carrier", to: "/admin?tab=carrier", primary: true },
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
      { label: "Live Ops", to: "/ops" },
    ],
  },
  topics: {
    eyebrow: "Topics",
    title: "Not enough call data",
    description: "Topic clusters need analyzed conversations. Run calls, then refresh this tab.",
    actions: [
      { label: "View call history", to: "/phone", primary: true },
      { label: "Open training", to: "/training" },
    ],
  },
  failureModesOk: {
    eyebrow: "Failure modes",
    title: "No failure clusters",
    description: "When agents stumble, patterns cluster here with recommended fixes.",
    actions: [{ label: "Monitor floor", to: "/ops", primary: true }],
  },
} as const;
