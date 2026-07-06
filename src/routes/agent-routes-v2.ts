import { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { agentMutationRateLimit } from "../middleware/api-rate-limits";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { listAgentsForUser } from "../lib/agents-store";
import { pickRotatedVoiceId } from "../data/voice-roster";
import { businessAgentVideoPresenterDefaults } from "../lib/video-presenter/liveavatar-service";
import {
  getDefaultAgentTools,
  isAgentToolName,
  normalizeEnabledTools,
  type AgentToolName,
} from "../lib/agent-capabilities";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { defaultPresenterPhoneVoicePayload } from "../lib/voice-catalog";
import { AI_TOOLS } from "../lib/ai-tools";
import {
  isGeminiModelId,
  isOpenAIModelId,
  isOpenRouterModelId,
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
} from "../lib/ai-models";
import { listOpenRouterModelsForDirector } from "../lib/openrouter-models";
import { AgentBusinessProfileSchema } from "../lib/form-validators";
import { isOwnerEmail } from "../lib/auth-service";
import { resolveAgentEntitlement } from "../lib/agent-entitlements";
import { runStructured } from "../lib/ai-structured";

const router = Router();
const roleArchetypes: Record<string, string> = {
  sales: "Sales Representative",
  scheduler: "Personal Assistant",
  appointment_scheduler: "Appointment Scheduler",
  receptionist: "Receptionist",
  customer_service: "Customer Support",
  custom: "Custom Assistant",
};

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
};

async function owned(agentId: string, userId: string) {
  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent;
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
    parts.push(
      `Saved ${parsed.knowledge.length} business fact${parsed.knowledge.length === 1 ? "" : "s"}.`,
    );
  if (parsed.personality) parts.push("Updated the tone guidance.");
  return parts.length
    ? `${parts.join(" ")} Review the saved configuration in the readiness panel.`
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
  return { directives, knowledge, personality: cleanText(raw.personality, 4000) };
}

async function persistExtraction(agentId: string, userId: string, extraction: ExtractedConfig) {
  await drizzle.transaction(async (tx) => {
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
      await tx
        .insert(schema.knowledge)
        .values(extraction.knowledge.map((item) => ({ content: item.content, agentId, userId })));
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

async function extractTextAsset(fileName: string, text: string): Promise<ExtractedConfig> {
  return normalizeExtraction(
    await runStructured<ExtractedConfig>({
      system:
        "You are the Wireline Configuration Engine. Extract only explicit operational rules, concrete business facts, and requested tone guidance from a supplied asset. Be conservative. Never invent missing information.",
      user: `Asset name: ${fileName}\n\nAsset content:\n${text}`,
      tool: AI_TOOLS.trainingExtraction,
      complexity: "simple",
      maxTokens: 1200,
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

async function extractImageAsset(fileName: string, dataUrl: string): Promise<ExtractedConfig> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw AppError.fromHttpStatus(503, "Image intake requires an OpenAI runtime key.");
  const schemaDefinition = {
    type: "object",
    additionalProperties: false,
    properties: {
      directives: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { content: { type: "string" }, priority: { type: "integer" } },
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
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_STRUCTURED_PRIMARY_MODEL,
      instructions:
        "Analyze the uploaded image only for explicit business facts, operating rules, service details, schedules, product details, or tone direction that can safely train an AI agent. Do not infer private information or create facts that are not visibly supported.",
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
    }),
  });
  if (!response.ok) throw AppError.fromHttpStatus(502, `Image intake failed (${response.status}).`);
  const output = responseText((await response.json()) as Record<string, unknown>);
  try {
    return normalizeExtraction(JSON.parse(output));
  } catch {
    throw AppError.fromHttpStatus(502, "Image intake returned an unreadable result.");
  }
}

router.get("/api/agents", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ agents: await listAgentsForUser(req.user.id) });
  } catch (error) {
    log.warn("Agent roster unavailable", { error: getErrorMessage(error), userId: req.user.id });
    res
      .status(503)
      .json({ agents: [], degraded: true, error: "Agent roster is temporarily unavailable" });
  }
});

router.get("/api/agents/roles", authenticateUser, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    roles: Object.entries(roleArchetypes).map(([id, label]) => ({ id, label })),
  });
});

router.post(
  "/api/agents",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const name = cleanText(req.body?.name, 100);
    const role = cleanText(req.body?.role, 80) || "scheduler";
    const isBusinessAgent = req.body?.is_business_agent === true;
    if (!name) throw AppError.fromHttpStatus(400, "Agent name is required");
    const [{ count }] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.agents)
      .where(eq(schema.agents.userId, req.user.id));
    const existing = Number(count || 0);

    const isOwner = isOwnerEmail(req.user.email);
    const [row] = await drizzle
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
      throw AppError.fromHttpStatus(
        402,
        `Agent capacity limit reached. Your plan allows up to ${entitlement.effectiveCap} agents.`,
      );
    }

    const id = `agent-${randomUUID()}`;
    const enabledTools = getDefaultAgentTools();
    const videoPresenter = isBusinessAgent ? businessAgentVideoPresenterDefaults() : {};
    await drizzle.insert(schema.agents).values({
      id,
      userId: req.user.id,
      name,
      role,
      channel: "voice",
      archetype: roleArchetypes[role] || "Assistant",
      voiceId: pickRotatedVoiceId(existing),
      voiceProvider: "11labs",
      enabledTools,
      firstMessage: `Hi, this is ${name}. How can I help?`,
      isBusinessAgent,
      ...videoPresenter,
    });
    res.status(201).json({
      id,
      name,
      role,
      channel: "voice",
      enabledTools,
      is_business_agent: isBusinessAgent,
    });
  },
);

router.get(
  "/api/agent-config/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const [agentRows, personalities, directives, knowledge] = await Promise.all([
      drizzle
        .select({
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          flowConfig: schema.agents.flowConfig,
          enabledTools: schema.agents.enabledTools,
          llmProvider: schema.agents.llmProvider,
          llmModel: schema.agents.llmModel,
          llmTemperature: schema.agents.llmTemperature,
          voiceId: schema.agents.voiceId,
          voiceProvider: schema.agents.voiceProvider,
          phoneVoiceId: schema.agents.phoneVoiceId,
          phoneVoiceProvider: schema.agents.phoneVoiceProvider,
          // business profile fields
          businessHours: schema.agents.businessHours,
          timezone: schema.agents.timezone,
          complianceMode: schema.agents.complianceMode,
          disallowedTopics: schema.agents.disallowedTopics,
          escalationKeywords: schema.agents.escalationKeywords,
          escalationPhone: schema.agents.escalationPhone,
          escalationEmail: schema.agents.escalationEmail,
          escalationHandoffEnabled: schema.agents.escalationHandoffEnabled,
          businessVariables: schema.agents.businessVariables,
          outOfHoursMessage: schema.agents.outOfHoursMessage,
          kpiFocus: schema.agents.kpiFocus,
          isBusinessAgent: schema.agents.isBusinessAgent,
          videoPresenterProvider: schema.agents.videoPresenterProvider,
          videoPresenterAvatarId: schema.agents.videoPresenterAvatarId,
          videoPresenterConsentStatus: schema.agents.videoPresenterConsentStatus,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
        .limit(1),
      drizzle
        .select({ content: schema.personality.content })
        .from(schema.personality)
        .where(
          and(
            eq(schema.personality.agentId, req.params.id),
            eq(schema.personality.userId, req.user.id),
          ),
        )
        .limit(1),
      drizzle
        .select()
        .from(schema.directives)
        .where(
          and(
            eq(schema.directives.agentId, req.params.id),
            eq(schema.directives.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.directives.priority)),
      drizzle
        .select()
        .from(schema.knowledge)
        .where(
          and(
            eq(schema.knowledge.agentId, req.params.id),
            eq(schema.knowledge.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.knowledge.createdAt)),
    ]);
    const record = agentRows[0];
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
      role: record?.role || "customer_service",
      archetype: record?.archetype || "Assistant",
      flowConfig: record?.flowConfig || null,
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
      },
      personality: personalities[0]?.content || "",
      directives,
      knowledge,
      identity,
      businessProfile: record
        ? {
            business_hours: record.businessHours || null,
            timezone: record.timezone || "UTC",
            compliance_mode: record.complianceMode || "none",
            disallowed_topics: record.disallowedTopics || [],
            escalation_keywords: record.escalationKeywords || [],
            escalation_phone: record.escalationPhone || null,
            escalation_email: record.escalationEmail || null,
            escalation_handoff_enabled: record.escalationHandoffEnabled ?? false,
            business_variables: record.businessVariables || null,
            out_of_hours_message: record.outOfHoursMessage || null,
            kpi_focus: record.kpiFocus || null,
            is_business_agent: record.isBusinessAgent ?? false,
          }
        : null,
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
    if (!content) throw AppError.fromHttpStatus(400, "Content is required");
    if (type === "personality") {
      await drizzle
        .insert(schema.personality)
        .values({ agentId: req.params.id, userId: req.user.id, content })
        .onConflictDoUpdate({
          target: schema.personality.agentId,
          set: { userId: req.user.id, content },
        });
    } else if (type === "directive") {
      await drizzle
        .insert(schema.directives)
        .values({ agentId: req.params.id, userId: req.user.id, content, priority: 5 });
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

router.get(
  "/api/agents/openrouter-models",
  authenticateUser,
  async (_req: AuthenticatedRequest, res: Response) => {
    const { enabled, catalog } = await listOpenRouterModelsForDirector();
    res.json({
      enabled,
      models: catalog.map((model) => ({
        id: model.id,
        label: model.label,
        description: model.description,
        category: model.category,
      })),
    });
  },
);

router.get(
  "/api/agents/voice-models",
  authenticateUser,
  async (_req: AuthenticatedRequest, res: Response) => {
    const { catalog } = await listOpenRouterModelsForDirector();
    res.json({
      tenantDefaultProvider: VAPI_TENANT_DEFAULT_PROVIDER,
      tenantDefaultModel: VAPI_TENANT_DEFAULT_MODEL,
      options: catalog.map((model) => ({
        provider: "openrouter",
        model: model.id,
        label: model.label,
        speed: "balanced" as const,
        envKey: "OPENROUTER_API_KEY",
      })),
    });
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
      if (provider === "openai" && !isOpenAIModelId(model))
        throw AppError.fromHttpStatus(400, "Choose a valid OpenAI model");
      if (provider === "google" && !isGeminiModelId(model))
        throw AppError.fromHttpStatus(400, "Choose a valid Gemini model");
      if (provider === "openrouter" && !isOpenRouterModelId(model))
        throw AppError.fromHttpStatus(400, "Enter a valid OpenRouter provider/model ID");
      if (!(["openai", "google", "openrouter"] as string[]).includes(provider))
        throw AppError.fromHttpStatus(400, "Invalid runtime provider");
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
      runtime: { provider: provider || null, model: model || null, temperature },
    });
  },
);

router.patch(
  "/api/agent-config/:id/voice",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const [voiceState] = await drizzle
      .select({
        phoneVoiceId: schema.agents.phoneVoiceId,
        phoneVoiceProvider: schema.agents.phoneVoiceProvider,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    const voiceId = cleanText(req.body?.voiceId, 160) || null;
    const providerRaw =
      cleanText(req.body?.provider, 32).toLowerCase() || (voiceId ? "11labs" : null);
    const allowedProviders = new Set(["11labs", "xai", "vapi", "presenter"]);
    if (providerRaw && !allowedProviders.has(providerRaw)) {
      throw AppError.fromHttpStatus(400, "Invalid voice provider.");
    }
    const provider = providerRaw;
    const phoneVoiceId = cleanText(req.body?.phoneVoiceId, 160) || null;
    const phoneVoiceProviderRaw = cleanText(req.body?.phoneVoiceProvider, 32).toLowerCase() || null;
    const phoneProviders = new Set(["11labs", "vapi"]);
    if (phoneVoiceProviderRaw && !phoneProviders.has(phoneVoiceProviderRaw)) {
      throw AppError.fromHttpStatus(400, "Invalid phone voice provider.");
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasPhoneVoiceId = Object.prototype.hasOwnProperty.call(body, "phoneVoiceId");
    const hasPhoneVoiceProvider = Object.prototype.hasOwnProperty.call(body, "phoneVoiceProvider");
    const patch: {
      voiceId: string | null;
      voiceProvider: string | null;
      phoneVoiceId?: string | null;
      phoneVoiceProvider?: string | null;
    } = { voiceId, voiceProvider: provider };

    if (provider !== "presenter") {
      patch.phoneVoiceId = null;
      patch.phoneVoiceProvider = null;
    } else if (hasPhoneVoiceId || hasPhoneVoiceProvider) {
      if (hasPhoneVoiceId) patch.phoneVoiceId = phoneVoiceId;
      if (hasPhoneVoiceProvider) patch.phoneVoiceProvider = phoneVoiceProviderRaw;
    } else if (!voiceState?.phoneVoiceId || !voiceState?.phoneVoiceProvider) {
      const defaults = defaultPresenterPhoneVoicePayload();
      patch.phoneVoiceId = defaults.phoneVoiceId;
      patch.phoneVoiceProvider = defaults.phoneVoiceProvider;
    }
    await drizzle
      .update(schema.agents)
      .set(patch)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
    res.json({
      success: true,
      voice: {
        voiceId,
        provider,
        phoneVoiceId:
          patch.phoneVoiceId !== undefined
            ? patch.phoneVoiceId
            : (voiceState?.phoneVoiceId ?? null),
        phoneVoiceProvider:
          patch.phoneVoiceProvider !== undefined
            ? patch.phoneVoiceProvider
            : (voiceState?.phoneVoiceProvider ?? null),
      },
    });
  },
);

router.patch(
  "/api/agent-config/:id/business",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

    const parsed = AgentBusinessProfileSchema.parse(req.body);

    await drizzle
      .update(schema.agents)
      .set({
        businessHours: parsed.business_hours || null,
        timezone: parsed.timezone || "UTC",
        complianceMode: parsed.compliance_mode || "none",
        disallowedTopics: parsed.disallowed_topics || [],
        escalationKeywords: parsed.escalation_keywords || [],
        escalationPhone: parsed.escalation_phone || null,
        escalationEmail: parsed.escalation_email || null,
        escalationHandoffEnabled: parsed.escalation_handoff_enabled ?? false,
        businessVariables: parsed.business_variables || null,
        outOfHoursMessage: parsed.out_of_hours_message || null,
        kpiFocus: parsed.kpi_focus || null,
        isBusinessAgent: parsed.is_business_agent ?? false,
      })
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));

    res.json({
      success: true,
      businessProfile: {
        business_hours: parsed.business_hours || null,
        timezone: parsed.timezone || "UTC",
        compliance_mode: parsed.compliance_mode || "none",
        disallowed_topics: parsed.disallowed_topics || [],
        escalation_keywords: parsed.escalation_keywords || [],
        escalation_phone: parsed.escalation_phone || null,
        escalation_email: parsed.escalation_email || null,
        escalation_handoff_enabled: parsed.escalation_handoff_enabled ?? false,
        business_variables: parsed.business_variables || null,
        out_of_hours_message: parsed.out_of_hours_message || null,
        kpi_focus: parsed.kpi_focus || null,
        is_business_agent: parsed.is_business_agent ?? false,
      },
    });
  },
);

router.post(
  "/api/agent-config/:id/assets",
  authenticateUser,
  agentMutationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const payload = (req.body || {}) as AssetPayload;
    const fileName = cleanText(payload.fileName, 255) || "Untitled asset";
    const mimeType = cleanText(payload.mimeType, 120).toLowerCase();
    const text = cleanText(payload.text, 28000);
    const dataUrl = cleanText(payload.dataUrl, 5_600_000);
    let extraction: ExtractedConfig;
    if (text) {
      extraction = await extractTextAsset(fileName, text);
    } else if (
      /^image\/(png|jpe?g|webp|gif)$/.test(mimeType) &&
      dataUrl.startsWith(`data:${mimeType};base64,`)
    ) {
      extraction = await extractImageAsset(fileName, dataUrl);
    } else {
      throw AppError.fromHttpStatus(
        400,
        "Upload a text document or a PNG, JPG, WEBP, or GIF image.",
      );
    }
    await persistExtraction(req.params.id, req.user.id, extraction);
    res.json({
      success: true,
      summary: extractionReply(extraction),
      factsAdded: extraction.knowledge.length,
      rulesAdded: extraction.directives.length,
      toneUpdated: Boolean(extraction.personality),
    });
  },
);

router.delete(
  "/api/agent-config/:id/:type/:rowId",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await owned(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
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
      await runStructured<ExtractedConfig>({
        system:
          "You are the Wireline Configuration Engine. Extract only explicit operational rules, concrete business facts, and requested tone changes. Be conservative. Return empty arrays and an empty personality string when unclear.",
        user: message,
        tool: AI_TOOLS.trainingExtraction,
        complexity: "simple",
        maxTokens: 1200,
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
