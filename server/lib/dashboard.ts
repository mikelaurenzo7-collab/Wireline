const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const safeRatio = (value: number, total: number) => (total > 0 ? value / total : 0);

export interface DashboardBriefingInput {
  totalCalls: number;
  totalAppointments: number;
  hotLeadCount: number;
  pendingTasks: number;
  openEmailThreads: number;
  activeAgents: number;
  voiceAgents: number;
  emailAgents: number;
  signalsLast24h: number;
  inboundCount: number;
  outboundCount: number;
}

export interface DashboardBriefingAction {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "watch" | "critical";
}

export interface DashboardBriefing {
  score: number;
  status: "locked-in" | "watch" | "action-needed";
  headline: string;
  summary: string;
  nextMove: string;
  actions: DashboardBriefingAction[];
}

export function buildDashboardBriefing(input: DashboardBriefingInput): DashboardBriefing {
  const conversionRate = safeRatio(input.totalAppointments, input.totalCalls);
  const hotLeadDensity = safeRatio(input.hotLeadCount, input.totalCalls || 1);
  const queueLoad = input.pendingTasks + input.openEmailThreads;
  const workloadPerAgent = safeRatio(queueLoad, input.activeAgents || 1);
  const hasOmnichannelCoverage = input.voiceAgents > 0 && input.emailAgents > 0;
  const hasTrafficBalance =
    input.totalCalls > 0 &&
    safeRatio(input.inboundCount, input.totalCalls) >= 0.3 &&
    safeRatio(input.outboundCount, input.totalCalls) >= 0.2;

  const score = clamp(
    Math.round(
      50 +
        conversionRate * 24 +
        hotLeadDensity * 18 +
        (hasOmnichannelCoverage ? 10 : input.activeAgents > 0 ? 4 : -12) +
        (hasTrafficBalance ? 6 : input.totalCalls > 0 ? 2 : 0) -
        workloadPerAgent * 7
    ),
    0,
    100
  );

  let status: DashboardBriefing["status"] = "watch";
  let headline = "Keep the relay balanced";
  let summary = "Coverage is healthy, but the queue still needs an operator-level sweep.";

  if (input.activeAgents === 0) {
    status = "action-needed";
    headline = "Deploy your first fleet node";
    summary = "The command center is online, but no agents are currently available to absorb work.";
  } else if (score >= 76 && input.pendingTasks <= 2) {
    status = "locked-in";
    headline = "Fleet momentum is compounding";
    summary =
      "Signal volume, channel coverage, and lead heat are aligned for fast follow-up without backlog drag.";
  } else if (score <= 54 || input.pendingTasks >= 6 || workloadPerAgent >= 6) {
    status = "action-needed";
    headline = "Queue pressure is slowing conversions";
    summary =
      "Backlog or limited channel coverage is starting to dilute response speed on your hottest opportunities.";
  }

  const nextMove =
    input.pendingTasks > 0
      ? `Resolve ${pluralize(input.pendingTasks, "pending handoff")} before the next sync cycle.`
      : input.hotLeadCount > 0
        ? `Prioritize the ${pluralize(input.hotLeadCount, "high-intent lead")} surfaced in the intelligence feed.`
        : input.signalsLast24h > 0
          ? `Turn the last 24 hours of traffic into follow-up tasks while the context is fresh.`
          : "Start a test relay to generate fresh signal data and validate the active agent path.";

  const queueTone: DashboardBriefingAction["tone"] =
    input.pendingTasks >= 6 || input.openEmailThreads >= 10
      ? "critical"
      : input.pendingTasks >= 2 || input.openEmailThreads >= 4
        ? "watch"
        : "positive";

  const coverageTone: DashboardBriefingAction["tone"] =
    hasOmnichannelCoverage ? "positive" : input.activeAgents > 0 ? "watch" : "critical";

  const leadTone: DashboardBriefingAction["tone"] =
    input.hotLeadCount >= 3 ? "positive" : input.signalsLast24h > 0 ? "watch" : "critical";

  return {
    score,
    status,
    headline,
    summary,
    nextMove,
    actions: [
      {
        label: "Coverage",
        value: `${pluralize(input.voiceAgents, "voice agent")} · ${pluralize(input.emailAgents, "email agent")}`,
        detail: hasOmnichannelCoverage
          ? "Voice and inbox channels are both staffed."
          : "Add channel diversity to reduce missed handoffs.",
        tone: coverageTone,
      },
      {
        label: "Queue pressure",
        value: `${pluralize(input.pendingTasks, "pending handoff")} · ${pluralize(input.openEmailThreads, "open thread")}`,
        detail:
          queueTone === "positive"
            ? "Operators can move fast without backlog friction."
            : "Clear unresolved work to protect response speed.",
        tone: queueTone,
      },
      {
        label: "Lead heat",
        value: `${pluralize(input.hotLeadCount, "hot lead")} · ${pluralize(input.signalsLast24h, "signal")} / 24h`,
        detail:
          leadTone === "critical"
            ? "The relay needs fresh activity to surface stronger intent."
            : "Use current activity to create fast follow-up plays.",
        tone: leadTone,
      },
    ],
  };
}
