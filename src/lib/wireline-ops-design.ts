/**
 * Wireline Live Ops — instrument-grade design contract.
 * Copy + class hooks for Command Center, floor, and setup nudges.
 */

import { WIRELINE_DIRECTOR_BRAND } from "./wireline-director-design";
import { BRAND } from "../constants/brand-colors";

export const WL_OPS_CLASSES = {
  canvas: "wl-ops-canvas",
  pulseStrip: "wl-ops-pulse-strip",
  metric: "wl-ops-metric",
  metricValue: "wl-ops-metric-value",
  metricLabel: "wl-ops-metric-label",
  floorFrame: "wl-ops-floor-frame",
  callCard: "wl-ops-call-card",
  callCardEscalated: "wl-ops-call-card wl-ops-call-card--escalated",
  railCard: "wl-ops-rail-card",
  scoreBadge: "wl-ops-score-badge",
  setupNudge: "wl-setup-nudge",
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
  floorTitle: (n: number) =>
    n === 0 ? "No live callers" : `${n} live caller${n === 1 ? "" : "s"}`,
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
    `${done} of ${total} complete — agent, knowledge, number, and test call.`,
  setupHint: "Finish in Chat, then monitor the floor here.",
  testCallNumber: "(630) 642-5661",
  testCallHref: "tel:+16306425661",
} as const;

/** Channel & ops empty states — one copy source for route-level CTAs */
export const OPS_CHANNEL_EMPTY = {
  floor: {
    eyebrow: "Live floor",
    title: "No live callers",
    description: "Active conversations stream here in real time — listen in, coach, or escalate.",
    actions: [
      { label: "View call history", to: "/phone" },
      { label: "Coach in Chat", to: "/chat", primary: true },
    ],
  },
  fleetRail: {
    eyebrow: "Fleet",
    title: "No agents deployed",
    description: "Deploy an agent to see availability and assignments on the live floor.",
    actions: [{ label: "Deploy agent", to: "/agents", primary: true }],
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
      { label: "Go to Chat", to: "/chat", primary: true },
      { label: "Open Fleet", to: "/agents" },
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

/** Triage panel empty states — `/triage` widget columns */
export const OPS_TRIAGE_EMPTY = {
  hotLeads: {
    eyebrow: "Hot leads",
    title: "No hot leads yet",
    description: "High-intent callers surface here after outbound dials or inbound conversations.",
    actions: [
      { label: "Start outbound", to: "/phone?tab=outbound", primary: true },
      { label: "Monitor floor", to: "/ops" },
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
    actions: [{ label: "Live floor", to: "/ops" }],
  },
} as const;

/** In-app help route — quick paths + page chrome */
export const OPS_HELP = {
  title: "Help & demos",
  eyebrow: "Support",
  subtitle: "Live team lines, role-play demos, and quick paths back into the product.",
  quickLinks: [
    { label: "Director · Chat", to: "/chat", hint: "Deploy agents & ask questions" },
    { label: "Integrations", to: "/integrations", hint: "Gmail, Outlook, Yahoo" },
    { label: "Training", to: "/training", hint: "Knowledge, voice, flows" },
    { label: "System status", to: "/status", hint: "Public uptime feed" },
  ],
} as const;

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
