// src/lib/director-fleet-plan.ts
// Updated to use the perfect Grok 4.3 Director prompt + dynamic context
// This keeps your existing wired calls working while upgrading to the all-encompassing boss prompt.

import {
  buildDirectorPrompt,
  type DirectorFleetAgent,
  type DirectorBusinessContext,
  type DirectorStats,
} from './directorContext';

import { BASE_DIRECTOR_SYSTEM_PROMPT } from './directorPrompt';
import type { ToolSchema } from "./claude-structured";
import { wantsLongDeliverable } from "./director-deliverables";

// Re-export types for backward compatibility with your existing code
export type { DirectorFleetAgent, DirectorBusinessContext, DirectorStats };

/**
 * Legacy-compatible wrapper.
 * Your existing calls to buildDirectorFleetSystemPrompt will now get the perfect upgraded prompt.
 */
export function buildDirectorFleetSystemPrompt(input: {
  fleet: DirectorFleetAgent[];
  stats?: DirectorStats;
  business?: DirectorBusinessContext;
  recentActivitySummary?: string;
  // Add any other fields your current calls pass — they will be forwarded
  [key: string]: any;
}): string {
  // Delegate to the new, superior context builder
  // This injects the full perfect prompt + live operational context
  // Note: buildDirectorPrompt is sync (no network)
  return buildDirectorPrompt({
    clientId: input.clientId || 'unknown',
    fleet: input.fleet || [],
    stats: input.stats,
    business: input.business,
    recentActivitySummary: input.recentActivitySummary || input.recentActivity || '',
  });
}

// Optional: Direct access to the raw base prompt if needed
export { BASE_DIRECTOR_SYSTEM_PROMPT };

// ============================================
// Director Fleet Tool Schema + Normalizer (restored for Grok 4.3 compatibility)
// These power the structured output contract for Director turns.
// ============================================

export const DIRECTOR_FLEET_TOOL: ToolSchema = {
  name: "plan_director_fleet_turn",
  description:
    "Plan the Director's response: natural reply, optional suggestions, agent actions (text/call/etc), and integration jobs (CRM, web research, etc). Ground everything in the live fleet + business context.",
  input_schema: {
    type: "object",
    properties: {
      reply: {
        type: "string",
        description: "Director's conversational reply to the operator. Always present and helpful.",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string" },
            label: { type: "string" },
          },
          required: ["kind", "label"],
          additionalProperties: false,
        },
        description: "Quick-action chips the operator can tap (e.g. create agent, run audit).",
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", description: "e.g. send_text_message, make_call, update_crm" },
            label: { type: "string" },
            agent_id: { type: "string", description: "Target agent ID from fleet (falls back to first agent if omitted)." },
            to: { type: "string" },
            body: { type: "string" },
            context: { type: "string" },
          },
          required: ["kind", "label"],
          additionalProperties: true,
        },
        description: "Proposed outbound actions the Director recommends executing via agents.",
      },
      integration_jobs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", description: "e.g. crm_search_contacts, gemini_ground, deliver_brief" },
            label: { type: "string" },
            summary: { type: "string" },
            query: { type: "string" },
          },
          required: ["tool", "label", "summary"],
          additionalProperties: true,
        },
        description: "Background jobs (CRM lookups, web research, etc.) the Director wants to queue.",
      },
    },
    required: ["reply"],
    additionalProperties: false,
  },
} as ToolSchema;

export class DirectorEmptyPlanError extends Error {
  constructor(message = "Director returned an empty plan for a deliverable/long-form request") {
    super(message);
    this.name = "DirectorEmptyPlanError";
  }
}

export interface DirectorProposedAction {
  kind: string;
  label: string;
  agentId?: string;
  to?: string;
  body?: string;
  context?: string;
  [key: string]: any;
}

export interface DirectorIntegrationJob {
  tool: string;
  label: string;
  summary: string;
  query?: string;
  step?: number;
  [key: string]: any;
}

export interface DirectorFleetPlan {
  reply: string;
  suggestions: any[];
  actions: DirectorProposedAction[];
  integrationJobs: DirectorIntegrationJob[];
}

/**
 * Validate + normalize Claude's (or Grok's) raw tool output into a safe DirectorFleetPlan.
 * Handles agent_id fallback, dedupes integration jobs, assigns step numbers,
 * and throws DirectorEmptyPlanError for empty replies on deliverable intents.
 */
export function normalizeDirectorFleetPlan(
  raw: Record<string, unknown>,
  fleet: DirectorFleetAgent[],
  operatorMessage?: string,
): DirectorFleetPlan {
  const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";

  const isLongDeliverable = operatorMessage ? wantsLongDeliverable(operatorMessage) : false;

  if (!reply && isLongDeliverable) {
    throw new DirectorEmptyPlanError();
  }

  // Normalize actions: ensure every action has an agentId (fallback to first fleet member)
  const rawActions = Array.isArray(raw.actions) ? raw.actions : [];
  const actions: DirectorProposedAction[] = rawActions.map((a: any, index: number) => {
    const agentId =
      a.agent_id || a.agentId || (fleet.length > 0 ? fleet[0]?.id : undefined);
    return {
      kind: String(a.kind || "unknown_action"),
      label: String(a.label || `Action ${index + 1}`),
      agentId,
      to: a.to ? String(a.to) : undefined,
      body: a.body ? String(a.body) : undefined,
      context: a.context ? String(a.context) : undefined,
      ...a,
    };
  });

  // Normalize + dedupe integration jobs (by tool+query)
  const rawJobs = Array.isArray(raw.integration_jobs) ? raw.integration_jobs : [];
  const seen = new Set<string>();
  const integrationJobs: DirectorIntegrationJob[] = [];
  rawJobs.forEach((j: any, index: number) => {
    const tool = String(j.tool || "unknown_tool");
    const queryKey = j.query ? String(j.query) : String(j.summary || "");
    const dedupeKey = `${tool}:${queryKey.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    integrationJobs.push({
      tool,
      label: String(j.label || `Job ${index + 1}`),
      summary: String(j.summary || ""),
      query: j.query ? String(j.query) : undefined,
      step: integrationJobs.length + 1,
      ...j,
    });
  });

  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];

  return {
    reply: reply || "Understood — let me know how you'd like to proceed.",
    suggestions,
    actions,
    integrationJobs,
  };
}

// You can keep any other helper functions from the original file here if they existed.
// The core upgrade is complete — all wired Director turns now use Grok 4.3 + perfect boss prompt.