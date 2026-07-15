/* eslint-disable @typescript-eslint/no-explicit-any */
import { desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { buildRoleToolDefsForTenant } from "./vapi-helpers";
import {
  getVoiceLatencyProfile,
  resolveOutboundStartSpeakingPlan,
  resolveVapiSpeechPipeline,
  VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
} from "./voice-agent-profile";
import {
  clampVoiceTemperature,
  resolveVapiVoiceModelSelection,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
} from "./ai-models";
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

  const modelSelection = resolveVapiVoiceModelSelection({
    provider:
      configured.llmProvider || userSettings?.voiceLlmProvider || VAPI_TENANT_DEFAULT_PROVIDER,
    model: configured.llmModel || userSettings?.voiceLlmModel || VAPI_TENANT_DEFAULT_MODEL,
  });
  const requestedVoice = isOutbound
    ? configured.voiceIdOutbound || configured.voiceId
    : configured.voiceIdInbound || configured.voiceId;
  const voiceId = isManagedVapiVoiceId(requestedVoice)
    ? requestedVoice
    : DEFAULT_MANAGED_VOICE_ID;
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
  const systemPrompt = [
    `You are ${configured.name}, a Wireline ${configured.role || "agent"}.`,
    "Be accurate, concise, kind, and action-oriented. Never invent business facts, prices, availability, or commitments.",
    "When an action is outside your permissions or confidence, clearly explain the limitation and escalate to a human.",
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
  const finalSystemPrompt = isGrokModelId(modelSelection.model)
    ? `${systemPrompt}\n\n${buildGrokStrengthsPromptSection()}`
    : systemPrompt;

  return {
    name: configured.name,
    firstMessage: configured.firstMessage || `Hi, this is ${configured.name}. How can I help?`,
    ...(isOutbound ? { firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE } : {}),
    model: {
      provider: modelSelection.provider,
      model: modelSelection.model,
      ...(modelSelection.fallbackModels?.length
        ? { fallbackModels: modelSelection.fallbackModels }
        : {}),
      systemPrompt: finalSystemPrompt,
      temperature: clampVoiceTemperature(configured.llmTemperature, 0.3),
    },
    voice: {
      provider: "vapi" as const,
      voiceId,
      ...(vapiVoiceVersion(voiceId) ? { version: vapiVoiceVersion(voiceId) } : {}),
    },
    transcriber: speech.transcriber,
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
    functions: await buildRoleToolDefsForTenant(
      configured.role || "customer_service",
      configured.enabledTools,
      agent.user_id,
      userSettings?.aiTier,
      {
        twilioMessaging: !!userSettings?.twilioMessagingEnabled,
        twilioLookup: !!userSettings?.twilioLookupEnabled,
      },
    ),
    analysisPlan: {
      summaryPrompt:
        "Summarize the call in 2-3 sentences with caller intent, agent action, and committed follow-up.",
      structuredDataPrompt: "Extract caller intent, outcome, commitments, and sentiment as JSON.",
    },
  };
}
