import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import * as schema from "../db/schema";
import { pickRotatedVoiceId, resolvePstnVoiceCandidate } from "../data/voice-roster";
import { AppError } from "./api-error";
import {
  normalizeAgentCustomization,
  compileAgentRuntimeInstructions,
  profileToBusinessVariables,
  type AgentCustomizationInput,
  type AgentCustomizationProfile,
  isAgentCustomizationProfile,
} from "./agent-customization";
import {
  AGENT_CAPACITY_REACHED,
  agentCapMessage,
  resolveAgentEntitlement,
} from "./agent-entitlements";
import { isOwnerEmail } from "./auth-service";
import { drizzle, tenantStore } from "./server-context";
import { emitServerProductEventOnce } from "./product-event-server";
import {
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "./bot-mark";

const ROLE_ARCHETYPES: Record<AgentCustomizationProfile["identity"]["role"], string> = {
  receptionist: "Receptionist",
  scheduler: "Scheduling Agent",
  sales: "Sales Representative",
  customer_service: "Customer Support",
  personal_assistant: "Personal Assistant",
};

export interface AgentDraftPrincipal {
  userId: string;
  email: string;
}

export interface AgentDraftView {
  id: string;
  name: string;
  role: AgentCustomizationProfile["identity"]["role"];
  businessName: string;
  primaryGoal: string;
  tone: string;
  rules: string[];
  prohibitedTopics: string[];
  allowedActions: string[];
  escalationPolicy: AgentCustomizationProfile["behavior"]["escalationPolicy"];
  knowledgeSummary: string;
  lifecycle: "draft";
  openInWirelinePath: string;
}

function persistedBusinessVariables(profile: AgentCustomizationProfile): Record<string, unknown> {
  return {
    ...profileToBusinessVariables(profile),
    customizationProfile: profile,
  };
}

async function assertAgentIsDraftOnly(agentId: string, userId: string): Promise<void> {
  const [line] = await drizzle
    .select({ id: schema.phoneNumbers.id })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.agentId, agentId), eq(schema.phoneNumbers.userId, userId)))
    .limit(1);
  if (line) {
    throw AppError.forbidden(
      "This Bot is live on the phone network. Open its BotBound Workspace to make changes.",
    );
  }
}

function profileFromStoredAgent(agent: {
  name: string;
  role: string | null;
  businessVariables: unknown;
  systemPromptOverride: string | null;
}): AgentCustomizationProfile {
  const variables =
    agent.businessVariables && typeof agent.businessVariables === "object"
      ? (agent.businessVariables as Record<string, unknown>)
      : {};
  if (isAgentCustomizationProfile(variables.customizationProfile)) {
    return variables.customizationProfile;
  }
  return normalizeAgentCustomization(
    {
      agent_name: agent.name,
      role: agent.role,
      business_name: variables.businessName,
      primary_goal: variables.primaryGoal,
      tone: variables.tone,
      success_criteria: variables.successCriteria,
      allowed_actions: variables.allowedActions,
      escalation_policy: variables.escalationPolicy,
      knowledge_summary: variables.knowledgeSummary,
    },
    "chatgpt_mcp",
  );
}

function toView(id: string, profile: AgentCustomizationProfile): AgentDraftView {
  return {
    id,
    name: profile.identity.name,
    role: profile.identity.role,
    businessName: profile.identity.businessName,
    primaryGoal: profile.mission.primaryGoal,
    tone: profile.identity.tone,
    rules: profile.behavior.rules,
    prohibitedTopics: profile.behavior.prohibitedTopics,
    allowedActions: profile.behavior.allowedActions,
    escalationPolicy: profile.behavior.escalationPolicy,
    knowledgeSummary: profile.knowledge.summary,
    lifecycle: "draft",
    openInWirelinePath: `/studio?agent=${encodeURIComponent(id)}`,
  };
}

/**
 * `db` is the transaction handle, never the pool.
 *
 * This read used to go straight to `drizzle` while its caller was already
 * inside `drizzle.transaction` holding a connection AND a per-user advisory
 * lock. Every capacity check therefore checked out a SECOND connection from the
 * same small pool while pinning the first. MCP tool calls arrive in parallel by
 * design, so pool-size concurrent creates would each hold one connection and
 * block waiting for one that only another of them could release — a self-inflicted
 * deadlock that resolves by acquisition timeout, with the advisory lock held the
 * whole way.
 */
async function assertAgentCapacity(
  db: Pick<typeof drizzle, "select">,
  principal: AgentDraftPrincipal,
  existingCount: number,
): Promise<void> {
  const [setting] = await db
    .select({
      planId: schema.subscriptions.plan,
      subscriptionStatus: schema.settings.subscriptionStatus,
      maxAgents: schema.settings.maxAgents,
      extraAgents: schema.settings.extraAgents,
    })
    .from(schema.settings)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
    .where(eq(schema.settings.userId, principal.userId))
    .limit(1);
  const entitlement = resolveAgentEntitlement({
    isOwner: isOwnerEmail(principal.email),
    subscriptionStatus: setting?.subscriptionStatus,
    planId: setting?.planId,
    maxAgents: setting?.maxAgents,
    extraAgents: setting?.extraAgents,
  });
  if (entitlement.effectiveCap !== null && existingCount >= entitlement.effectiveCap) {
    throw new AppError(402, AGENT_CAPACITY_REACHED, agentCapMessage(entitlement.effectiveCap));
  }
}

/**
 * Shared draft-creation service. MCP is the first caller, but web and mobile
 * should migrate here rather than recreating agent defaults in their own layers.
 */
export async function createAgentDraft(
  principal: AgentDraftPrincipal,
  input: AgentCustomizationInput,
  source: AgentCustomizationProfile["source"] = "chatgpt_mcp",
): Promise<AgentDraftView> {
  const profile = normalizeAgentCustomization(input, source);
  return tenantStore.run(principal.userId, async () => {
    const id = `agent-${randomBytes(16).toString("hex")}`;
    let existingCount = 0;
    // Count + capacity check + insert must be one serialized unit — MCP tool
    // calls arrive in parallel as a matter of course, and three independent
    // statements let two concurrent creates both read count = cap-1 and both
    // insert. Same advisory-lock pattern as agent-routes-v2 / mobile-routes.
    await drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${principal.userId}))`);
      const existingAgents = await tx
        .select({ id: schema.agents.id, markKey: schema.agents.markKey })
        .from(schema.agents)
        .where(eq(schema.agents.userId, principal.userId));
      existingCount = existingAgents.length;
      await assertAgentCapacity(tx, principal, existingCount);

      const usedMarkKeys = new Set<BotMarkKey>();
      for (const existingAgent of existingAgents) {
        usedMarkKeys.add(
          isBotMarkKey(existingAgent.markKey)
            ? existingAgent.markKey
            : defaultBotMarkKey(existingAgent.id),
        );
      }
      const markKey = firstAvailableBotMarkKey(id, usedMarkKeys);
      if (!markKey) {
        throw new AppError(
          409,
          "BOT_MARK_CAPACITY_REACHED",
          "Every available Bot identity is already in use.",
        );
      }

      const voiceId = pickRotatedVoiceId(existingCount);
      await tx.insert(schema.agents).values({
        id,
        userId: principal.userId,
        name: profile.identity.name,
        markKey,
        role: profile.identity.role,
        channel: "voice",
        archetype: ROLE_ARCHETYPES[profile.identity.role],
        voiceId,
        voiceProvider: "openai",
        // A draft records intended actions in its customization profile, but it
        // never receives external tools until the user configures and enables
        // them explicitly in BotBound.
        enabledTools: [],
        firstMessage: `Hi, this is ${profile.identity.name}. How can I help?`,
        personalityVibe: profile.identity.tone,
        isBusinessAgent:
          profile.identity.role !== "personal_assistant" &&
          profile.identity.businessName !== "Your work",
        businessVariables: persistedBusinessVariables(profile),
        systemPromptOverride: compileAgentRuntimeInstructions(profile),
        disallowedTopics: profile.behavior.prohibitedTopics,
        escalationKeywords: [],
        escalationHandoffEnabled: profile.behavior.escalationPolicy === "handoff_when_configured",
      });
    });
    emitServerProductEventOnce({
      event: "agent_draft_created",
      userId: principal.userId,
      agentId: id,
      surface:
        source === "chatgpt_mcp"
          ? "chatgpt_app"
          : source === "claude_mcp"
            ? "claude_app"
            : source === "cursor_mcp"
              ? "cursor_app"
              : source === "ios"
                ? "ios"
                : source === "android"
                  ? "android"
                  : source === "web"
                    ? "web_workspace"
                    : "api",
      metadata: { source, role: profile.identity.role },
    });
    return toView(id, profile);
  });
}

export async function getAgentDraft(
  principal: AgentDraftPrincipal,
  agentId: string,
): Promise<{ view: AgentDraftView; runtimeInstructions: string; voiceId: string | null }> {
  return tenantStore.run(principal.userId, async () => {
    await assertAgentIsDraftOnly(agentId, principal.userId);
    const [agent] = await drizzle
      .select({
        id: schema.agents.id,
        name: schema.agents.name,
        role: schema.agents.role,
        businessVariables: schema.agents.businessVariables,
        systemPromptOverride: schema.agents.systemPromptOverride,
        voiceId: schema.agents.voiceId,
        voiceProvider: schema.agents.voiceProvider,
        phoneVoiceId: schema.agents.phoneVoiceId,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, principal.userId)))
      .limit(1);
    if (!agent) throw AppError.notFound("BotBound Bot draft not found.");
    const profile = profileFromStoredAgent(agent);
    return {
      view: toView(agent.id, profile),
      runtimeInstructions: agent.systemPromptOverride || compileAgentRuntimeInstructions(profile),
      voiceId: resolvePstnVoiceCandidate(
        agent.voiceProvider?.trim().toLowerCase() === "presenter" ? null : agent.voiceId,
        agent.phoneVoiceId,
      ),
    };
  });
}

export async function updateAgentDraft(
  principal: AgentDraftPrincipal,
  agentId: string,
  input: AgentCustomizationInput,
): Promise<AgentDraftView> {
  return tenantStore.run(principal.userId, async () => {
    await assertAgentIsDraftOnly(agentId, principal.userId);
    const existing = await getAgentDraft(principal, agentId);
    const current = existing.view;
    const merged = normalizeAgentCustomization(
      {
        agent_name: input.agent_name ?? current.name,
        role: input.role ?? current.role,
        business_name: input.business_name ?? current.businessName,
        primary_goal: input.primary_goal ?? current.primaryGoal,
        tone: input.tone ?? current.tone,
        rules: input.rules ?? current.rules,
        prohibited_topics: input.prohibited_topics ?? current.prohibitedTopics,
        allowed_actions: input.allowed_actions ?? current.allowedActions,
        escalation_policy: input.escalation_policy ?? current.escalationPolicy,
        knowledge_summary: input.knowledge_summary ?? current.knowledgeSummary,
        success_criteria: input.success_criteria,
      },
      "chatgpt_mcp",
    );
    await drizzle
      .update(schema.agents)
      .set({
        name: merged.identity.name,
        role: merged.identity.role,
        isBusinessAgent:
          merged.identity.role !== "personal_assistant" &&
          merged.identity.businessName !== "Your work",
        archetype: ROLE_ARCHETYPES[merged.identity.role],
        firstMessage: `Hi, this is ${merged.identity.name}. How can I help?`,
        personalityVibe: merged.identity.tone,
        businessVariables: persistedBusinessVariables(merged),
        systemPromptOverride: compileAgentRuntimeInstructions(merged),
        disallowedTopics: merged.behavior.prohibitedTopics,
        escalationHandoffEnabled: merged.behavior.escalationPolicy === "handoff_when_configured",
      })
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, principal.userId)));
    return toView(agentId, merged);
  });
}
