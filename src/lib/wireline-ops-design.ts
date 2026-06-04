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
} as const;
