/* eslint-disable @typescript-eslint/no-explicit-any */
import { desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { buildRoleToolDefsForTenant } from "./vapi-helpers";
import { toVapiFunctionTools } from "./vapi-tool-format";
import { buildVapiServerConfig } from "./vapi-server-config";
import {
  getVoiceLatencyProfile,
  resolveOutboundStartSpeakingPlan,
  resolveVapiSpeechPipeline,
  VAPI_MAX_INBOUND_CALL_SECONDS,
  VAPI_MAX_OUTBOUND_CALL_SECONDS,
  VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
} from "./voice-agent-profile";
import {
  buildAgentRuntimeContext,
  resolveAssistantBasePrompt,
  type AgentRuntimeProfile,
} from "./agent-runtime";
import { clampVoiceTemperature, resolveCoherentVoiceModel } from "./ai-models";
import { buildGrokStrengthsPromptSection, isGrokModelId } from "./grok-features";
import { vapiVoiceVersion } from "./voice-catalog";
import { DEFAULT_MANAGED_VOICE_ID, isManagedVapiVoiceId } from "../data/voice-roster";

export interface AssistantRequestPayload {
  message: { type: string; call?: any };
  agent: { id: string; user_id: string };
  userSettings: any;
}

const promptItem = (prefix: string, values: Array<{ content?: string | null }>) =>
  values
    .map((value) => value.content?.trim())
    .filter(Boolean)
    .map((value) => `- ${value}`)
    .join("\n")
    ? `\n## ${prefix}\n${values
        .map((value) => value.content?.trim())
        .filter(Boolean)
        .map((value) => `- ${value}`)
        .join("\n")}\n`
    : "";

export async function buildVapiAssistant({
  message,
  agent,
  userSettings,
}: AssistantRequestPayload) {
  const agentId = agent.id;
  const isOutbound =
    message.type === "outboundPhoneCall" || message.call?.type === "outboundPhoneCall";
  const [agentRows, directives, knowledge, personalityRows] = await Promise.all([
    drizzle.select().from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1),
    drizzle
      .select({ content: schema.directives.content })
      .from(schema.directives)
      .where(eq(schema.directives.agentId, agentId))
      .orderBy(desc(schema.directives.priority))
      .limit(40),
    drizzle
      .select({ content: schema.knowledge.content })
      .from(schema.knowledge)
      .where(eq(schema.knowledge.agentId, agentId))
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(80),
    drizzle
      .select({ content: schema.personality.content })
      .from(schema.personality)
      .where(eq(schema.personality.agentId, agentId))
      .limit(1),
  ]);
  const configured = agentRows[0];
  if (!configured) throw new Error("Agent not found for Vapi assistant request");

  // Coherent (provider, model) pair — agent brain first, tenant default
  // second — so a partially-configured agent never crosses its provider with
  // the tenant's model and collapses to the managed default.
  const modelSelection = resolveCoherentVoiceModel(configured, userSettings);
  const requestedVoice = isOutbound
    ? configured.voiceIdOutbound || configured.voiceId
    : configured.voiceIdInbound || configured.voiceId;
  const voiceId = isManagedVapiVoiceId(requestedVoice) ? requestedVoice : DEFAULT_MANAGED_VOICE_ID;
  const speech = resolveVapiSpeechPipeline();
  const latency = getVoiceLatencyProfile({
    archetype: configured.archetype || undefined,
    role: configured.role || undefined,
    isOutbound,
  });
  const personality = personalityRows[0]?.content?.trim();
  const flow = Array.isArray(configured.flowConfig)
    ? (configured.flowConfig as Array<{
        name?: string;
        instructions?: string;
        transitionCondition?: string;
        isEndNode?: boolean;
      }>)
    : [];
  const flowBlock = flow.length
    ? `\n## CALL FLOW\n${flow.map((step, index) => `${index + 1}. ${step.name || "Stage"}: ${step.instructions || ""}${step.transitionCondition ? ` (advance when ${step.transitionCondition})` : ""}${step.isEndNode ? " (end call after completion)" : ""}`).join("\n")}\n`
    : "";
  const identityBlock = [
    `You are ${configured.name}, a Wireline ${configured.role || "agent"}.`,
    "Be accurate, concise, kind, and action-oriented. Never invent business facts, prices, availability, or commitments.",
    "When an action is outside your permissions or confidence, clearly explain the limitation and escalate to a human.",
  ].join("\n");
  const callSpecificContext = [
    personality ? `\n## TONE\n${personality}\n` : "",
    promptItem("OPERATING RULES", directives),
    promptItem("APPROVED TRAINING", knowledge),
    flowBlock,
    configured.escalationPhone || configured.escalationEmail
      ? "\n## ESCALATION\nEscalate when the caller requests a human, a policy exception, legal/medical/financial advice, a final price, or anything not covered by approved Training.\n"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  // Account Holder override replaces the auto-composed identity but keeps the
  // call-specific context (tone, rules, training, flow, escalation) appended.
  const basePrompt = resolveAssistantBasePrompt({
    override: configured.systemPromptOverride,
    autoComposedPrompt: [identityBlock, callSpecificContext].filter(Boolean).join("\n"),
    callSpecificContext,
  });
  // Layer the runtime guardrails (compliance disclosure, do-not-discuss,
  // escalation keywords, KPI focus, personality vibe, voice consistency,
  // business-variable substitution) exactly as the outbound path does — an
  // override can never silently drop them.
  const runtimeProfile: AgentRuntimeProfile = {
    timezone: configured.timezone,
    business_hours: configured.businessHours as AgentRuntimeProfile["business_hours"],
    compliance_mode: configured.complianceMode,
    disallowed_topics: configured.disallowedTopics,
    escalation_keywords: configured.escalationKeywords,
    business_variables: configured.businessVariables as AgentRuntimeProfile["business_variables"],
    out_of_hours_message: configured.outOfHoursMessage,
    kpi_focus: configured.kpiFocus,
    personality_vibe: configured.personalityVibe,
  };
  const runtime = buildAgentRuntimeContext(basePrompt, runtimeProfile);
  // Inbound callers are already on the line when the business is closed, so
  // out-of-hours never refuses the call — it switches the agent into
  // message-taking mode and opens with the Account Holder's after-hours line.
  const afterHours = !isOutbound && !runtime.inHours;
  const systemPrompt = afterHours
    ? `${runtime.prompt}\n\n## AFTER-HOURS MODE\nThe business is currently closed. Let the caller know, take a complete message (name, number, reason for calling), promise a follow-up during business hours, and do NOT commit to appointments, prices, or actions that require the business to be open.`
    : runtime.prompt;
  const finalSystemPrompt = isGrokModelId(modelSelection.model)
    ? `${systemPrompt}\n\n${buildGrokStrengthsPromptSection()}`
    : systemPrompt;
  const afterHoursGreeting = afterHours
    ? runtime.outOfHoursMessage ||
      `Hi, you've reached ${configured.name}. We're currently closed, but I can take a message and make sure the right person follows up.`
    : null;
  const functionTools = toVapiFunctionTools(
    await buildRoleToolDefsForTenant(
      configured.role || "customer_service",
      configured.enabledTools,
      agent.user_id,
      userSettings?.aiTier,
      {
        twilioMessaging: !!userSettings?.twilioMessagingEnabled,
        twilioLookup: !!userSettings?.twilioLookupEnabled,
      },
    ),
  );
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const webhookServer = appUrl
    ? buildVapiServerConfig(`${appUrl}/api/vapi-webhook?agentId=${encodeURIComponent(agentId)}`)
    : undefined;

  return {
    name: configured.name,
    firstMessage:
      afterHoursGreeting ||
      configured.firstMessage ||
      `Hi, this is ${configured.name}. How can I help?`,
    ...(isOutbound ? { firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE } : {}),
    maxDurationSeconds: isOutbound ? VAPI_MAX_OUTBOUND_CALL_SECONDS : VAPI_MAX_INBOUND_CALL_SECONDS,
    model: {
      provider: modelSelection.provider,
      model: modelSelection.model,
      ...(modelSelection.fallbackModels?.length
        ? { fallbackModels: modelSelection.fallbackModels }
        : {}),
      systemPrompt: finalSystemPrompt,
      temperature: clampVoiceTemperature(configured.llmTemperature, 0.3),
      tools: functionTools,
    },
    voice: {
      provider: "vapi" as const,
      voiceId,
      ...(vapiVoiceVersion(voiceId) ? { version: vapiVoiceVersion(voiceId) } : {}),
    },
    transcriber: speech.transcriber,
    ...(webhookServer ? { server: webhookServer } : {}),
    startSpeakingPlan: isOutbound
      ? resolveOutboundStartSpeakingPlan(speech)
      : speech.startSpeakingPlan,
    silenceTimeoutSeconds: configured.silenceTimeoutSeconds || latency.silenceTimeoutSeconds,
    responseDelaySeconds: latency.responseDelaySeconds,
    numWordsToInterruptAssistant: latency.numWordsToInterruptAssistant,
    backgroundDenoisingEnabled: false,
    backchannelingEnabled: true,
    recordingEnabled: configured.complianceMode !== "hipaa",
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "conversation-update",
      "tool-calls",
      "speech-update",
    ],
    clientMessages: ["transcript", "hang", "function-call", "speech-update", "conversation-update"],
    analysisPlan: {
      summaryPrompt:
        "Summarize the call in 2-3 sentences with caller intent, agent action, and committed follow-up.",
      structuredDataPrompt: "Extract caller intent, outcome, commitments, and sentiment as JSON.",
      successEvaluationPrompt:
        "Did the agent accomplish the caller's primary goal or the configured call objective? Consider resolution, correct escalation, and follow-through commitments.",
    },
  };
}
