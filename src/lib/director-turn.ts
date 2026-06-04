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
import { CLAUDE_MODELS } from "./claude-models";
import { wantsDeepAnalysis } from "./director-planner";
import {
  appendResearchToUserPrompt,
  fetchDirectorResearchContext,
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

export async function planDirectorTurn(input: DirectorTurnInput): Promise<DirectorTurnResult> {
  const business = input.business ?? (await loadBusinessContext(input.userId));
  const focusId = input.focusAgentId?.trim();
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

  const fleetPlan = await planDirector({
    userId: input.userId,
    operatorMessage: input.operatorMessage,
    history: input.history,
    fleet: input.fleet,
    stats: input.stats,
    business,
  });

  return {
    mode: "fleet",
    reply: fleetPlan.reply,
    suggestions: fleetPlan.suggestions,
    changes: [],
    toolToggles: [],
    actions: fleetPlan.actions,
    integrationJobs: fleetPlan.integrationJobs,
    model: fleetPlan.model,
    reasoning: fleetPlan.reasoning,
    thinkingDurationMs: fleetPlan.thinkingDurationMs,
    researchSources: fleetPlan.researchSources,
  };
}

export interface DirectorStreamContext {
  mode: "fleet" | "coach";
  system: string;
  user: string;
  tool: ToolSchema;
  model: string;
  deepThink: boolean;
  maxTokens: number;
  focusAgentId?: string;
  focusAgentName?: string;
  normalize: (
    raw: Record<string, unknown>,
  ) => Omit<DirectorTurnResult, "reasoning" | "thinkingDurationMs" | "researchSources">;
  researchSources?: DirectorResearchSource[];
}

/** Build prompts + normalizer for the Director SSE stream endpoint. */
export async function buildDirectorStreamContext(
  input: DirectorTurnInput,
): Promise<DirectorStreamContext> {
  const business = input.business ?? (await loadBusinessContext(input.userId));
  const focusId = input.focusAgentId?.trim();
  const deep = wantsDeepAnalysis(input.operatorMessage);

  if (focusId) {
    const ctx = await loadCoachContext(input.userId, focusId);
    if (ctx) {
      const connections = await loadTenantIntegrationConnections(input.userId);
      const integrationPrompt = formatDirectorIntegrationPrompt(connections);
      const wsInput = {
        operatorMessage: input.operatorMessage,
        history: mapDirectorHistoryToWorkspace(input.history),
        agent: ctx.agent,
        recentCalls: ctx.recentCalls,
        coachAsDirector: true as const,
        integrationPrompt,
      };
      const research = await fetchDirectorResearchContext({
        operatorMessage: input.operatorMessage,
        history: input.history,
      });
      const { system, user, tool } = buildWorkspaceStreamContext(wsInput);
      return {
        mode: "coach",
        system,
        user: appendResearchToUserPrompt(user, research?.block),
        tool,
        model: CLAUDE_MODELS.SONNET,
        deepThink: false,
        maxTokens: 1800,
        focusAgentId: focusId,
        focusAgentName: ctx.agent.name || undefined,
        researchSources: research?.sources,
        normalize: (raw) => {
          const plan = normalizePlan(raw, { agentId: focusId });
          return workspaceToTurnResult(plan, focusId, ctx.agent.name, research?.sources);
        },
      };
    }
  }

  const connections = await loadTenantIntegrationConnections(input.userId);
  const integrationPrompt = formatDirectorIntegrationPrompt(connections);
  const research = await fetchDirectorResearchContext({
    operatorMessage: input.operatorMessage,
    history: input.history,
  });

  const system = buildDirectorFleetSystemPrompt({
    fleet: input.fleet,
    stats: input.stats,
    business,
    deep,
    integrationPrompt,
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
    model: deep ? CLAUDE_MODELS.OPUS : CLAUDE_MODELS.SONNET,
    deepThink: deep,
    maxTokens: deep ? 4000 : 2800,
    researchSources: research?.sources,
    normalize: (raw) => {
      const plan = normalizeDirectorFleetPlan(raw, input.fleet);
      return {
        mode: "fleet",
        reply: plan.reply,
        suggestions: plan.suggestions,
        changes: [],
        toolToggles: [],
        actions: plan.actions,
        integrationJobs: plan.integrationJobs,
        model: deep ? "opus" : "sonnet",
      };
    },
  };
}
