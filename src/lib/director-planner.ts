/**
 * Director Planner — the account-level "manager" brain behind the always-on
 * Director chat.
 *
 * The Director is distinct from the per-agent workspace planner:
 *   - It's account-level (one thread per Account Holder), not bound to a single agent.
 *   - It's available from the very first login, BEFORE any agents exist, so it
 *     doubles as the guided-setup concierge ("what should my first agent do?").
 *   - It coaches agents when the Account Holder selects one in the Coach menu.
 *     Config / capability / action proposals flow through approval cards in
 *     this same thread — no separate per-agent chat surface.
 *
 * Model strategy (hybrid, cost-aware):
 *   - Normal turns run on Sonnet — high-frequency, latency-sensitive, cheap.
 *   - Heavy deliverables (business plan, competitor research) may auto-escalate
 *     to Opus without adaptive thinking.
 *   - Adaptive thinking (Deep analysis) runs only when the Account Holder toggles Deep.
 */
import { runStructuredWithThinking } from "./ai-structured";
import {
  STRUCTURED_DIRECTOR_DEEP_MODEL,
  STRUCTURED_RUNTIME_MODELS,
} from "./structured-runtime-models";
import {
  DIRECTOR_FLEET_TOOL,
  buildDirectorAssistantSystemPrompt,
  normalizeDirectorAssistantPlan,
  type DirectorBusinessContext,
  type DirectorAssistantAgent,
  type DirectorAssistantPlan,
} from "./director-Assistants-plan";
import { formatDirectorIntegrationPrompt } from "./director-integration-prompt";
import { loadTenantIntegrationConnections } from "./tenant-integration-connections";
import {
  buildAssistantAuditGuidance,
  resolveDirectorMaxTokens,
  wantsAssistantAudit,
  wantsLongDeliverable,
  wantsOpusModel,
} from "./director-deep-analysis";
import { buildDirectorDeliverableGuidance } from "./director-deliverables";
export {
  wantsDeepAnalysis,
  wantsAssistantAudit,
  wantsLongDeliverable,
  wantsOpusModel,
} from "./director-deep-analysis";
import {
  appendResearchToUserPrompt,
  fetchDirectorResearchContext,
  type DirectorResearchSource,
} from "./director-web-research";

export type {
  DirectorBusinessContext,
  DirectorIntegrationJob,
  DirectorProposedAction,
} from "./director-Assistants-plan";

export {
  DIRECTOR_SUGGESTION_KINDS,
  type DirectorSuggestionKind,
  type DirectorSuggestion,
  type DirectorAssistantAgent,
} from "./director-Assistants-plan";

export interface DirectorPlan extends DirectorAssistantPlan {
  /** Which model tier handled this turn (for UI/telemetry). */
  model: "sonnet" | "opus";
  /** Claude's adaptive thinking reasoning (only present on deep-analysis turns). */
  reasoning?: string;
  /** Approximate thinking duration in ms (for UI badge). */
  thinkingDurationMs?: number;
  /** Sources from auto web research when injected into this turn. */
  researchSources?: DirectorResearchSource[];
}

export interface PlanDirectorInput {
  forceDeep?: boolean;
  /** Skip Opus/deep heuristics (used when retrying after a deep-turn failure). */
  shallowOnly?: boolean;
  userId: string;
  userMessage: string;
  history: Array<{ role: "Account Holder" | "director"; content: string }>;
  Assistants: DirectorAssistantAgent[];
  /** Aggregate activity context across the whole Assistants (last 7d). */
  stats?: {
    calls7d?: number;
    bookings7d?: number;
    openTasks?: number;
  };
  business?: DirectorBusinessContext;
}

const DIRECTOR_TOOL = DIRECTOR_FLEET_TOOL;

function buildSystemPrompt(
  input: PlanDirectorInput,
  deep: boolean,
  integrationPrompt?: string,
): string {
  const fleetAudit = wantsAssistantAudit(input.userMessage);
  return buildDirectorAssistantSystemPrompt({
    Assistants: input.Assistants,
    stats: input.stats,
    business: input.business,
    deep,
    integrationPrompt,
    deliverableGuidance:
      fleetAudit && !input.forceDeep
        ? buildAssistantAuditGuidance()
        : buildDirectorDeliverableGuidance(input.userMessage),
  });
}

function buildUserContent(input: PlanDirectorInput, researchBlock?: string): string {
  const transcript = input.history
    .slice(-12)
    .map(
      (m) => `${m.role === "Account Holder" ? "Account Holder" : "You (Director)"}: ${m.content}`,
    )
    .join("\n");
  const prefix = transcript ? `Conversation so far:\n${transcript}\n\n` : "";
  const base = `${prefix}Account Holder's new message:\n${input.userMessage}`;
  return appendResearchToUserPrompt(base, researchBlock);
}

interface RawDirectorReply extends Record<string, unknown> {
  reply?: unknown;
  suggestions?: unknown;
  actions?: unknown;
  integration_jobs?: unknown;
}

/**
 * Validate + normalize Claude's raw tool output into a safe DirectorPlan.
 */
export function normalizeDirectorPlan(
  raw: RawDirectorReply,
  Assistants: DirectorAssistantAgent[],
  model: "sonnet" | "opus",
  userMessage?: string,
): DirectorPlan {
  const fleetPlan = normalizeDirectorAssistantPlan(raw, Assistants, userMessage);
  return { ...fleetPlan, model };
}

/**
 * Plan one Director turn. Sonnet by default; escalates to Opus + adaptive
 * thinking when the Account Holder toggles Deep analysis (`forceDeep`). Throws if the
 * model layer is unavailable — the caller decides the fallback copy.
 */
export async function planDirector(input: PlanDirectorInput): Promise<DirectorPlan> {
  const fleetAudit = !input.shallowOnly && wantsAssistantAudit(input.userMessage);
  const deepThink = !input.shallowOnly && input.forceDeep === true;
  const useOpus =
    !input.shallowOnly &&
    (input.forceDeep === true || (!fleetAudit && wantsOpusModel(input.userMessage)));
  const longDeliverable = wantsLongDeliverable(input.userMessage);
  const model = useOpus ? STRUCTURED_DIRECTOR_DEEP_MODEL : STRUCTURED_RUNTIME_MODELS.STANDARD;
  const [connections, research] = await Promise.all([
    loadTenantIntegrationConnections(input.userId),
    fleetAudit
      ? Promise.resolve(null)
      : fetchDirectorResearchContext({
          userMessage: input.userMessage,
          history: input.history,
        }),
  ]);
  const integrationPrompt = formatDirectorIntegrationPrompt(connections);
  const {
    result: raw,
    thinking,
    thinkingDurationMs,
  } = await runStructuredWithThinking<RawDirectorReply>({
    system: buildSystemPrompt(input, deepThink || useOpus, integrationPrompt),
    user: buildUserContent(input, research?.block),
    tool: DIRECTOR_TOOL,
    model,
    deepThink,
    maxTokens: resolveDirectorMaxTokens({
      opus: useOpus,
      longDeliverable,
      fleetAudit: fleetAudit && !input.forceDeep,
    }),
  });
  const plan = normalizeDirectorPlan(
    raw,
    input.Assistants,
    useOpus ? "opus" : "sonnet",
    input.userMessage,
  );
  return {
    ...plan,
    reasoning: thinking,
    thinkingDurationMs,
    researchSources: research?.sources,
  };
}
