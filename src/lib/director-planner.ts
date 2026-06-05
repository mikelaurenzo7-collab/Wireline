/**
 * Director Planner — the account-level "manager" brain behind the always-on
 * Director chat.
 *
 * The Director is distinct from the per-agent workspace planner:
 *   - It's account-level (one thread per operator), not bound to a single agent.
 *   - It's available from the very first login, BEFORE any agents exist, so it
 *     doubles as the guided-setup concierge ("what should my first agent do?").
 *   - It coaches agents when the operator selects one in the Coach menu.
 *     Config / capability / action proposals flow through approval cards in
 *     this same thread — no separate per-agent chat surface.
 *
 * Model strategy (hybrid, cost-aware):
 *   - Normal turns run on Sonnet — high-frequency, latency-sensitive, cheap.
 *   - When the operator asks for genuinely heavy strategic work ("audit my
 *     whole fleet", "analyze everything and build a plan"), we escalate to
 *     Opus with adaptive thinking. Detected by `wantsDeepAnalysis()`.
 */
import { runStructuredWithThinking } from "./claude-structured";
import { CLAUDE_MODELS } from "./claude-models";
import {
  DIRECTOR_FLEET_TOOL,
  buildDirectorFleetSystemPrompt,
  normalizeDirectorFleetPlan,
  type DirectorBusinessContext,
  type DirectorFleetAgent,
  type DirectorFleetPlan,
} from "./director-fleet-plan";
import { formatDirectorIntegrationPrompt } from "./director-integration-prompt";
import { loadTenantIntegrationConnections } from "./tenant-integration-connections";
import {
  appendResearchToUserPrompt,
  fetchDirectorResearchContext,
  type DirectorResearchSource,
} from "./director-web-research";

export type {
  DirectorBusinessContext,
  DirectorIntegrationJob,
  DirectorProposedAction,
} from "./director-fleet-plan";

export {
  DIRECTOR_SUGGESTION_KINDS,
  type DirectorSuggestionKind,
  type DirectorSuggestion,
  type DirectorFleetAgent,
} from "./director-fleet-plan";

export interface DirectorPlan extends DirectorFleetPlan {
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
  userId: string;
  operatorMessage: string;
  history: Array<{ role: "operator" | "director"; content: string }>;
  fleet: DirectorFleetAgent[];
  /** Aggregate activity context across the whole fleet (last 7d). */
  stats?: {
    calls7d?: number;
    bookings7d?: number;
    openTasks?: number;
  };
  business?: DirectorBusinessContext;
}

/**
 * Heuristic: does this turn warrant the (pricier, slower, smarter) Opus tier?
 * Triggers on explicit requests for deep, cross-fleet strategic analysis.
 */
export function wantsDeepAnalysis(message: string): boolean {
  return /\b(audit|deep[\s-]?dive|analy[sz]e (everything|all|the (whole|entire))|review (everything|all|the (whole|entire))|full (review|analysis|audit)|strateg(y|ize|ise|ic plan)|optimi[sz]e (everything|all|the (whole|entire))|benchmark)\b/i.test(
    message,
  );
}

const DIRECTOR_TOOL = DIRECTOR_FLEET_TOOL;

function buildSystemPrompt(
  input: PlanDirectorInput,
  deep: boolean,
  integrationPrompt?: string,
): string {
  return buildDirectorFleetSystemPrompt({
    fleet: input.fleet,
    stats: input.stats,
    business: input.business,
    deep,
    integrationPrompt,
  });
}

function buildUserContent(input: PlanDirectorInput, researchBlock?: string): string {
  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === "operator" ? "Operator" : "You (Director)"}: ${m.content}`)
    .join("\n");
  const prefix = transcript ? `Conversation so far:\n${transcript}\n\n` : "";
  const base = `${prefix}Operator's new message:\n${input.operatorMessage}`;
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
  fleet: DirectorFleetAgent[],
  model: "sonnet" | "opus",
): DirectorPlan {
  const fleetPlan = normalizeDirectorFleetPlan(raw, fleet);
  return { ...fleetPlan, model };
}

/**
 * Plan one Director turn. Sonnet by default; escalates to Opus + adaptive
 * thinking when the operator asks for deep strategic analysis. Throws if the
 * model layer is unavailable — the caller decides the fallback copy.
 */
export async function planDirector(input: PlanDirectorInput): Promise<DirectorPlan> {
  const deep = input.forceDeep === true || wantsDeepAnalysis(input.operatorMessage);
  const model = deep ? CLAUDE_MODELS.OPUS : CLAUDE_MODELS.SONNET;
  const connections = await loadTenantIntegrationConnections(input.userId);
  const integrationPrompt = formatDirectorIntegrationPrompt(connections);
  const research = await fetchDirectorResearchContext({
    operatorMessage: input.operatorMessage,
    history: input.history,
  });
  const {
    result: raw,
    thinking,
    thinkingDurationMs,
  } = await runStructuredWithThinking<RawDirectorReply>({
    system: buildSystemPrompt(input, deep, integrationPrompt),
    user: buildUserContent(input, research?.block),
    tool: DIRECTOR_TOOL,
    model,
    deepThink: deep,
    maxTokens: deep ? 4000 : 2800,
  });
  const plan = normalizeDirectorPlan(raw, input.fleet, deep ? "opus" : "sonnet");
  return {
    ...plan,
    reasoning: thinking,
    thinkingDurationMs,
    researchSources: research?.sources,
  };
}
