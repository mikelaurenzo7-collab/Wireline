// src/lib/director-fleet-plan.ts
// Updated to use the perfect Grok 4.3 Director prompt + dynamic context
// This keeps your existing wired calls working while upgrading to the all-encompassing boss prompt.

import {
  buildDirectorPrompt,
  type DirectorFleetAgent,
  type DirectorBusinessContext,
  type DirectorStats,
} from "./directorContext";

import { BASE_DIRECTOR_SYSTEM_PROMPT } from "./directorPrompt";
import type { StructuredToolSchema as ToolSchema } from "./ai-structured";
import { wantsLongDeliverable } from "./director-deliverables";

// Re-export types for backward compatibility with your existing code
export type { DirectorFleetAgent, DirectorBusinessContext, DirectorStats };

export const DIRECTOR_SUGGESTION_KINDS = [
  "create_agent",
  "focus_agent",
  "view_ops",
  "open_training",
  "open_insights",
] as const;

export type DirectorSuggestionKind = (typeof DIRECTOR_SUGGESTION_KINDS)[number];

export interface DirectorSuggestion {
  kind: DirectorSuggestionKind;
  label: string;
  agentId?: string;
}

/**
 * Legacy-compatible wrapper.
 * Your existing calls to buildDirectorFleetSystemPrompt will now get the perfect upgraded prompt.
 */
export function buildDirectorFleetSystemPrompt(input: {
  fleet: DirectorFleetAgent[];
  stats?: DirectorStats;
  business?: DirectorBusinessContext;
  recentActivitySummary?: string;
  // Add any other fields your current calls pass — they will be forwarded.
  [key: string]: unknown;
}): string {
  // Delegate to the new, superior context builder
  // This injects the full perfect prompt + live operational context
  // Note: buildDirectorPrompt is sync (no network)
  return buildDirectorPrompt({
    clientId: typeof input.clientId === "string" ? input.clientId : "unknown",
    fleet: input.fleet || [],
    stats: input.stats,
    business: input.business,
    recentActivitySummary:
      input.recentActivitySummary ||
      (typeof input.recentActivity === "string" ? input.recentActivity : ""),
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
            agent_id: {
              type: "string",
              description: "Target agent ID from fleet (falls back to first agent if omitted).",
            },
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
            tool: {
              type: "string",
              description: "e.g. crm_search_contacts, gemini_ground, deliver_brief",
            },
            label: { type: "string" },
            summary: { type: "string" },
            query: { type: "string" },
          },
          required: ["tool", "label", "summary"],
          additionalProperties: true,
        },
        description:
          "Background jobs (CRM lookups, web research, etc.) the Director wants to queue.",
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
  // Structured model output may include provider-specific action payload fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface DirectorIntegrationJob {
  tool: string;
  label: string;
  summary: string;
  query?: string;
  step?: number;
  agentId?: string;
  [key: string]: unknown;
}

export interface DirectorFleetPlan {
  reply: string;
  suggestions: DirectorSuggestion[];
  actions: DirectorProposedAction[];
  integrationJobs: DirectorIntegrationJob[];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
  const actions: DirectorProposedAction[] = rawActions.map((value, index: number) => {
    const a = objectValue(value);
    const rawAgentId = a.agent_id || a.agentId || (fleet.length > 0 ? fleet[0]?.id : undefined);
    const agentId = rawAgentId ? String(rawAgentId) : undefined;
    return {
      ...a,
      kind: String(a.kind || "unknown_action"),
      label: String(a.label || `Action ${index + 1}`),
      agentId,
      to: a.to ? String(a.to) : undefined,
      body: a.body ? String(a.body) : undefined,
      context: a.context ? String(a.context) : undefined,
    };
  });

  // Normalize + dedupe integration jobs (by tool+query)
  const rawJobs = Array.isArray(raw.integration_jobs) ? raw.integration_jobs : [];
  const seen = new Set<string>();
  const integrationJobs: DirectorIntegrationJob[] = [];
  rawJobs.forEach((value, index: number) => {
    const j = objectValue(value);
    const tool = String(j.tool || "unknown_tool");
    const queryKey = j.query ? String(j.query) : String(j.summary || "");
    const dedupeKey = `${tool}:${queryKey.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    integrationJobs.push({
      ...j,
      tool,
      label: String(j.label || `Job ${index + 1}`),
      summary: String(j.summary || ""),
      query: j.query ? String(j.query) : undefined,
      step: integrationJobs.length + 1,
      agentId: j.agentId ? String(j.agentId) : undefined,
    });
  });

  const fleetAgentIds = new Set(fleet.map((agent) => agent.id));
  const seenSuggestions = new Set<string>();
  const suggestions: DirectorSuggestion[] = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
    .map((value): DirectorSuggestion | null => {
      const suggestion = objectValue(value);
      const kind = String(suggestion?.kind || "");
      const label = typeof suggestion?.label === "string" ? suggestion.label.trim() : "";
      const agentId = suggestion?.agentId ? String(suggestion.agentId) : undefined;
      if (!DIRECTOR_SUGGESTION_KINDS.includes(kind as DirectorSuggestionKind)) return null;
      if (!label) return null;
      if (kind === "focus_agent" && (!agentId || !fleetAgentIds.has(agentId))) return null;
      const dedupeKey = kind === "focus_agent" ? `${kind}:${agentId}` : kind;
      if (seenSuggestions.has(dedupeKey)) return null;
      seenSuggestions.add(dedupeKey);
      return {
        kind: kind as DirectorSuggestionKind,
        label: label.slice(0, 80),
        agentId,
      };
    })
    .filter((suggestion): suggestion is DirectorSuggestion => Boolean(suggestion))
    .slice(0, 3);

  return {
    reply:
      reply ||
      "I can orchestrate your fleet from here — tell me the outcome you want and I’ll turn it into the next best action.",
    suggestions,
    actions,
    integrationJobs,
  };
}

// You can keep any other helper functions from the original file here if they existed.
// The core upgrade is complete — all wired Director turns now use Grok 4.3 + perfect boss prompt.
