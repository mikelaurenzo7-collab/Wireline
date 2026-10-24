import { OPENING_GREETING_PREFIX, resolveAgentGreeting } from "../lib/agent-greeting";
import { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AppError } from "../lib/api-error";
import { validateBody } from "../lib/api-validation-base";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { agentMutationRateLimit } from "../middleware/api-rate-limits";
import { recordAmbiguousProviderAttempt, recordUsage } from "../lib/ai-audit";
import { drizzle, log } from "../lib/server-context";
import { phoneCallVoiceFor } from "../lib/voice/xai-voice-config";
import { LIVE_CUSTOM_VOICE_KEY } from "../lib/voice/live-voice-service";
import { xaiSipCredentialsFor } from "../lib/voice/xai-phone-registration";
import { isVoiceSampleAvailable, synthesizeVoiceSample } from "../lib/voice/voice-sample";
import {
  isPlaybookEmpty,
  parseAgentPlaybook,
  readStoredAgentPlaybook,
} from "../lib/agent-playbook";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { listAgentsForUser } from "../lib/agents-store";
import { deleteBot, previewBotDeletion } from "../lib/bot-deletion";
import { normalizeManagedOpenAIVoiceId, pickRotatedVoiceId } from "../data/voice-roster";
import { businessAgentVideoPresenterDefaults } from "../lib/video-presenter/liveavatar-service";
import {
  isAgentToolName,
  normalizeEnabledTools,
  type AgentToolName,
} from "../lib/agent-capabilities";
import {
  resolveCreateEnabledTools,
  resolveCreateFirstMessage,
  resolveCreatePersonality,
} from "../lib/agent-create-defaults";
import {
  agentRoleLaunchReviewMessage,
  isAgentRoleLaunchReviewRequired,
  isTemplateLaunchReviewRequired,
  templateLaunchReviewMessage,
} from "../lib/template-launch-policy";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { AI_TOOLS } from "../lib/ai-tools";
import { isOpenAIModelId, isXAIModelId } from "../lib/ai-models";
import {
  AI_GATEWAY_BASE_URL,
  gatewayHeaders,
  gatewayModelId,
  isAIGatewayConfigured,
} from "../lib/ai-gateway";
import { AgentBusinessProfileSchema } from "../lib/form-validators";
import { humanHandoffProblem, normalizeHandoffPhone } from "../lib/human-handoff-settings";
import { isOwnerEmail } from "../lib/auth-service";
import {
  AGENT_CAPACITY_REACHED,
  agentCapMessage,
  resolveAgentEntitlement,
} from "../lib/agent-entitlements";
import {
  KNOWLEDGE_DOCUMENT_MAX_BASE64_CHARS,
  KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS,
  KNOWLEDGE_TEXT_EXTRACT_CHARS,
  knowledgeAssetTooLargeMessage,
  knowledgeTextTruncationNotice,
} from "../lib/knowledge-asset-limits";
import { extractKnowledgeDocumentWithOpenAI } from "../lib/knowledge-document-openai";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import {
  isTrainingImageAvailable,
  runTrainingImage,
  runTrainingStructured,
} from "../lib/training-ai-spend";
import {
  DefiniteProviderRejectionError,
  hasKnownResponsesUsage,
  resolveResponsesEvidence,
} from "../lib/ai-client";
import { normalizeResponsesUsage } from "../lib/ai-usage";
import {
  AGENT_CREATE_DEFAULT_ROLE_ID,
  canonicalizeAgentRoleForCreate,
  listAgentRolesForApi,
  resolveAgentRoleArchetype,
  validateAgentRoleForCreate,
} from "../lib/agent-role-definitions";
import { removesRegulatedTemplateProvenance } from "../lib/runtime-template-personality";
import {
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "../lib/bot-mark";
import { PAID_BOT_IDENTITY_JOB_TYPE } from "../lib/paid-bot-identity";

const router = Router();

type ExtractedConfig = {
  directives: Array<{ content: string; priority?: number }>;
  knowledge: Array<{ content: string }>;
  personality: string;
};

type AssetPayload = {
  fileName?: unknown;
  mimeType?: unknown;
  text?: unknown;
  dataUrl?: unknown;
  fileBase64?: unknown;
};

/** The business-profile columns read by the Studio config and returned by its PATCH. */
const BUSINESS_PROFILE_COLUMNS = {
  businessHours: schema.agents.businessHours,
  timezone: schema.agents.timezone,
  complianceMode: schema.agents.complianceMode,
  callRecordingEnabled: schema.agents.callRecordingEnabled,
  disallowedTopics: schema.agents.disallowedTopics,
  escalationKeywords: schema.agents.escalationKeywords,
  escalationPhone: schema.agents.escalationPhone,
  transferPhone: schema.agents.transferPhone,
  escalationEmail: schema.agents.escalationEmail,
  escalationHandoffEnabled: schema.agents.escalationHandoffEnabled,
  businessVariables: schema.agents.businessVariables,
  outOfHoursMessage: schema.agents.outOfHoursMessage,
  kpiFocus: schema.agents.kpiFocus,
  isBusinessAgent: schema.agents.isBusinessAgent,
};

function businessProfileView(record: {
  businessHours: unknown;
  timezone: string | null;
  complianceMode: string | null;
  callRecordingEnabled: boolean | null;
  disallowedTopics: string[] | null;
  escalationKeywords: string[] | null;
  escalationPhone: string | null;
  transferPhone: string | null;
  escalationEmail: string | null;
  escalationHandoffEnabled: boolean | null;
  businessVariables: unknown;
  outOfHoursMessage: string | null;
  kpiFocus: string | null;
  isBusinessAgent: boolean | null;
}) {
  return {
    business_hours: record.businessHours || null,
    timezone: record.timezone || "UTC",
    compliance_mode: record.complianceMode || "none",
    call_recording_enabled: record.callRecordingEnabled ?? false,
    disallowed_topics: record.disallowedTopics || [],
    escalation_keywords: record.escalationKeywords || [],
    escalation_phone: record.escalationPhone || null,
    transfer_phone: record.transferPhone || null,
    escalation_email: record.escalationEmail || null,
    escalation_handoff_enabled: record.escalationHandoffEnabled ?? false,
    business_variables: record.businessVariables || null,
    out_of_hours_message: record.outOfHoursMessage || null,
    kpi_focus: record.kpiFocus || null,
    is_business_agent: record.isBusinessAgent ?? false,
  };
}

async function owned(agentId: string, userId: string) {
  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent;
}

async function withBotMarkPersistenceErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const databaseError = error as { code?: unknown; constraint?: unknown };
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "uq_wireline_agents_user_mark_key"
    ) {
      throw new AppError(
        409,
        "BOT_MARK_CONFLICT",
        "That Bot identity is already in use in this workspace.",
      );
    }
    if (
      databaseError.code === "23514" &&
      databaseError.constraint === "wireline_agents_mark_key_check"
    ) {
      throw new AppError(400, "UNKNOWN_BOT_MARK", "Choose a valid Bot identity mark.");
    }
    throw error;
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extractionReply(parsed: ExtractedConfig) {
  const parts: string[] = [];
  if (parsed.directives.length)
    parts.push(
      `Saved ${parsed.directives.length} operating rule${parsed.directives.length === 1 ? "" : "s"}.`,
    );
  if (parsed.knowledge.length)
    parts.push(`Saved ${parsed.knowledge.length} fact${parsed.knowledge.length === 1 ? "" : "s"}.`);
  if (parsed.personality) parts.push("Updated the tone guidance.");
  return parts.length
    ? `${parts.join(" ")} They now appear under Knowledge.`
    : "I did not find a clear rule, fact, or tone change. Tell me what this agent must do, must avoid, or needs to know.";
}

function normalizeExtraction(value: unknown): ExtractedConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const directives = Array.isArray(raw.directives)
    ? raw.directives
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          content: cleanText(item.content, 2000),
          priority: Math.max(1, Math.min(10, Number(item.priority) || 5)),
        }))
        .filter((item) => !!item.content)
    : [];
  const knowledge = Array.isArray(raw.knowledge)
    ? raw.knowledge
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({ content: cleanText(item.content, 4000) }))
        .filter((item) => !!item.content)
    : [];
  return {
    directives,
    knowledge,
    personality: cleanText(raw.personality, 4000),
  };
}

async function persistExtraction(agentId: string, userId: string, extraction: ExtractedConfig) {
  await drizzle.transaction(async (tx) => {
    if (extraction.personality) {
      await tx.execute(
        sql`SELECT ${schema.agents.id} FROM ${schema.agents} WHERE ${schema.agents.id} = ${agentId} AND ${schema.agents.userId} = ${userId} FOR UPDATE`,
      );
      const [current] = await tx
        .select({ content: schema.personality.content })
        .from(schema.personality)
        .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)))
        .limit(1);
      if (removesRegulatedTemplateProvenance(current?.content, extraction.personality)) {
        throw new AppError(
          409,
          "REGULATED_TEMPLATE_PROVENANCE_PROTECTED",
          "This review-required Bot's regulated template marker cannot be removed through Training extraction.",
        );
      }
    }
    if (extraction.directives.length) {
      await tx.insert(schema.directives).values(
        extraction.directives.map((item) => ({
          content: item.content,
          priority: item.priority || 5,
          agentId,
          userId,
        })),
      );
    }
    if (extraction.knowledge.length) {
      await tx.insert(schema.knowledge).values(
        extraction.knowledge.map((item) => ({
          content: item.content,
          agentId,
          userId,
        })),
      );
    }
    if (extraction.personality) {
      await tx
        .insert(schema.personality)
        .values({ agentId, userId, content: extraction.personality })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { userId, content: extraction.personality },
        });
    }
  });
}

async function extractTextAsset(
  userId: string,
  fileName: string,
  text: string,
): Promise<ExtractedConfig> {
  return normalizeExtraction(
    await runTrainingStructured<ExtractedConfig>({
      userId,
      source: "asset_text",
      options: {
        system:
          "You are the BotBound Configuration Engine. Extract only explicit operating rules, concrete facts, and requested tone guidance from a supplied asset. Be conservative. Never invent missing information.",
        user: `Asset name: ${fileName}\n\nAsset content:\n${text}`,
        tool: AI_TOOLS.trainingExtraction,
        complexity: "simple",
        maxTokens: 1200,
      },
    }),
  );
}

function responseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    if (!output || typeof output !== "object") continue;
    for (const part of Array.isArray((output as Record<string, unknown>).content)
      ? ((output as Record<string, unknown>).content as unknown[])
      : []) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as Record<string, unknown>).text === "string"
      )
        chunks.push((part as Record<string, string>).text);
    }
  }
  return chunks.join("\n");
}

export async function extractImageAsset(
  fileName: string,
  dataUrl: string,
  userId: string,
): Promise<ExtractedConfig> {
  if (!isAIGatewayConfigured()) {
    throw AppError.fromHttpStatus(
      503,
      "Image uploads are unavailable. Upload TXT, MD, CSV, PDF, DOCX, or XLSX files.",
    );
  }
  // Keep multimodal extraction separate from the text-only structured adapter,
  // but preserve the same OpenAI-first managed default. Operators can still
  // select another bounded GPT-5.6 Gateway vision model through the environment.
  const visionModel = gatewayModelId(process.env.WIRELINE_GATEWAY_VISION_MODEL?.trim() || "");
  const schemaDefinition = {
    type: "object",
    additionalProperties: false,
    properties: {
      directives: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: { type: "string" },
            priority: { type: "integer" },
          },
          required: ["content", "priority"],
        },
      },
      knowledge: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { content: { type: "string" } },
          required: ["content"],
        },
      },
      personality: { type: "string" },
    },
    required: ["directives", "knowledge", "personality"],
  };
  const requestBody = {
    model: visionModel,
    instructions:
      "Analyze the uploaded image only for explicit facts, operating rules, service details, schedules, product details, or tone direction that can safely train a Bot. Do not infer private information or create facts that are not visibly supported.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract agent-training information from the image asset named ${fileName}.`,
          },
          { type: "input_image", image_url: dataUrl, detail: "low" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "studio_asset_extraction",
        strict: true,
        schema: schemaDefinition,
      },
    },
    max_output_tokens: 1200,
  };
  return runTrainingImage({
    userId,
    model: visionModel,
    promptAndSchema: JSON.stringify(
      {
        instructions: requestBody.instructions,
        text: requestBody.input[0].content[0].text,
        schema: schemaDefinition,
      },
      null,
      2,
    ),
    operation: async () => {
      const startedAt = Date.now();
      const response = await fetch(`${AI_GATEWAY_BASE_URL}/responses`, {
        method: "POST",
        headers: gatewayHeaders(),
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500)
          throw new DefiniteProviderRejectionError("AI Gateway", response.status);
        throw AppError.fromHttpStatus(502, `Image intake failed (${response.status}).`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const evidence = resolveResponsesEvidence(payload, visionModel, "AI Gateway");
      const usage = normalizeResponsesUsage(
        payload.usage && typeof payload.usage === "object"
          ? (payload.usage as Record<string, unknown>)
          : {},
      );
      // This multimodal path calls Gateway directly rather than the text-only
      // structured adapter, so record its measured usage explicitly.
      // Without this the vision spend is invisible to the audit ledger and the
      // spend wrapper captures nothing.
      const rawUsage = payload.usage as Record<string, unknown> | undefined;
      if (evidence.actualCostUsd === undefined && !hasKnownResponsesUsage(rawUsage || {}))
        recordAmbiguousProviderAttempt();
      recordUsage(
        evidence.model,
        {
          model: evidence.model,
          inference_provider: evidence.inferenceProvider,
          actual_cost_usd: evidence.actualCostUsd,
          usage: {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_read_input_tokens: usage.cacheReadTokens,
            cache_creation_input_tokens: usage.cacheWriteTokens,
          },
        },
        Date.now() - startedAt,
      );
      const output = responseText(payload);
      try {
        return normalizeExtraction(JSON.parse(output));
      } catch {
        throw AppError.fromHttpStatus(502, "Image intake returned an unreadable result.");
      }
    },
  }).catch((error: unknown) => {
    // The accounting wrapper needs the definitive rejection classification to
    // release an unspent hold. Preserve a usable API error after it has done so.
    if (error instanceof DefiniteProviderRejectionError) {
      throw AppError.fromHttpStatus(
        502,
        "Image training is temporarily unavailable. Try again shortly.",
      );
    }
    throw error;
  });
}

router.get("/api/agents", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ agents: await listAgentsForUser(req.user.id) });
  } catch (error) {
    log.warn("Agent roster unavailable", {
      error: getErrorMessage(error),
      userId: req.user.id,
    });
    res.status(503).json({
      code: "AGENT_ROSTER_UNAVAILABLE",
      agents: [],
      degraded: true,
      error: "Agent roster is temporarily unavailable",
    });
  }
});

router.get("/api/agents/roles", authenticateUser, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ roles: listAgentRolesForApi() });
});

router.post(
  "/api/agents",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const name = cleanText(req.body?.name, 100);
    const rawRole = cleanText(req.body?.role, 80) || AGENT_CREATE_DEFAULT_ROLE_ID;
    const roleError = validateAgentRoleForCreate(rawRole);
    if (roleError) throw new AppError(400, "UNKNOWN_AGENT_ROLE", roleError);
    const role = canonicalizeAgentRoleForCreate(rawRole);
    if (isAgentRoleLaunchReviewRequired(role)) {
      throw new AppError(409, "ROLE_REVIEW_REQUIRED", agentRoleLaunchReviewMessage(role));
    }
    const isBusinessAgent = req.body?.is_business_agent === true;
    if (!name) throw AppError.fromHttpStatus(400, "Agent name is required");
    const requestedMarkKey = cleanText(req.body?.mark_key, 32);
    if (requestedMarkKey && !isBotMarkKey(requestedMarkKey)) {
      throw new AppError(400, "UNKNOWN_BOT_MARK", "Choose a valid Bot identity mark.");
    }
    // Quick Deploy sends a curated pick as voice_id; anything outside the
    // managed roster falls back to rotation so the runtime stays managed.
    const requestedVoiceId = cleanText(req.body?.voice_id, 160);
    // Template deploys carry the template's channel, opening line, and
    // personality overlay; plain Fast Start creates keep the defaults.
    const channel = req.body?.channel === "email" ? "email" : "voice";
    const firstMessage = resolveCreateFirstMessage(req.body?.firstMessage, name);
    const templateId = cleanText(req.body?.templateId, 80);
    if (isTemplateLaunchReviewRequired(templateId)) {
      throw new AppError(409, "TEMPLATE_REVIEW_REQUIRED", templateLaunchReviewMessage(templateId));
    }
    // Always seed a real personality. Fast Start used to leave personal agents
    // with a one-line tone from the client; Studio Set up then overwrote it with
    // role-ready copy. Templates still win when templateId is present.
    const seededPersonality = resolveCreatePersonality({
      role,
      isBusinessAgent,
      templateId,
      agentName: name,
    });

    const id = `agent-${randomUUID()}`;
    const enabledTools = resolveCreateEnabledTools(role, isBusinessAgent);
    const videoPresenter = isBusinessAgent ? businessAgentVideoPresenterDefaults() : {};

    const markKey = await withBotMarkPersistenceErrors(() =>
      drizzle.transaction(async (tx): Promise<BotMarkKey> => {
        // Serialize capacity checks per tenant so concurrent creates cannot exceed plan caps.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);

        const existingAgents = await tx
          .select({ id: schema.agents.id, markKey: schema.agents.markKey })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id));
        const existing = existingAgents.length;

        const isOwner = isOwnerEmail(req.user.email);
        const [row] = await tx
          .select({
            planId: schema.subscriptions.plan,
            subscriptionStatus: schema.settings.subscriptionStatus,
            maxAgents: schema.settings.maxAgents,
            extraAgents: schema.settings.extraAgents,
          })
          .from(schema.settings)
          .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
          .where(eq(schema.settings.userId, req.user.id))
          .limit(1);

        const entitlement = resolveAgentEntitlement({
          isOwner,
          subscriptionStatus: row?.subscriptionStatus,
          planId: row?.planId,
          maxAgents: row?.maxAgents,
          extraAgents: row?.extraAgents,
        });

        if (entitlement.effectiveCap !== null && existing >= entitlement.effectiveCap) {
          throw new AppError(
            402,
            AGENT_CAPACITY_REACHED,
            agentCapMessage(entitlement.effectiveCap),
          );
        }

        const usedMarkKeys = new Set<BotMarkKey>();
        for (const existingAgent of existingAgents) {
          const existingMark = isBotMarkKey(existingAgent.markKey)
            ? existingAgent.markKey
            : defaultBotMarkKey(existingAgent.id);
          usedMarkKeys.add(existingMark);
        }
        if (isBotMarkKey(requestedMarkKey) && usedMarkKeys.has(requestedMarkKey)) {
          throw new AppError(
            409,
            "BOT_MARK_CONFLICT",
            "That Bot identity is already in use in this workspace.",
          );
        }
        const availableMarkKey = isBotMarkKey(requestedMarkKey)
          ? requestedMarkKey
          : firstAvailableBotMarkKey(id, usedMarkKeys);
        if (!availableMarkKey) {
          throw new AppError(
            409,
            "BOT_MARK_CAPACITY_REACHED",
            "Every available Bot identity is already in use.",
          );
        }

        const voiceId =
          normalizeManagedOpenAIVoiceId(requestedVoiceId) || pickRotatedVoiceId(existing);
        await tx.insert(schema.agents).values({
          id,
          userId: req.user.id,
          name,
          markKey: availableMarkKey,
          role,
          channel,
          archetype: resolveAgentRoleArchetype(role),
          voiceId,
          voiceProvider: "openai",
          enabledTools,
          firstMessage,
          isBusinessAgent,
          ...videoPresenter,
        });

        if (seededPersonality) {
          await tx
            .insert(schema.personality)
            .values({
              agentId: id,
              userId: req.user.id,
              content: seededPersonality,
            })
            .onConflictDoUpdate({
              target: schema.personality.agentId,
              set: { userId: req.user.id, content: seededPersonality },
            });
        }
        // Commit the Bot and its first durable identity attempt together. Free
        // plans complete this job without provider allocation; a later paid
        // subscription event queues a fresh attempt for every current Bot.
        await tx.insert(schema.jobs).values({
          userId: req.user.id,
          type: PAID_BOT_IDENTITY_JOB_TYPE,
          payload: { userId: req.user.id, agentId: id },
          runAt: new Date(Date.now() + 30_000),
        });
        return availableMarkKey;
      }),
    );

    emitServerProductEventOnce({
      event: "agent_draft_created",
      userId: req.user.id,
      agentId: id,
      metadata: { source: "web_fast_start", role },
    });

    res.status(201).json({
      id,
      name,
      mark_key: markKey,
      role,
      channel,
      enabledTools,
      is_business_agent: isBusinessAgent,
    });
  },
);

router.patch(
  "/api/agents/:id/mark",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const markKey = cleanText(req.body?.mark_key, 32);
    if (!isBotMarkKey(markKey)) {
      throw new AppError(400, "UNKNOWN_BOT_MARK", "Choose a valid Bot identity mark.");
    }

    const updated = await withBotMarkPersistenceErrors(() =>
      drizzle.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))`);
        const [ownedAgent] = await tx
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!ownedAgent) throw AppError.fromHttpStatus(404, "Agent not found");

        const workspaceAgents = await tx
          .select({ id: schema.agents.id, markKey: schema.agents.markKey })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id));
        const conflict = workspaceAgents.some(
          (agent) =>
            agent.id !== req.params.id &&
            (isBotMarkKey(agent.markKey) ? agent.markKey : defaultBotMarkKey(agent.id)) === markKey,
        );
        if (conflict) {
          throw new AppError(
            409,
            "BOT_MARK_CONFLICT",
            "That Bot identity is already in use in this workspace.",
          );
        }

        const [saved] = await tx
          .update(schema.agents)
          .set({ markKey })
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
          .returning({ id: schema.agents.id });
        if (!saved) throw AppError.fromHttpStatus(404, "Agent not found");
        return saved;
      }),
    );

    res.json({ id: updated.id, mark_key: markKey });
  },
);

router.get(
  "/api/agent-config/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const [agentRows, personalities, directives, knowledge] = await drizzle.transaction(
      async (tx) => {
        // A transaction is a single pg client. Run the snapshot reads in
        // order instead of relying on pg@8's deprecated concurrent queue.
        const agentRows = await tx
          .select({
            name: schema.agents.name,
            firstMessage: schema.agents.firstMessage,
            markKey: schema.agents.markKey,
            role: schema.agents.role,
            archetype: schema.agents.archetype,
            flowConfig: schema.agents.flowConfig,
            playbook: schema.agents.playbook,
            enabledTools: schema.agents.enabledTools,
            llmProvider: schema.agents.llmProvider,
            llmModel: schema.agents.llmModel,
            llmTemperature: schema.agents.llmTemperature,
            voiceId: schema.agents.voiceId,
            voiceProvider: schema.agents.voiceProvider,
            phoneVoiceId: schema.agents.phoneVoiceId,
            phoneVoiceProvider: schema.agents.phoneVoiceProvider,
            ...BUSINESS_PROFILE_COLUMNS,
            videoPresenterProvider: schema.agents.videoPresenterProvider,
            videoPresenterAvatarId: schema.agents.videoPresenterAvatarId,
            videoPresenterConsentStatus: schema.agents.videoPresenterConsentStatus,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        const personalities = await tx
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(
            and(
              eq(schema.personality.agentId, req.params.id),
              eq(schema.personality.userId, req.user.id),
            ),
          )
          .limit(1);
        const directives = await tx
          .select()
          .from(schema.directives)
          .where(
            and(
              eq(schema.directives.agentId, req.params.id),
              eq(schema.directives.userId, req.user.id),
            ),
          )
          .orderBy(desc(schema.directives.priority));
        const knowledge = await tx
          .select()
          .from(schema.knowledge)
          .where(
            and(
              eq(schema.knowledge.agentId, req.params.id),
              eq(schema.knowledge.userId, req.user.id),
            ),
          )
          .orderBy(desc(schema.knowledge.createdAt));
        return [agentRows, personalities, directives, knowledge] as const;
      },
    );
    const record = agentRows[0];
    const phoneCall = phoneCallVoiceFor(
      record?.voiceProvider === "presenter" ? record?.phoneVoiceId : record?.voiceId,
    );
    let phoneCallReady: boolean | null = null;
    if (phoneCall) {
      const [line] = await drizzle
        .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, req.user.id),
            eq(schema.phoneNumbers.agentId, req.params.id),
          ),
        )
        .limit(1);
      if (!line?.phoneNumber) phoneCallReady = false;
      else {
        try {
          phoneCallReady = Boolean(await xaiSipCredentialsFor(line.phoneNumber));
        } catch {
          phoneCallReady = false;
        }
      }
    }
    const identity = record
      ? resolveAgentVideoPresenter({
          id: req.params.id,
          name: record.name,
          role: record.role,
          isBusinessAgent: record.isBusinessAgent ?? false,
          videoPresenterProvider: record.videoPresenterProvider,
          videoPresenterAvatarId: record.videoPresenterAvatarId,
          videoPresenterConsentStatus: record.videoPresenterConsentStatus,
        })
      : null;
    res.json({
      mark_key: record?.markKey || null,
      capabilities: { image_uploads: isTrainingImageAvailable() },
      firstMessage: record?.firstMessage || null,
      openingGreeting: resolveAgentGreeting(record || {}, directives),
      role: record?.role || "customer_service",
      archetype: record?.archetype || "Assistant",
      flowConfig: record?.flowConfig || null,
      playbook: readStoredAgentPlaybook(record?.playbook),
      enabledTools: normalizeEnabledTools(record?.enabledTools),
      runtime: {
        provider: record?.llmProvider || null,
        model: record?.llmModel || null,
        temperature: record?.llmTemperature || null,
      },
      voice: {
        voiceId: record?.voiceId || null,
        provider: record?.voiceProvider || null,
        phoneVoiceId: record?.phoneVoiceId || null,
        phoneVoiceProvider: record?.phoneVoiceProvider || null,
        phoneCall,
        phoneCallReady,
      },
      personality: personalities[0]?.content || "",
      directives,
      knowledge,
      identity,
      businessProfile: record ? businessProfileView(record) : null,
    });
  },
);

router.post(
  "/api/agent-config/:id/manual",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const type = cleanText(req.body?.type, 32);
    const content = cleanText(req.body?.content, 12000);
    // Single-valued directives (today: the opening greeting) are edited, not
    // appended. Without this the directive arm was an unconditional INSERT, so
    // every re-save left the previous version in place and the agent ran on two
    // contradictory "Opening greeting:" rules while the setup panel — which
    // reads the first match — showed only one. `replacePrefix` makes the write
    // an atomic replace, and lets empty content mean "clear it", which is the
    // only way the panel could ever remove a greeting it had already saved.
    const replacePrefix = cleanText(req.body?.replacePrefix, 120);
    const isPrefixReplace = type === "directive" && replacePrefix.length > 0;
    if (!content && !isPrefixReplace) throw AppError.fromHttpStatus(400, "Content is required");
    if (isPrefixReplace && content && !content.startsWith(replacePrefix)) {
      throw AppError.fromHttpStatus(400, "Content must start with replacePrefix");
    }
    if (type === "personality") {
      await drizzle.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT ${schema.agents.id} FROM ${schema.agents} WHERE ${schema.agents.id} = ${req.params.id} AND ${schema.agents.userId} = ${req.user.id} FOR UPDATE`,
        );
        const [current] = await tx
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(
            and(
              eq(schema.personality.agentId, req.params.id),
              eq(schema.personality.userId, req.user.id),
            ),
          )
          .limit(1);
        if (removesRegulatedTemplateProvenance(current?.content, content)) {
          throw new AppError(
            409,
            "REGULATED_TEMPLATE_PROVENANCE_PROTECTED",
            "This review-required Bot's regulated template marker cannot be removed.",
          );
        }
        await tx
          .insert(schema.personality)
          .values({ agentId: req.params.id, userId: req.user.id, content })
          .onConflictDoUpdate({
            target: schema.personality.agentId,
            set: { userId: req.user.id, content },
          });
      });
    } else if (type === "directive") {
      if (isPrefixReplace) {
        await drizzle.transaction(async (tx) => {
          // Serialize replacements even when there is no directive to delete.
          // A transaction alone allows two initial saves to insert both values.
          await tx.execute(
            sql`SELECT ${schema.agents.id} FROM ${schema.agents} WHERE ${schema.agents.id} = ${req.params.id} AND ${schema.agents.userId} = ${req.user.id} FOR UPDATE`,
          );
          await tx.delete(schema.directives).where(
            and(
              eq(schema.directives.agentId, req.params.id),
              eq(schema.directives.userId, req.user.id),
              // left(...) rather than LIKE: the prefix is caller-supplied, and
              // this needs no wildcard escaping to stay correct.
              sql`left(${schema.directives.content}, ${replacePrefix.length}) = ${replacePrefix}`,
            ),
          );
          // Keep the canonical first-message value in sync so older clients
          // and non-Studio surfaces also use the confirmed greeting. Clearing
          // it restores the generated default instead of a stale old greeting.
          if (replacePrefix === OPENING_GREETING_PREFIX) {
            await tx
              .update(schema.agents)
              .set({ firstMessage: content.slice(OPENING_GREETING_PREFIX.length).trim() || null })
              .where(
                and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)),
              );
          }
          if (content) {
            await tx.insert(schema.directives).values({
              agentId: req.params.id,
              userId: req.user.id,
              content,
              priority: 5,
            });
          }
        });
      } else {
        await drizzle.insert(schema.directives).values({
          agentId: req.params.id,
          userId: req.user.id,
          content,
          priority: 5,
        });
      }
    } else if (type === "knowledge") {
      await drizzle
        .insert(schema.knowledge)
        .values({ agentId: req.params.id, userId: req.user.id, content });
    } else if (type === "flow") {
      await drizzle
        .update(schema.agents)
        .set({ flowConfig: req.body?.content })
        .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    } else {
      throw AppError.fromHttpStatus(400, "Invalid configuration type");
    }
    res.json({ success: true });
  },
);

router.patch(
  "/api/agent-config/:id/directive/:rowId",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.notFound("Agent not found");
    if (!/^[1-9]\d{0,18}$/.test(req.params.rowId)) {
      throw AppError.badRequest("Rule id must be a positive integer");
    }
    const rowId = BigInt(req.params.rowId);
    if (rowId > 9_223_372_036_854_775_807n) {
      throw AppError.badRequest("Rule id must be a positive integer");
    }
    const content = cleanText(req.body?.content, 12000);
    if (!content) throw AppError.badRequest("Rule content is required");
    if (content.startsWith(OPENING_GREETING_PREFIX)) {
      throw AppError.badRequest("Edit the opening greeting in Set Up, Details.");
    }
    // Greetings have a separate atomic save that also updates firstMessage.
    // Keep this update scoped to one ordinary rule, preserving its ID/priority.
    const [directive] = await drizzle
      .update(schema.directives)
      .set({ content })
      .where(
        and(
          eq(schema.directives.id, rowId),
          eq(schema.directives.agentId, req.params.id),
          eq(schema.directives.userId, req.user.id),
          sql`left(${schema.directives.content}, ${OPENING_GREETING_PREFIX.length}) <> ${OPENING_GREETING_PREFIX}`,
        ),
      )
      .returning({
        id: schema.directives.id,
        content: schema.directives.content,
        priority: schema.directives.priority,
      });
    if (!directive)
      throw AppError.notFound("Rule not found. Edit opening greetings in Set Up, Details.");
    res.json({ success: true, directive: { ...directive, id: String(directive.id) } });
  },
);

router.patch(
  "/api/agent-config/:id/runtime",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const provider = cleanText(req.body?.provider, 32).toLowerCase();
    const model = cleanText(req.body?.model, 160);
    const rawTemperature = req.body?.temperature;
    const temperature =
      rawTemperature == null || rawTemperature === "" ? null : Number(rawTemperature);
    if (
      temperature != null &&
      (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)
    )
      throw AppError.fromHttpStatus(400, "Temperature must be between 0 and 1");
    if (provider || model) {
      if (!(["xai", "openai"] as string[]).includes(provider))
        throw AppError.fromHttpStatus(400, "Invalid runtime provider");
      if (
        (provider === "xai" && !isXAIModelId(model)) ||
        (provider === "openai" && !isOpenAIModelId(model))
      )
        throw AppError.fromHttpStatus(400, "Choose a valid model");
    }
    await drizzle
      .update(schema.agents)
      .set({
        llmProvider: provider || null,
        llmModel: model || null,
        llmTemperature: temperature == null ? null : String(temperature),
      })
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    res.json({
      success: true,
      runtime: {
        provider: provider || null,
        model: model || null,
        temperature,
      },
    });
  },
);

router.patch(
  "/api/agent-config/:id/playbook",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const parsed = parseAgentPlaybook(req.body?.playbook);
    if (!parsed.ok) throw AppError.fromHttpStatus(400, parsed.error);
    // An empty Playbook clears the column so the runtime adds no block at all.
    const value = isPlaybookEmpty(parsed.value) ? null : parsed.value;
    await drizzle
      .update(schema.agents)
      .set({ playbook: value })
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    log.info("Bot Playbook saved", {
      agentId: req.params.id,
      exactLines: Object.keys(parsed.value.exactLines).length,
      situations: parsed.value.situations.length,
      alwaysMention: parsed.value.alwaysMention.length,
      neverSay: parsed.value.neverSay.length,
    });
    res.json({ success: true, playbook: parsed.value });
  },
);

// A few seconds of the voice phone callers hear, spoken as this Bot. Samples
// are cached per voice and Bot name, so replaying one costs nothing.
router.get(
  "/api/agent-config/:id/voice/sample",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const [agent] = await drizzle
      .select({ id: schema.agents.id, name: schema.agents.name })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const voiceId = normalizeManagedOpenAIVoiceId(
      cleanText(typeof req.query.voice === "string" ? req.query.voice : "", 40),
    );
    if (!voiceId) throw AppError.fromHttpStatus(400, "Choose one of the built-in voices.");
    const phoneCall = phoneCallVoiceFor(voiceId);
    if (!phoneCall || !isVoiceSampleAvailable()) {
      throw AppError.fromHttpStatus(409, "Voice samples are not available right now.");
    }
    let audio: Buffer;
    try {
      audio = await synthesizeVoiceSample(phoneCall.voice, agent.name);
    } catch (error) {
      log.warn("Voice sample failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(503, "That sample could not play. Try again in a moment.");
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(audio);
  },
);

router.patch(
  "/api/agent-config/:id/voice",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const requestedVoiceId = cleanText(req.body?.voiceId, 160);
    const requestedProvider = cleanText(req.body?.provider, 32).toLowerCase();
    if (requestedProvider !== "openai") {
      throw AppError.fromHttpStatus(400, "Invalid voice provider.");
    }
    const voiceId = normalizeManagedOpenAIVoiceId(requestedVoiceId);
    if (!voiceId) {
      throw AppError.fromHttpStatus(400, "Choose one of the built-in voices.");
    }

    // Legacy presenter rows remain readable by the response/runtime paths, but
    // this write endpoint is a one-way migration boundary: every successful
    // selection stores one of the ten canonical OpenAI ids as the primary
    // browser-and-phone voice and clears the retired split-phone fields.
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasPhoneVoiceId = Object.prototype.hasOwnProperty.call(body, "phoneVoiceId");
    const hasPhoneVoiceProvider = Object.prototype.hasOwnProperty.call(body, "phoneVoiceProvider");
    const requestedPhoneVoiceId = cleanText(req.body?.phoneVoiceId, 160);
    const requestedPhoneVoiceProvider = cleanText(req.body?.phoneVoiceProvider, 32).toLowerCase();
    if (
      hasPhoneVoiceProvider &&
      requestedPhoneVoiceProvider &&
      requestedPhoneVoiceProvider !== "openai"
    ) {
      throw AppError.fromHttpStatus(400, "Invalid phone voice provider.");
    }
    const normalizedPhoneVoiceId = normalizeManagedOpenAIVoiceId(requestedPhoneVoiceId);
    if (hasPhoneVoiceId && requestedPhoneVoiceId && !normalizedPhoneVoiceId) {
      throw AppError.fromHttpStatus(400, "Choose one of the built-in phone voices.");
    }
    // Picking a built-in voice is the one-tap way back to stock: it also
    // clears a cloned-voice selection, otherwise callers would keep hearing
    // the clone right after we confirmed the stock voice.
    const [current] = await drizzle
      .select({ businessVariables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    const variables =
      current?.businessVariables && typeof current.businessVariables === "object"
        ? { ...(current.businessVariables as Record<string, unknown>) }
        : null;
    const customVoiceCleared = Boolean(variables && LIVE_CUSTOM_VOICE_KEY in variables);
    if (variables) delete variables[LIVE_CUSTOM_VOICE_KEY];
    const patch: {
      voiceId: string;
      voiceProvider: "openai";
      phoneVoiceId: null;
      phoneVoiceProvider: null;
      businessVariables?: Record<string, unknown>;
    } = {
      voiceId,
      voiceProvider: "openai",
      phoneVoiceId: null,
      phoneVoiceProvider: null,
      ...(customVoiceCleared && variables ? { businessVariables: variables } : {}),
    };
    const [savedVoice] = await drizzle
      .update(schema.agents)
      .set(patch)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
      .returning({
        voiceId: schema.agents.voiceId,
        provider: schema.agents.voiceProvider,
        phoneVoiceId: schema.agents.phoneVoiceId,
        phoneVoiceProvider: schema.agents.phoneVoiceProvider,
      });
    res.json({
      success: true,
      voice: {
        voiceId: savedVoice?.voiceId ?? voiceId,
        provider: savedVoice?.provider ?? "openai",
        phoneVoiceId: savedVoice?.phoneVoiceId ?? null,
        phoneVoiceProvider: savedVoice?.phoneVoiceProvider ?? null,
        phoneCall: phoneCallVoiceFor(savedVoice?.voiceId ?? voiceId),
      },
      customVoiceCleared,
    });
  },
);

router.patch(
  "/api/agent-config/:id/business",
  authenticateUser,
  agentMutationRateLimit,
  // safeParse via middleware, not a bare .parse: a raw ZodError has no status,
  // so the global handler turned every field typo into a 500 INTERNAL_ERROR
  // with no field details — unactionable for the UI and noise for alerting.
  validateBody(AgentBusinessProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

    const parsed = req.body as z.infer<typeof AgentBusinessProfileSchema>;
    const changesHandoff =
      parsed.escalation_phone !== undefined ||
      parsed.escalation_email !== undefined ||
      parsed.escalation_handoff_enabled !== undefined;
    // A PATCH changes only the fields it sends. The hours editor sends three;
    // resetting the rest to defaults would turn off live transfer and
    // compliance settings the owner never touched.
    const patch: Partial<typeof schema.agents.$inferInsert> = {};
    if (parsed.business_hours !== undefined) {
      patch.businessHours =
        parsed.business_hours && Object.keys(parsed.business_hours).length
          ? parsed.business_hours
          : null;
    }
    if (parsed.timezone !== undefined) patch.timezone = parsed.timezone;
    if (parsed.compliance_mode !== undefined) patch.complianceMode = parsed.compliance_mode;
    if (parsed.call_recording_enabled !== undefined) {
      patch.callRecordingEnabled = parsed.call_recording_enabled;
    }
    if (parsed.disallowed_topics !== undefined) patch.disallowedTopics = parsed.disallowed_topics;
    if (parsed.escalation_keywords !== undefined) {
      patch.escalationKeywords = parsed.escalation_keywords;
    }
    if (parsed.escalation_phone !== undefined) {
      patch.escalationPhone = normalizeHandoffPhone(parsed.escalation_phone || "");
      // The editor shows the effective legacy destination. Its explicit save
      // owns that destination, so clearing it must also remove the old fallback.
      patch.transferPhone = null;
    }
    if (parsed.escalation_email !== undefined) {
      patch.escalationEmail = parsed.escalation_email || null;
    }
    if (parsed.escalation_handoff_enabled !== undefined) {
      patch.escalationHandoffEnabled = parsed.escalation_handoff_enabled;
    }
    if (parsed.business_variables !== undefined) {
      patch.businessVariables = parsed.business_variables;
    }
    if (parsed.out_of_hours_message !== undefined) {
      patch.outOfHoursMessage = parsed.out_of_hours_message?.trim() || null;
    }
    if (parsed.kpi_focus !== undefined) patch.kpiFocus = parsed.kpi_focus;
    if (parsed.is_business_agent !== undefined) patch.isBusinessAgent = parsed.is_business_agent;
    if (!Object.keys(patch).length) {
      throw AppError.fromHttpStatus(400, "Send at least one business profile field.");
    }

    const [saved] = await drizzle.transaction(async (tx) => {
      // Serialize destination reads and writes: a simultaneous clear and enable
      // must not leave live transfer enabled without a destination.
      await tx.execute(
        sql`SELECT id FROM wireline_agents WHERE id = ${req.params.id} AND user_id = ${req.user.id} FOR UPDATE`,
      );
      if (changesHandoff) {
        const [current] = await tx
          .select({
            phone: schema.agents.escalationPhone,
            legacyPhone: schema.agents.transferPhone,
            email: schema.agents.escalationEmail,
            transfer: schema.agents.escalationHandoffEnabled,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!current) throw AppError.fromHttpStatus(404, "Agent not found");
        const lines = await tx
          .select({ phone: schema.phoneNumbers.phoneNumber })
          .from(schema.phoneNumbers)
          .where(
            and(
              eq(schema.phoneNumbers.agentId, req.params.id),
              eq(schema.phoneNumbers.userId, req.user.id),
            ),
          );
        const problem = humanHandoffProblem(
          {
            phone:
              parsed.escalation_phone !== undefined
                ? parsed.escalation_phone || ""
                : current.phone || current.legacyPhone || "",
            email:
              parsed.escalation_email !== undefined
                ? parsed.escalation_email || ""
                : current.email || "",
            transfer: parsed.escalation_handoff_enabled ?? current.transfer ?? false,
            keywords: "",
          },
          lines.map((line) => line.phone),
        );
        if (problem) throw AppError.fromHttpStatus(400, problem);
      }
      return tx
        .update(schema.agents)
        .set(patch)
        .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
        .returning(BUSINESS_PROFILE_COLUMNS);
    });
    if (!saved) throw AppError.fromHttpStatus(404, "Agent not found");

    res.json({ success: true, businessProfile: businessProfileView(saved) });
  },
);

router.post(
  "/api/agent-config/:id/assets",
  authenticateUser,
  agentMutationRateLimit,
  // Paid extraction reserves the shared AI allowance after validation and ownership.
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const payload = (req.body || {}) as AssetPayload;
    const fileName = cleanText(payload.fileName, 255) || "Untitled asset";
    const mimeType = cleanText(payload.mimeType, 120).toLowerCase();
    const rawDataUrl = typeof payload.dataUrl === "string" ? payload.dataUrl.trim() : "";
    const rawFileBase64 = typeof payload.fileBase64 === "string" ? payload.fileBase64.trim() : "";

    // A base64 payload cut mid-stream is not a smaller image, it is a corrupt
    // one. Running it through the shared `cleanText` slice sent the vision model
    // malformed bytes and still answered `success: true`, so anything past the
    // ceiling has to be refused outright rather than quietly shortened.
    if (rawDataUrl.length > KNOWLEDGE_IMAGE_MAX_DATA_URL_CHARS) {
      throw AppError.fromHttpStatus(413, knowledgeAssetTooLargeMessage(fileName));
    }
    const dataUrl = rawDataUrl;
    if (rawFileBase64.length > KNOWLEDGE_DOCUMENT_MAX_BASE64_CHARS) {
      throw AppError.fromHttpStatus(413, knowledgeAssetTooLargeMessage(fileName));
    }

    // Text is different: truncating it degrades the extraction rather than
    // corrupting it, so the leading portion is still worth ingesting. What was
    // missing is the disclosure — the original length is kept so the reply can
    // say how much of the document was actually read.
    const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
    const text = rawText.slice(0, KNOWLEDGE_TEXT_EXTRACT_CHARS);

    let extraction: ExtractedConfig;
    if (text) {
      extraction = await extractTextAsset(req.user.id, fileName, text);
    } else if (
      /^image\/(png|jpe?g|webp|gif)$/.test(mimeType) &&
      dataUrl.startsWith(`data:${mimeType};base64,`)
    ) {
      extraction = await extractImageAsset(fileName, dataUrl, req.user.id);
    } else if (rawFileBase64) {
      extraction = normalizeExtraction(
        await extractKnowledgeDocumentWithOpenAI({
          userId: req.user.id,
          fileName,
          mimeType,
          fileBase64: rawFileBase64,
        }),
      );
    } else {
      throw AppError.fromHttpStatus(
        400,
        "Upload a text, PDF, DOCX, or XLSX document, or a PNG, JPG, WEBP, or GIF image.",
      );
    }
    await persistExtraction(req.params.id, req.user.id, extraction);
    const truncation = knowledgeTextTruncationNotice(rawText.length);
    res.json({
      success: true,
      summary: truncation
        ? `${extractionReply(extraction)} ${truncation}`
        : extractionReply(extraction),
      factsAdded: extraction.knowledge.length,
      rulesAdded: extraction.directives.length,
      toneUpdated: Boolean(extraction.personality),
      truncated: Boolean(truncation),
    });
  },
);

router.delete(
  "/api/agent-config/:id/:type/:rowId",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    // BigInt() throws a raw SyntaxError on anything non-numeric, which surfaced
    // as a 500 for what is a malformed path parameter.
    if (!/^\d+$/.test(req.params.rowId)) {
      throw AppError.fromHttpStatus(400, "rowId must be a positive integer");
    }
    const rowId = BigInt(req.params.rowId);
    if (req.params.type === "directive") {
      await drizzle
        .delete(schema.directives)
        .where(
          and(
            eq(schema.directives.id, rowId),
            eq(schema.directives.agentId, req.params.id),
            eq(schema.directives.userId, req.user.id),
          ),
        );
    } else if (req.params.type === "knowledge") {
      await drizzle
        .delete(schema.knowledge)
        .where(
          and(
            eq(schema.knowledge.id, rowId),
            eq(schema.knowledge.agentId, req.params.id),
            eq(schema.knowledge.userId, req.user.id),
          ),
        );
    } else {
      throw AppError.fromHttpStatus(400, "Invalid configuration type");
    }
    res.json({ success: true });
  },
);

// What deleting this Bot would release, and whether it is busy right now.
router.get(
  "/api/agents/:id/deletion",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const preview = await previewBotDeletion(req.user.id, req.params.id);
    res.json({
      name: preview.name,
      phone_numbers: preview.phoneNumbers,
      mailboxes: preview.mailboxes,
      blocked_by: preview.blockedBy,
    });
  },
);

router.delete(
  "/api/agents/:id",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.body?.confirmation !== "DELETE") {
      throw AppError.badRequest("Type DELETE to confirm deleting this Bot.");
    }
    const result = await deleteBot({ userId: req.user.id, agentId: req.params.id, ip: req.ip });
    res.json({
      deleted: true,
      phone_numbers_released: result.phoneNumbersReleased,
      mailboxes_released: result.mailboxesReleased,
    });
  },
);

router.post(
  "/api/train/extract",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agentId = cleanText(req.body?.agentId, 200);
    const message = cleanText(req.body?.message, 12000);
    if (!agentId || !message)
      throw AppError.fromHttpStatus(400, "agentId and message are required");
    if (!(await owned(agentId, req.user.id))) throw AppError.fromHttpStatus(404, "Agent not found");
    const parsed = normalizeExtraction(
      await runTrainingStructured<ExtractedConfig>({
        userId: req.user.id,
        source: "training",
        options: {
          system:
            "You are the BotBound Configuration Engine. Extract only explicit operating rules, concrete facts, and requested tone changes. Be conservative. Return empty arrays and an empty personality string when unclear.",
          user: message,
          tool: AI_TOOLS.trainingExtraction,
          complexity: "simple",
          maxTokens: 1200,
        },
      }),
    );
    await persistExtraction(agentId, req.user.id, parsed);
    res.json({
      success: true,
      responseContent: extractionReply(parsed),
      directives: parsed.directives,
      knowledge: parsed.knowledge,
      personality: parsed.personality,
      readiness: {
        rules: parsed.directives.length,
        facts: parsed.knowledge.length,
        tone: Boolean(parsed.personality),
      },
    });
  },
);

/**
 * Update which actions an agent may take.
 *
 * `POST /api/mobile/agents/:id/tools` has always been able to do this; the web
 * app never could. The one component that tried, AgentActionEngine, posted to
 * `PATCH /api/agents/:id`, a route that does not exist — which is why it was
 * never imported anywhere. The import route below can also write the column,
 * but it is an import, not a capability edit.
 *
 * Deliberately identical to the mobile contract: same ownership check, same
 * per-name validation, same normalizer, same response body. Tools reach live
 * calls through `resolveAgentTools`, so the two clients must not be able to
 * produce different stored states.
 */
router.post(
  "/api/agents/:id/tools",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!(await owned(req.params.id, req.user.id))) {
      throw AppError.fromHttpStatus(404, "Agent not found");
    }
    const raw = req.body?.enabled_tools;
    if (
      !Array.isArray(raw) ||
      raw.some((tool) => typeof tool !== "string" || !isAgentToolName(tool))
    ) {
      throw AppError.fromHttpStatus(400, "enabled_tools must contain known agent tools");
    }
    const enabledTools = normalizeEnabledTools(raw as AgentToolName[]);
    await drizzle
      .update(schema.agents)
      .set({ enabledTools })
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    res.json({ success: true, enabledTools });
  },
);

router.post(
  "/api/agents/:id/import",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const raw = req.body?.agent?.enabled_tools ?? req.body?.enabled_tools;
    if (
      !Array.isArray(raw) ||
      raw.some((tool) => typeof tool !== "string" || !isAgentToolName(tool))
    )
      throw AppError.fromHttpStatus(400, "enabled_tools must contain known agent tools");
    const enabledTools = normalizeEnabledTools(raw as AgentToolName[]);
    await drizzle
      .update(schema.agents)
      .set({ enabledTools })
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    res.json({ success: true, enabledTools });
  },
);

export default router;
