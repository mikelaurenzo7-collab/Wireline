// src/lib/directorContext.ts
// Dynamic context builder for The Director (Grok 4.3)
// This is the MOST IMPORTANT file for making the Director feel like "their" boss.

import { BASE_DIRECTOR_SYSTEM_PROMPT } from "./directorPrompt";

export interface DirectorAssistantAgent {
  id: string;
  name: string | null;
  role: string | null;
  archetype?: string | null;
  status?: string | null;
  performanceSummary?: string;
  recentCalls?: number;
  conversionRate?: number;
}

export interface DirectorBusinessContext {
  industry?: string;
  icp?: string;
  stage?: string; // e.g. "growth-stage", "established", "enterprise"
  goals?: string[];
  bottlenecks?: string[];
  riskTolerance?: "low" | "medium" | "high";
  brandVoice?: string;
  keyMetrics?: string[];
  regulatoryNotes?: string;
  teamStructure?: string;
  businessName?: string | null;
  businessType?: string | null;
  primaryProduct?: string | null;
  operatingHours?: string | null;
}

export interface DirectorStats {
  calls7d?: number;
  bookings7d?: number;
  openTasks?: number;
  avgCallDuration?: number;
  conversionRate?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface BuildDirectorPromptInput {
  clientId: string;
  Assistants: DirectorAssistantAgent[];
  stats?: DirectorStats;
  business?: DirectorBusinessContext;
  recentActivitySummary?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

/**
 * Builds the complete system prompt + live context for Grok 4.3 Director.
 * Call this on every Director chat turn.
 * (Made sync for compatibility with existing Director planner calls.)
 */
export function buildDirectorPrompt(input: BuildDirectorPromptInput): string {
  const { Assistants, stats, business, recentActivitySummary } = input;

  // Assistants snapshot
  const fleetSummary =
    Assistants.length === 0
      ? "(No agents deployed yet — prioritize helping them launch their first high-impact agent. Ask what their #1 pain point is right now.)"
      : Assistants.map((agent) => {
          const name = agent.name || "Unnamed agent";
          const role = agent.role || "generalist";
          const archetype = agent.archetype || "agent";
          const status = agent.status || "unknown";
          return `- ${name} (${role}, ${archetype}): status=${status}${agent.performanceSummary ? `, perf=${agent.performanceSummary}` : ""}${agent.recentCalls ? `, calls=${agent.recentCalls}` : ""}${agent.conversionRate ? `, conv=${agent.conversionRate}%` : ""}`;
        }).join("\n");

  // Stats block
  const statsBlock = stats
    ? `
**Key Metrics (last 7 days)**
- Calls made: ${stats.calls7d || 0}
- Bookings / Demos: ${stats.bookings7d || 0}
- Open tasks / triage items: ${stats.openTasks || 0}
- Avg call duration: ${stats.avgCallDuration || "N/A"}
- Overall conversion rate: ${stats.conversionRate ? `${stats.conversionRate}%` : "N/A"}
`
    : "";

  // Business context block (CRITICAL for tailoring)
  const businessBlock = business
    ? `
**Business Context (Tailor EVERY response to this)**
- Industry: ${business.industry || business.businessType || "Not specified"}
- Ideal Customer Profile (ICP): ${business.icp || "Not specified"}
- Business stage: ${business.stage || "Not specified"}
- Top goals right now: ${business.goals?.join(", ") || "Not specified"}
- Current bottlenecks: ${business.bottlenecks?.join(", ") || "Not specified"}
- Risk tolerance: ${business.riskTolerance || "Not specified"}
- Brand voice: ${business.brandVoice || "Not specified"}
- Success metrics that matter most to them: ${business.keyMetrics?.join(", ") || "Revenue, efficiency, control"}
${business.regulatoryNotes ? `- Regulatory / compliance notes: ${business.regulatoryNotes}` : ""}
${business.teamStructure ? `- Current team structure: ${business.teamStructure}` : ""}
`
    : "";

  // Recent activity
  const activityBlock = recentActivitySummary
    ? `
**Recent Activity Summary (last 7-14 days)**
${recentActivitySummary}
`
    : "";

  // Assemble the full prompt
  const fullPrompt = `${BASE_DIRECTOR_SYSTEM_PROMPT}

## LIVE OPERATIONAL CONTEXT (This is ground truth — use it for every decision)
### Assistants Snapshot
${fleetSummary}

${statsBlock}
${businessBlock}
${activityBlock}

Account Holder's latest message follows. Respond as The Director — their all-encompassing boss who knows their business inside out.`;

  return fullPrompt;
}
