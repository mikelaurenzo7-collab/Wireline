/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import {
  buildRoleToolDefsForTenant,
  clampRuntimePromptPreservingTail,
  MAX_RUNTIME_DIRECTIVES,
  MAX_RUNTIME_KNOWLEDGE,
  truncateRuntimeSnippet,
} from "./vapi-helpers";
import { toVapiFunctionTools } from "./vapi-tool-format";
import { buildVapiServerConfig } from "./vapi-server-config";
import {
  getVoiceLatencyProfile,
  resolveOutboundStartSpeakingPlan,
  resolveVapiSpeechPipeline,
  VAPI_ANALYSIS_PLAN,
  VAPI_MAX_INBOUND_CALL_SECONDS,
  VAPI_MAX_OUTBOUND_CALL_SECONDS,
  VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
  VAPI_STOP_SPEAKING_PLAN,
} from "./voice-agent-profile";
import {
  buildAgentRuntimeContext,
  complianceFirstMessagePrefix,
  resolveAssistantBasePrompt,
  type AgentRuntimeProfile,
} from "./agent-runtime";
import { clampVoiceTemperature, resolveCoherentVoiceModel } from "./ai-models";
import {
  buildGrokStrengthsPromptSection,
  isGrokModelId,
} from "./grok-features";
import { resolvePstnVoiceCandidate } from "../data/voice-roster";
import {
  buildManagedVoiceRuntime,
  isCuratedElevenLabsVoiceId,
} from "./managed-voice-runtime";
import { sanitizeAmbientNoise } from "./workspace-planner";

export interface AssistantRequestPayload {
  message: { type: string; call?: any };
  agent: { id: string; user_id: string };
  userSettings: any;
}

const promptItem = (
  prefix: string,
  values: Array<{ content?: string | null }>,
) => {
  const lines = values
    .map((value) => truncateRuntimeSnippet(value.content || ""))
    .filter(Boolean)
    .map((value) => `- ${value}`);
  return lines.length ? `\n## ${prefix}\n${lines.join("\n")}\n` : "";
};

const LIVE_CALL_EXECUTION_PROTOCOL = `
## LIVE CALL DECISION STANDARD
- Identify the caller's actual goal before acting. If the request, destination, identity, amount, item, or timing is ambiguous, ask one focused clarification question.
- Do not ask for information the caller already supplied. Repeat back email addresses, phone numbers, dates, amounts, appointment details, and material changes immediately before the relevant write action.
- Use the narrowest relevant tool as soon as you have the required information. Independent lookups may run together; dependent actions must run in order.
- While a tool is running, do not generate duplicate filler after the tool's automatic acknowledgement.
- Say an email, message, booking, cancellation, account change, payment link, contract, CRM update, or other action completed ONLY when the tool result explicitly confirms success.
- If a tool fails, times out, is unavailable, or cannot safely verify idempotency, state that plainly. Never imply it was sent, queued, booked, changed, or completed. Offer a safe retry, another channel, or a confirmed follow-up task.
- Keep most turns to one to three natural sentences and one question. Let the caller interrupt, then address the new intent instead of finishing the old script.
- Before closing, recap confirmed actions and unresolved items in one concise sentence.
`;

export async function buildVapiAssistant({
  message,
  agent,
  userSettings,
}: AssistantRequestPayload) {
  const agentId = agent.id;
  const isOutbound =
    message.type === "outboundPhoneCall" ||
    message.call?.type === "outboundPhoneCall";
  const [agentRows, directives, knowledge, personalityRows] =
    await drizzle.transaction((tx) =>
      Promise.all([
        tx
          .select()
          .from(schema.agents)
          .where(eq(schema.agents.id, agentId))
          .limit(1),
        tx
          .select({ content: schema.directives.content })
          .from(schema.directives)
          .where(eq(schema.directives.agentId, agentId))
          .orderBy(desc(schema.directives.priority))
          .limit(MAX_RUNTIME_DIRECTIVES),
        tx
          .select({ content: schema.knowledge.content })
          .from(schema.knowledge)
          .where(eq(schema.knowledge.agentId, agentId))
          .orderBy(desc(schema.knowledge.createdAt))
          .limit(MAX_RUNTIME_KNOWLEDGE),
        tx
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(eq(schema.personality.agentId, agentId))
          .limit(1),
      ]),
    );
  const configured = agentRows[0];
  if (!configured)
    throw new Error("Agent not found for Vapi assistant request");

  // Coherent (provider, model) pair — agent brain first, tenant default
  // second — so a partially-configured agent never crosses its provider with
  // the tenant's model and collapses to the managed default.
  const modelSelection = resolveCoherentVoiceModel(configured, userSettings);
  // Presenter/live-voice agents store a non-Vapi studio voice; their dedicated
  // PSTN pick (phone_voice_id) applies before the roster default.
  const requestedVoice = resolvePstnVoiceCandidate(
    isOutbound
      ? configured.voiceIdOutbound || configured.voiceId
      : configured.voiceIdInbound || configured.voiceId,
    configured.phoneVoiceId,
  );
  let approvedClone = false;
  if (
    configured.voiceProvider === "11labs" &&
    requestedVoice &&
    !isCuratedElevenLabsVoiceId(requestedVoice)
  ) {
    const [clone] = await drizzle
      .select({ voiceId: schema.clonedVoices.voiceId })
      .from(schema.clonedVoices)
      .where(
        and(
          eq(schema.clonedVoices.voiceId, requestedVoice),
          eq(schema.clonedVoices.userId, configured.userId),
          eq(schema.clonedVoices.status, "approved"),
        ),
      )
      .limit(1);
    approvedClone = Boolean(clone);
  }
  const voiceRuntime = buildManagedVoiceRuntime({
    voiceProvider: configured.voiceProvider,
    voiceId: requestedVoice,
    approvedClone,
    voiceSpeed: configured.voiceSpeed,
    voiceStability: configured.voiceStability,
    voiceSimilarityBoost: configured.voiceSimilarityBoost,
    voiceStyle: configured.voiceStyle,
    voiceSpeakerBoost: configured.voiceSpeakerBoost,
    fallbackVoiceId: configured.phoneVoiceId,
  });
  const speech = resolveVapiSpeechPipeline();
  const latency = getVoiceLatencyProfile({
    archetype: configured.archetype || undefined,
    role: configured.role || undefined,
    isOutbound,
  });
  const personality = truncateRuntimeSnippet(
    personalityRows[0]?.content || "",
    1_200,
  );
  const flow = Array.isArray(configured.flowConfig)
    ? (
        configured.flowConfig as Array<{
          name?: string;
          instructions?: string;
          transitionCondition?: string;
          isEndNode?: boolean;
        }>
      ).slice(0, 12)
    : [];
  const flowBlock = flow.length
    ? `\n## CALL FLOW\n${flow
        .map(
          (step, index) =>
            `${index + 1}. ${truncateRuntimeSnippet(step.name || "Stage", 80)}: ${truncateRuntimeSnippet(step.instructions || "", 360)}${
              step.transitionCondition
                ? ` (advance when ${truncateRuntimeSnippet(step.transitionCondition, 180)})`
                : ""
            }${step.isEndNode ? " (end call after completion)" : ""}`,
        )
        .join("\n")}\n`
    : "";
  const isBusinessAgent = configured.isBusinessAgent !== false;
  const identityBlock = isBusinessAgent
    ? [
        `You are ${configured.name}, a Wireline ${configured.role || "agent"}.`,
        "Be accurate, concise, kind, and action-oriented. Never invent business facts, prices, availability, or commitments.",
        "When an action is outside your permissions or confidence, clearly explain the limitation and escalate to a human.",
      ].join("\n")
    : [
        `You are ${configured.name}, a personal Wireline agent for your principal.`,
        "Be accurate, concise, discreet, and protective of their time. Never invent personal facts, schedule commitments, or private details.",
        "Represent your principal professionally. When something is outside your authority, say so and offer to relay a message or escalate.",
        "Default to privacy: do not volunteer address, family, health, finances, or schedule details unless required for the immediate task.",
      ].join("\n");
  const callSpecificContext = [
    LIVE_CALL_EXECUTION_PROTOCOL,
    personality ? `\n## TONE\n${personality}\n` : "",
    promptItem("OPERATING RULES", directives),
    promptItem("APPROVED TRAINING", knowledge),
    flowBlock,
    configured.escalationPhone || configured.escalationEmail
      ? isBusinessAgent
        ? "\n## ESCALATION\nEscalate when the caller requests a human, a policy exception, legal/medical/financial advice, a final price, or anything not covered by approved Training.\n"
        : "\n## ESCALATION\nEscalate when the caller is urgent, distressed, asks for your principal by name with a time-sensitive matter, or anything exceeds your approved personal preferences.\n"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  // Account Holder override replaces the auto-composed identity but keeps the
  // call-specific context (tone, rules, training, flow, escalation) appended.
  const basePrompt = resolveAssistantBasePrompt({
    override: configured.systemPromptOverride,
    autoComposedPrompt: [identityBlock, callSpecificContext]
      .filter(Boolean)
      .join("\n"),
    callSpecificContext,
  });
  // Layer the runtime guardrails (compliance disclosure, do-not-discuss,
  // escalation keywords, KPI focus, personality vibe, voice consistency,
  // business-variable substitution) exactly as the outbound path does — an
  // override can never silently drop them.
  const runtimeProfile: AgentRuntimeProfile = {
    timezone: configured.timezone,
    business_hours:
      configured.businessHours as AgentRuntimeProfile["business_hours"],
    compliance_mode: configured.complianceMode,
    disallowed_topics: configured.disallowedTopics,
    escalation_keywords: configured.escalationKeywords,
    business_variables:
      configured.businessVariables as AgentRuntimeProfile["business_variables"],
    out_of_hours_message: configured.outOfHoursMessage,
    kpi_focus: configured.kpiFocus,
    personality_vibe: configured.personalityVibe,
  };
  const runtime = buildAgentRuntimeContext(basePrompt, runtimeProfile);
  // Inbound callers are already on the line when the business is closed, so
  // out-of-hours never refuses the call — it switches the agent into durable
  // message-taking mode rather than promising an unrecorded human follow-up.
  const afterHours = !isOutbound && !runtime.inHours;
  const systemPrompt = afterHours
    ? isBusinessAgent
      ? `${runtime.prompt}\n\n## AFTER-HOURS MODE\nThe business is currently closed. Let the caller know and collect a complete message: name, number, reason for calling, and urgency. Use create_followup_task before closing. Promise follow-up only if that tool explicitly confirms the task was created; otherwise say the message could not be recorded and offer another contact channel. Do NOT commit to appointments, prices, or actions that require the business to be open.`
      : `${runtime.prompt}\n\n## QUIET-HOURS MODE\nYour principal is not available right now. Let the caller know and collect a complete message: name, number, reason for calling, and urgency. Use create_followup_task before closing. Promise a relay only if that tool explicitly confirms the task was created; otherwise say the message could not be recorded and offer another contact channel. Do NOT commit to appointments or personal details you are not cleared to share.`
    : runtime.prompt;
  const augmentedSystemPrompt = isGrokModelId(modelSelection.model)
    ? `${systemPrompt}\n\n${buildGrokStrengthsPromptSection()}`
    : systemPrompt;
  const finalSystemPrompt = clampRuntimePromptPreservingTail(
    augmentedSystemPrompt,
  );
  const afterHoursGreeting = afterHours
    ? runtime.outOfHoursMessage ||
      (isBusinessAgent
        ? `Hi, you've reached ${configured.name}. We're currently closed, but I can take a message for the team.`
        : `Hi, you've reached ${configured.name}. They're not available right now, but I can take a message for them.`)
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
    ? buildVapiServerConfig(
        `${appUrl}/api/vapi-webhook?agentId=${encodeURIComponent(agentId)}`,
      )
    : undefined;

  // Spoken disclosure is part of the actual first message, not only a prompt
  // instruction: every outbound AI call identifies the automation and responsible
  // business, and every recorded call receives a recording notice.
  const recordingEnabled = configured.complianceMode !== "hipaa";
  const disclosurePrefix = complianceFirstMessagePrefix(
    configured.complianceMode,
    userSettings?.businessName || configured.name,
    { outboundAiCall: isOutbound, recordingEnabled },
  );
  return {
    name: configured.name,
    firstMessage:
      disclosurePrefix +
      (afterHoursGreeting ||
        configured.firstMessage ||
        `Hi, this is ${configured.name}. How can I help?`),
    ...(isOutbound
      ? { firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE }
      : {}),
    maxDurationSeconds: isOutbound
      ? VAPI_MAX_OUTBOUND_CALL_SECONDS
      : VAPI_MAX_INBOUND_CALL_SECONDS,
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
    voice: voiceRuntime,
    transcriber: speech.transcriber,
    ...(webhookServer ? { server: webhookServer } : {}),
    startSpeakingPlan: isOutbound
      ? resolveOutboundStartSpeakingPlan(speech)
      : speech.startSpeakingPlan,
    stopSpeakingPlan: VAPI_STOP_SPEAKING_PLAN,
    // Vapi's silenceTimeoutSeconds ENDS the call after that much continuous
    // caller silence (documented minimum 10, default 30) — it is not a
    // turn-taking nudge window. Send it only when the column carries an
    // explicit, valid end-call timeout; otherwise use Vapi's default.
    ...(typeof configured.silenceTimeoutSeconds === "number" &&
    configured.silenceTimeoutSeconds >= 10
      ? { silenceTimeoutSeconds: configured.silenceTimeoutSeconds }
      : {}),
    responseDelaySeconds: latency.responseDelaySeconds,
    numWordsToInterruptAssistant: latency.numWordsToInterruptAssistant,
    backgroundDenoisingEnabled: false,
    backchannelingEnabled: true,
    recordingEnabled,
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "conversation-update",
      "tool-calls",
      "speech-update",
    ],
    clientMessages: [
      "transcript",
      "hang",
      "function-call",
      "speech-update",
      "conversation-update",
    ],
    analysisPlan: VAPI_ANALYSIS_PLAN,
    // Ambient noise parity with outbound — the user-settable field only
    // affected outbound dials before; inbound calls silently ignored it.
    backgroundSound: sanitizeAmbientNoise(configured.ambientNoise),
  };
}
