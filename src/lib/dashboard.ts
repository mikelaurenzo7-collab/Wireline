export interface DashboardAgentSummary {
  id: string;
  name: string;
  channel: string;
}

export function isVoiceCapableAgent(agent: DashboardAgentSummary) {
  return agent.channel === "voice" || agent.channel === "omnichannel";
}

export function selectVoiceCapableAgent(agents: DashboardAgentSummary[]) {
  return agents.find(isVoiceCapableAgent);
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

export interface DashboardStatsResponse {
  totalAppointments: number;
  scheduledAppointments: number;
  totalLeads: number;
  totalCalls: number;
  totalMinutes: number;
  totalCost: string;
  inboundCount: number;
  outboundCount: number;
  conversionRate: string;
  recentLogs: Array<{
    id?: string | number;
    created_at: string;
    customer_number?: string;
    direction?: string;
    duration_seconds?: number;
    summary?: string;
  }>;
  hotLeads: Array<{
    id: string | number;
    type: "call" | "email";
    contact: string;
    score: number;
    intent: string;
    summary: string;
    date: string;
  }>;
  hotLeadCount: number;
  activeAgents: number;
  voiceAgents: number;
  emailAgents: number;
  pendingTasks: number;
  openEmailThreads: number;
  signalsLast24h: number;
  agents: DashboardAgentSummary[];
  briefing: DashboardBriefing;
  playbook: DashboardPlaybookItem[];
}
