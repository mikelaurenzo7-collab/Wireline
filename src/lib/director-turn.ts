/**
 * Director turn orchestration — one chat surface for fleet strategy AND
 * per-agent coaching. When the operator selects an agent in the Director
 * UI, turns route through the workspace planner (config / tools / actions).
 * Otherwise the fleet-level Director planner handles strategy + creative work.
 */
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import {
  planDirector,
  type DirectorFleetAgent,
  type DirectorSuggestion,
  type DirectorBusinessContext,
} from "./director-planner";
import type { DirectorIntegrationJob, DirectorProposedAction } from "./director-fleet-plan";
import {
  buildDirectorFleetSystemPrompt,
  DirectorEmptyPlanError,
  DIRECTOR_FLEET_TOOL,
  normalizeDirectorFleetPlan,
} from "./director-fleet-plan";
import { formatDirectorIntegrationPrompt } from "./director-integration-prompt";
import { loadTenantIntegrationConnections } from "./tenant-integration-connections";
import {
  normalizePlan,
  planWorkspace,
  buildWorkspaceStreamContext,
  type ProposedChange,
  type ProposedToolToggle,
  type WorkspacePlan,
} from "./workspace-planner";
import type { ToolSchema } from "./claude-structured";
import { CLAUDE_DIRECTOR_MODEL, CLAUDE_MODELS } from "./claude-models";
import {
  DEFAULT_DIRECTOR_MODEL_SELECTION,
  resolveDirectorLlm,
  type DirectorChatModelSelection,
} from "./director-model-selection";
import { directorStreamMetaModel } from "./director-model-policy";
import { labelForOpenRouterModel } from "./openrouter-models";
import { runDirectorTurnLlm } from "./director-stream-runner";
import {
  buildFleetAuditGuidance,
  resolveDirectorMaxTokens,
  wantsFleetAudit,
  wantsLongDeliverable,
  wantsOpusModel,
} from "./director-deep-analysis";
import { buildDirectorDeliverableGuidance } from "./director-deliverables";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import {
  appendResearchToUserPrompt,
  fetchDirectorResearchContext,
  wantsDirectorWebResearch,
  type DirectorResearchSource,
} from "./director-web-research";

export interface DirectorTurnResult {
  mode: "fleet" | "coach";
  reply: string;
  focusAgentId?: string;
  focusAgentName?: string;
  suggestions: DirectorSuggestion[];
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: DirectorProposedAction[];
  integrationJobs: DirectorIntegrationJob[];
  model: "sonnet" | "opus";
  modelLabel?: string;
  modelProvider?: "wireline" | "openrouter";
  modelId?: string;
  reasoning?: string;
  thinkingDurationMs?: number;
  researchSources?: DirectorResearchSource[];
}

export interface DirectorTurnInput {
  operatorMessage: string;
  history: Array<{ role: "operator" | "director"; content: string }>;
  fleet: DirectorFleetAgent[];
  stats?: { calls7d?: number; bookings7d?: number; openTasks?: number };
  focusAgentId?: string;
  userId: string;
  business?: DirectorBusinessContext;
  /** Fleet mode only — forces Opus + extended thinking (also auto-detected from phrasing). */
  forceDeep?: boolean;
  /** Skip Opus/deep heuristics (retry path after stream/deep failures). */
  shallowOnly?: boolean;
  /** Per-user Director chat model (Wireline tiers or OpenRouter id). */
  modelSelection?: DirectorChatModelSelection;
  /** Override deliverable system guidance (e.g. Stitch → Claude design fallback). */
  deliverableGuidance?: string;
  /** Stitch failed — force Opus for the HTML prototype fallback (not adaptive thinking). */
  designRenderFallback?: boolean;
}

async function loadBusinessContext(userId: string): Promise<DirectorBusinessContext | undefined> {
  const [row] = await drizzle
    .select({
      businessName: schema.settings.businessName,
      brandName: schema.settings.brandName,
      businessType: schema.settings.businessType,
      primaryProduct: schema.settings.primaryProduct,
      businessHours: schema.settings.businessHours,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  if (!row) return undefined;
  return {
    businessName: row.businessName ?? row.brandName,
    businessType: row.businessType,
    primaryProduct: row.primaryProduct,
    operatingHours:
      typeof row.businessHours === "string"
        ? row.businessHours
        : row.businessHours != null
          ? JSON.stringify(row.businessHours)
          : null,
  };
}

const AGENT_SELECT = {
  id: schema.agents.id,
  name: schema.agents.name,
  role: schema.agents.role,
  archetype: schema.agents.archetype,
  personalityVibe: schema.agents.personalityVibe,
  firstMessage: schema.agents.firstMessage,
  emailAgentTone: schema.agents.emailAgentTone,
  emailSignature: schema.agents.emailSignature,
  outOfHoursMessage: schema.agents.outOfHoursMessage,
  transferPhone: schema.agents.transferPhone,
  escalationEmail: schema.agents.escalationEmail,
  escalationPhone: schema.agents.escalationPhone,
  enabledTools: schema.agents.enabledTools,
};

async function loadCoachContext(userId: string, agentId: string) {
  const [agent] = await drizzle
    .select(AGENT_SELECT)
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  if (!agent) return null;

  const recentCalls = await drizzle
    .select({
      summary: schema.callLogs.summary,
      sentiment: schema.callLogs.sentiment,
      intent: schema.callLogs.intentLabel,
    })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.agentId, agentId), eq(schema.callLogs.userId, userId)))
    .orderBy(desc(schema.callLogs.createdAt))
    .limit(5);

  return { agent, recentCalls };
}

function mapDirectorHistoryToWorkspace(
  history: DirectorTurnInput["history"],
): Array<{ role: "operator" | "agent"; content: string }> {
  return history.map((m) => ({
    role: m.role === "operator" ? ("operator" as const) : ("agent" as const),
    content: m.content,
  }));
}

function workspaceToTurnResult(
  plan: WorkspacePlan,
  focusAgentId: string,
  focusAgentName: string | null,
  researchSources?: DirectorResearchSource[],
): DirectorTurnResult {
  return {
    mode: "coach",
    reply: plan.reply,
    focusAgentId,
    focusAgentName: focusAgentName || undefined,
    suggestions: [],
    changes: plan.changes,
    toolToggles: plan.toolToggles,
    actions: plan.actions.map((a) => ({ ...a, agentId: focusAgentId })),
    integrationJobs: plan.integrationJobs,
    model: "sonnet",
    reasoning: plan.reasoning,
    thinkingDurationMs: plan.thinkingDurationMs,
    researchSources,
  };
}

export function usesDirectorStructuredLlm(
  input: DirectorTurnInput,
  selection: DirectorChatModelSelection = input.modelSelection ?? DEFAULT_DIRECTOR_MODEL_SELECTION,
): boolean {
  if (selection.provider === "openrouter") return true;
  if (!input.focusAgentId?.trim()) return true;
  return false;
}

async function runDirectorStructuredTurn(input: DirectorTurnInput): Promise<DirectorTurnResult> {
  const streamCtx = await buildDirectorStreamContext(input);
  const { result, thinking, thinkingDurationMs } =
    await runDirectorTurnLlm<Record<string, unknown>>(streamCtx);
  const normalized = streamCtx.normalize(result);
  return {
    ...normalized,
    reasoning: thinking,
    thinkingDurationMs,
    researchSources: streamCtx.researchSources,
  };
}

export async function planDirectorTurn(input: DirectorTurnInput): Promise<DirectorTurnResult> {
  const business = input.business ?? (await loadBusinessContext(input.userId));
  const focusId = input.focusAgentId?.trim();

  if (usesDirectorStructuredLlm(input)) {
    return runDirectorStructuredTurn(input);
  }

  if (focusId) {
    const ctx = await loadCoachContext(input.userId, focusId);
    if (!ctx) {
      const fleetPlan = await planDirector({
        userId: input.userId,
        operatorMessage: input.operatorMessage,
        history: input.history,
        fleet: input.fleet,
        stats: input.stats,
        business,
        forceDeep: input.forceDeep,
        shallowOnly: input.shallowOnly,
      });
      return {
        mode: "fleet",
        reply:
          "That agent wasn't found — it may have been removed. Pick another agent from the coach menu, or ask me about your fleet.",
        suggestions: [{ kind: "create_agent", label: "Manage agents" }],
        changes: [],
        toolToggles: [],
        actions: [],
        integrationJobs: [],
        model: fleetPlan.model,
        reasoning: fleetPlan.reasoning,
        thinkingDurationMs: fleetPlan.thinkingDurationMs,
      };
    }

    const research = await fetchDirectorResearchContext({
      operatorMessage: input.operatorMessage,
      history: input.history,
    });

    const plan = await planWorkspace({
      operatorMessage: input.operatorMessage,
      history: mapDirectorHistoryToWorkspace(input.history),
      agent: ctx.agent,
      recentCalls: ctx.recentCalls,
      coachAsDirector: true,
      integrationPrompt: formatDirectorIntegrationPrompt(
        await loadTenantIntegrationConnections(input.userId),
      ),
      researchBlock: research?.block,
    });
    return workspaceToTurnResult(plan, focusId, ctx.agent.name, research?.sources);
  }

  throw new Error("Director turn routing invariant violated");
}

/** Non-stream + stream fallback — retries without Opus/deep thinking if the first call fails. */
export async function planDirectorTurnResilient(
  input: DirectorTurnInput,
): Promise<DirectorTurnResult> {
  const selection = input.modelSelection ?? DEFAULT_DIRECTOR_MODEL_SELECTION;
  const tryOpusRetry =
    selection.provider === "wireline" &&
    !input.focusAgentId?.trim() &&
    selection.tier === "auto" &&
    (input.forceDeep === true || wantsOpusModel(input.operatorMessage));
  const tryOpusFallback =
    selection.provider === "wireline" && selection.tier === "opus" && !input.shallowOnly;
  try {
    return await planDirectorTurn(input);
  } catch (e) {
    if (e instanceof DirectorEmptyPlanError && wantsLongDeliverable(input.operatorMessage)) {
      log.warn("director empty deliverable plan — retrying on sonnet", {
        userId: input.userId,
      });
      return await planDirectorTurn({
        ...input,
        modelSelection:
          input.modelSelection?.provider === "wireline"
            ? { provider: "wireline", tier: "sonnet" }
            : input.modelSelection,
        forceDeep: false,
        shallowOnly: true,
      });
    }
    if (tryOpusRetry) {
      log.warn("director opus turn failed, retrying on sonnet", {
        userId: input.userId,
        error: getErrorMessage(e),
      });
      return await planDirectorTurn({ ...input, forceDeep: false, shallowOnly: true });
    }
    if (tryOpusFallback) {
      log.warn("director opus turn failed, retrying on sonnet", {
        userId: input.userId,
        error: getErrorMessage(e),
      });
      return await planDirectorTurn({
        ...input,
        modelSelection: { provider: "wireline", tier: "sonnet" },
        forceDeep: false,
        shallowOnly: true,
      });
    }
    throw e;
  }
}

export interface DirectorStreamContext {
  mode: "fleet" | "coach";
  system: string;
  user: string;
  tool: ToolSchema;
  model: string;
  deepThink: boolean;
  maxTokens: number;
  llmProvider: "wireline" | "openrouter";
  modelLabel: string;
  modelKind: "sonnet" | "opus" | "custom";
  modelId?: string;
  focusAgentId?: string;
  focusAgentName?: string;
  normalize: (
    raw: Record<string, unknown>,
  ) => Omit<DirectorTurnResult, "reasoning" | "thinkingDurationMs" | "researchSources">;
  researchSources?: DirectorResearchSource[];
}

export interface DirectorStreamRoutingPreview {
  mode: "fleet" | "coach";
  model: "sonnet" | "opus" | "custom";
  modelLabel: string;
  modelProvider: "wireline" | "openrouter";
  modelId?: string;
  deep: boolean;
  focusAgentId?: string;
  focusAgentName?: string;
}

/**
 * Lightweight model routing for SSE — emitted before slow prompt assembly so the
 * UI can leave the "Loading fleet context" phase while DB + integrations load.
 */
export function previewDirectorStreamRouting(
  input: DirectorTurnInput & { focusAgentName?: string },
): DirectorStreamRoutingPreview {
  const focusId = input.focusAgentId?.trim();
  const fleetAudit = !input.shallowOnly && !focusId && wantsFleetAudit(input.operatorMessage);
  const longDeliverable = wantsLongDeliverable(input.operatorMessage);
  const autoOpusEligible =
    !input.shallowOnly &&
    !focusId &&
    (input.forceDeep === true ||
      (!fleetAudit &&
        (input.designRenderFallback === true || wantsOpusModel(input.operatorMessage))));
  const deepThinkEligible = !input.shallowOnly && !focusId && input.forceDeep === true;
  const skipAdaptiveThinking =
    input.designRenderFallback === true || (longDeliverable && input.forceDeep !== true);

  const modelSelection =
    input.designRenderFallback === true &&
    (input.modelSelection ?? DEFAULT_DIRECTOR_MODEL_SELECTION).provider === "wireline"
      ? { provider: "wireline" as const, tier: "opus" as const }
      : input.modelSelection;

  if (focusId) {
    const coachLlm = resolveDirectorLlm({
      selection:
        input.modelSelection?.provider === "openrouter"
          ? input.modelSelection
          : { provider: "wireline", tier: "sonnet" },
      autoOpus: false,
      deepThink: false,
      claudeSonnet: CLAUDE_MODELS.SONNET,
      claudeOpus: CLAUDE_DIRECTOR_MODEL,
      modelLabelForOpenRouter: labelForOpenRouterModel,
    });
    const streamMeta = directorStreamMetaModel({ modelKind: coachLlm.modelKind, deepThink: false });
    return {
      mode: "coach",
      model: streamMeta.model,
      modelLabel: coachLlm.modelLabel,
      modelProvider: coachLlm.provider,
      modelId: coachLlm.openRouterModelId,
      deep: false,
      focusAgentId: focusId,
      focusAgentName: input.focusAgentName,
    };
  }

  const llm = resolveDirectorLlm({
    selection: modelSelection,
    autoOpus: autoOpusEligible,
    deepThink: deepThinkEligible,
    longDeliverable,
    claudeSonnet: CLAUDE_MODELS.SONNET,
    claudeOpus: CLAUDE_DIRECTOR_MODEL,
    modelLabelForOpenRouter: labelForOpenRouterModel,
  });
  const effectiveDeepThink = skipAdaptiveThinking ? false : llm.deepThink;
  const streamMeta = directorStreamMetaModel({
    modelKind: llm.modelKind,
    deepThink: effectiveDeepThink,
  });
  return {
    mode: "fleet",
    model: streamMeta.model,
    modelLabel: llm.modelLabel,
    modelProvider: llm.provider,
    modelId: llm.openRouterModelId,
    deep: streamMeta.deep,
  };
}

/** Build prompts + normalizer for the Director SSE stream endpoint. */
export async function buildDirectorStreamContext(
  input: DirectorTurnInput,
): Promise<DirectorStreamContext> {
  const focusId = input.focusAgentId?.trim();
  const fleetAudit = !input.shallowOnly && !focusId && wantsFleetAudit(input.operatorMessage);
  const businessPromise =
    input.business !== undefined
      ? Promise.resolve(input.business)
      : loadBusinessContext(input.userId);
  const autoOpusEligible =
    !input.shallowOnly &&
    !focusId &&
    (input.forceDeep === true ||
      (!fleetAudit &&
        (input.designRenderFallback === true || wantsOpusModel(input.operatorMessage))));
  const deepThinkEligible = !input.shallowOnly && !focusId && input.forceDeep === true;
  const longDeliverable = wantsLongDeliverable(input.operatorMessage);
  const skipAdaptiveThinking =
    input.designRenderFallback === true || (longDeliverable && input.forceDeep !== true);

  const modelSelection =
    input.designRenderFallback === true &&
    (input.modelSelection ?? DEFAULT_DIRECTOR_MODEL_SELECTION).provider === "wireline"
      ? { provider: "wireline" as const, tier: "opus" as const }
      : input.modelSelection;

  const llm = resolveDirectorLlm({
    selection: modelSelection,
    autoOpus: autoOpusEligible,
    deepThink: deepThinkEligible,
    longDeliverable,
    claudeSonnet: CLAUDE_MODELS.SONNET,
    claudeOpus: CLAUDE_DIRECTOR_MODEL,
    modelLabelForOpenRouter: labelForOpenRouterModel,
  });

  const effectiveDeepThink = skipAdaptiveThinking ? false : llm.deepThink;
  const maxTokens =
    fleetAudit && !input.forceDeep
      ? resolveDirectorMaxTokens({ opus: false, longDeliverable: false, fleetAudit: true })
      : llm.maxTokens;

  if (focusId) {
    const ctx = await loadCoachContext(input.userId, focusId);
    if (ctx) {
      const needsResearch = wantsDirectorWebResearch(input.operatorMessage);
      const [connections, research] = await Promise.all([
        loadTenantIntegrationConnections(input.userId),
        needsResearch
          ? fetchDirectorResearchContext({
              operatorMessage: input.operatorMessage,
              history: input.history,
            })
          : Promise.resolve(null),
      ]);
      const integrationPrompt = formatDirectorIntegrationPrompt(connections);
      const wsInput = {
        operatorMessage: input.operatorMessage,
        history: mapDirectorHistoryToWorkspace(input.history),
        agent: ctx.agent,
        recentCalls: ctx.recentCalls,
        coachAsDirector: true as const,
        integrationPrompt,
      };
      const { system, user, tool } = buildWorkspaceStreamContext(wsInput);
      const coachLlm = resolveDirectorLlm({
        selection:
          input.modelSelection?.provider === "openrouter"
            ? input.modelSelection
            : { provider: "wireline", tier: "sonnet" },
        autoOpus: false,
        deepThink: false,
        claudeSonnet: CLAUDE_MODELS.SONNET,
        claudeOpus: CLAUDE_DIRECTOR_MODEL,
        modelLabelForOpenRouter: labelForOpenRouterModel,
      });
      return {
        mode: "coach",
        system,
        user: appendResearchToUserPrompt(user, research?.block),
        tool,
        model: coachLlm.model,
        deepThink: false,
        maxTokens: coachLlm.maxTokens,
        llmProvider: coachLlm.provider,
        modelLabel: coachLlm.modelLabel,
        modelKind: coachLlm.modelKind,
        modelId: coachLlm.openRouterModelId,
        focusAgentId: focusId,
        focusAgentName: ctx.agent.name || undefined,
        researchSources: research?.sources,
        normalize: (raw) => {
          const plan = normalizePlan(raw, { agentId: focusId, coachAsDirector: true });
          const base = workspaceToTurnResult(plan, focusId, ctx.agent.name, research?.sources);
          return {
            ...base,
            modelLabel: coachLlm.modelLabel,
            modelProvider: coachLlm.provider,
            modelId: coachLlm.openRouterModelId,
          };
        },
      };
    }
  }

  const needsResearch = !fleetAudit && wantsDirectorWebResearch(input.operatorMessage);
  const [business, connections, research] = await Promise.all([
    businessPromise,
    loadTenantIntegrationConnections(input.userId),
    needsResearch
      ? fetchDirectorResearchContext({
          operatorMessage: input.operatorMessage,
          history: input.history,
        })
      : Promise.resolve(null),
  ]);
  const integrationPrompt = formatDirectorIntegrationPrompt(connections);

  const system = buildDirectorFleetSystemPrompt({
    fleet: input.fleet,
    stats: input.stats,
    business,
    deep: effectiveDeepThink,
    integrationPrompt,
    deliverableGuidance:
      input.deliverableGuidance ??
      (fleetAudit && !input.forceDeep
        ? buildFleetAuditGuidance()
        : buildDirectorDeliverableGuidance(input.operatorMessage)),
  });

  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === "operator" ? "Operator" : "Director"}: ${m.content}`)
    .join("\n");
  const user = appendResearchToUserPrompt(
    `${transcript ? `Conversation:\n${transcript}\n\n` : ""}Operator: ${input.operatorMessage}`,
    research?.block,
  );

  const tool = DIRECTOR_FLEET_TOOL;

  return {
    mode: "fleet",
    system,
    user,
    tool,
    model: llm.model,
    deepThink: effectiveDeepThink,
    maxTokens,
    llmProvider: llm.provider,
    modelLabel: llm.modelLabel,
    modelKind: llm.modelKind,
    modelId: llm.openRouterModelId,
    researchSources: research?.sources,
    normalize: (raw) => {
      const plan = normalizeDirectorFleetPlan(raw, input.fleet, input.operatorMessage);
      const modelMeta = llm.modelKind === "custom" ? ("sonnet" as const) : llm.modelKind;
      return {
        mode: "fleet",
        reply: plan.reply,
        suggestions: plan.suggestions,
        changes: [],
        toolToggles: [],
        actions: plan.actions,
        integrationJobs: plan.integrationJobs,
        model: modelMeta,
        modelLabel: llm.modelLabel,
        modelProvider: llm.provider,
        modelId: llm.openRouterModelId,
      };
    },
  };
}
