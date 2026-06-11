// src/lib/directorContext.ts
// Dynamic context builder for The Director (Grok 4.3)
// This is the MOST IMPORTANT file for making the Director feel like "their" boss.

import { BASE_DIRECTOR_SYSTEM_PROMPT } from './directorPrompt';

export interface DirectorFleetAgent {
  id: string;
  name: string;
  role: string;
  archetype: string;
  status: string;
  performanceSummary?: string;
  recentCalls?: number;
  conversionRate?: number;
}

export interface DirectorBusinessContext {
  industry: string;
  icp: string;
  stage: string; // e.g. "growth-stage", "established", "enterprise"
  goals: string[];
  bottlenecks: string[];
  riskTolerance: 'low' | 'medium' | 'high';
  brandVoice: string;
  keyMetrics: string[];
  regulatoryNotes?: string;
  teamStructure?: string;
}

export interface DirectorStats {
  calls7d?: number;
  bookings7d?: number;
  openTasks?: number;
  avgCallDuration?: number;
  conversionRate?: number;
  [key: string]: any;
}

export interface BuildDirectorPromptInput {
  clientId: string;
  fleet: DirectorFleetAgent[];
  stats?: DirectorStats;
  business?: DirectorBusinessContext;
  recentActivitySummary?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

/**
 * Builds the complete system prompt + live context for Grok 4.3 Director.
 * Call this on every Director chat turn.
 */
export async function buildDirectorPrompt(input: BuildDirectorPromptInput): Promise<string> {
  const { fleet, stats, business, recentActivitySummary } = input;

  // Fleet snapshot
  const fleetSummary = fleet.length === 0
    ? "(No agents deployed yet — prioritize helping them launch their first high-impact agent. Ask what their #1 pain point is right now.)"
    : fleet.map(a => 
        `- ${a.name} (${a.role}, ${a.archetype}): status=${a.status}${a.performanceSummary ? `, perf=${a.performanceSummary}` : ''}${a.recentCalls ? `, calls=${a.recentCalls}` : ''}${a.conversionRate ? `, conv=${a.conversionRate}%` : ''}`
      ).join("\n");

  // Stats block
  const statsBlock = stats ? `
**Key Metrics (last 7 days)**
- Calls made: ${stats.calls7d || 0}
- Bookings / Demos: ${stats.bookings7d || 0}
- Open tasks / triage items: ${stats.openTasks || 0}
- Avg call duration: ${stats.avgCallDuration || 'N/A'}
- Overall conversion rate: ${stats.conversionRate ? `${stats.conversionRate}%` : 'N/A'}
` : "";

  // Business context block (CRITICAL for tailoring)
  const businessBlock = business ? `
**Business Context (Tailor EVERY response to this)**
- Industry: ${business.industry}
- Ideal Customer Profile (ICP): ${business.icp}
- Business stage: ${business.stage}
- Top goals right now: ${business.goals?.join(', ') || 'Not specified'}
- Current bottlenecks: ${business.bottlenecks?.join(', ') || 'Not specified'}
- Risk tolerance: ${business.riskTolerance}
- Brand voice: ${business.brandVoice}
- Success metrics that matter most to them: ${business.keyMetrics?.join(', ') || 'Revenue, efficiency, control'}
${business.regulatoryNotes ? `- Regulatory / compliance notes: ${business.regulatoryNotes}` : ''}
${business.teamStructure ? `- Current team structure: ${business.teamStructure}` : ''}
` : "";

  // Recent activity
  const activityBlock = recentActivitySummary ? `
**Recent Activity Summary (last 7-14 days)**
${recentActivitySummary}
` : "";

  // Assemble the full prompt
  const fullPrompt = `${BASE_DIRECTOR_SYSTEM_PROMPT}

## LIVE OPERATIONAL CONTEXT (This is ground truth — use it for every decision)
### Fleet Snapshot
${fleetSummary}

${statsBlock}
${businessBlock}
${activityBlock}

Operator's latest message follows. Respond as The Director — their all-encompassing boss who knows their business inside out.`;

  return fullPrompt;
}
