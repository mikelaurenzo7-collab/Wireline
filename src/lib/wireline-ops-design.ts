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
} as const;
