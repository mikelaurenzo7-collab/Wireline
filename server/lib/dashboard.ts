const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const safeRatio = (value: number, total: number) => (total > 0 ? value / total : 0);

export interface DashboardAgentLike {
  channel?: string | null;
}

export interface DashboardChannelCounts {
  activeAgents: number;
  voiceAgents: number;
  emailAgents: number;
}

export function isVoiceCapableAgent(agent: DashboardAgentLike) {
  return agent.channel === "voice" || agent.channel === "omnichannel";
}

export function isEmailCapableAgent(agent: DashboardAgentLike) {
  return agent.channel === "email" || agent.channel === "omnichannel";
}

export function getDashboardChannelCounts(agents: DashboardAgentLike[]): DashboardChannelCounts {
  return {
    activeAgents: agents.length,
    voiceAgents: agents.filter(isVoiceCapableAgent).length,
    emailAgents: agents.filter(isEmailCapableAgent).length,
  };
}

export function formatConversionRate(totalAppointments: number, totalCalls: number) {
  return totalCalls > 0 ? ((totalAppointments / totalCalls) * 100).toFixed(1) : "0.0";
}

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

export interface DashboardPlaybookItem {
  priority: "critical" | "growth" | "optimize";
  title: string;
  directive: string;
  metric: string;
  route: string;
  cta: string;
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

export function buildFounderPlaybook(input: DashboardBriefingInput): DashboardPlaybookItem[] {
  const playbook: DashboardPlaybookItem[] = [];
  const hasVoice = input.voiceAgents > 0;
  const hasEmail = input.emailAgents > 0;
  const conversionRate = safeRatio(input.totalAppointments, input.totalCalls);

  if (input.activeAgents === 0) {
    playbook.push({
      priority: "critical",
      title: "Deploy the first revenue node",
      directive:
        "Create one voice agent with a crisp first message, then run a test relay to prove the acquisition loop.",
      metric: "0 active agents",
      route: "/agents",
      cta: "Deploy agent",
    });
  } else if (!hasVoice || !hasEmail) {
    playbook.push({
      priority: "growth",
      title: "Close the channel gap",
      directive:
        "Add the missing channel so every hot call can become an inbox follow-up and every email can become a callback.",
      metric: `${pluralize(input.voiceAgents, "voice node")} · ${pluralize(input.emailAgents, "email node")}`,
      route: "/agents",
      cta: "Balance fleet",
    });
  }

  if (input.pendingTasks >= 3) {
    playbook.push({
      priority: "critical",
      title: "Crush handoff latency",
      directive:
        "Clear the oldest pending handoffs first, then turn repeat task patterns into training directives.",
      metric: pluralize(input.pendingTasks, "pending handoff"),
      route: "/",
      cta: "Open queue",
    });
  }

  if (input.hotLeadCount >= 3) {
    playbook.push({
      priority: "growth",
      title: "Exploit the heat window",
      directive:
        "Work the highest-intent leads while context is fresh; every minute saved here compounds conversion odds.",
      metric: pluralize(input.hotLeadCount, "high-intent lead"),
      route: "/logs",
      cta: "Review signals",
    });
  } else if (input.signalsLast24h === 0) {
    playbook.push({
      priority: "optimize",
      title: "Generate fresh market signal",
      directive:
        "Use the test relay or outbound batch to create new conversations and validate the live agent path.",
      metric: "0 signals / 24h",
      route: "/outbound",
      cta: "Launch batch",
    });
  }

  if (input.openEmailThreads >= 5) {
    playbook.push({
      priority: "critical",
      title: "Turn inbox pressure into booked intent",
      directive:
        "Process open threads by lead score, then dispatch callbacks for the highest-friction conversations.",
      metric: pluralize(input.openEmailThreads, "open thread"),
      route: "/inbox",
      cta: "Clear inbox",
    });
  }

  if (input.totalCalls >= 10 && conversionRate < 0.15) {
    playbook.push({
      priority: "optimize",
      title: "Sharpen the conversion script",
      directive:
        "Review recent transcripts for objections and add two precise directives to improve booking behavior.",
      metric: `${Math.round(conversionRate * 100)}% fulfillment`,
      route: "/train",
      cta: "Tune training",
    });
  }

  if (playbook.length === 0) {
    playbook.push({
      priority: "optimize",
      title: "Compound what is working",
      directive:
        "The fleet is stable. Add one stronger directive, one fresh lead batch, and one callback experiment.",
      metric: "System balanced",
      route: "/train",
      cta: "Improve playbook",
    });
  }

  return playbook.slice(0, 4);
}
