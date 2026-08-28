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
import { buildVapiTranscriptOnlyArtifactPlan } from "./vapi-artifact-plan";
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
import { isPrincipalVoiceRole } from "./agent-role-definitions";
import { buildGrokStrengthsPromptSection, isGrokModelId } from "./grok-features";
import { resolvePstnVoiceCandidate } from "../data/voice-roster";
import { buildManagedVoiceRuntime, isCuratedElevenLabsVoiceId } from "./managed-voice-runtime";
import { sanitizeAmbientNoise } from "./workspace-planner";
import { STUDIO_BROWSER_TEST_MAX_SECONDS } from "./voice/studio-live-test-policy";
import {
  founderInternalRuntimeAuthorityBoundary,
  founderInternalRuntimePolicyBlock,
  resolveFounderInternalRuntimePolicy,
} from "./founder-internal-runtime-policy";
import {
  isRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_GREETING,
  resolveRuntimeTemplatePersonality,
  runtimeTemplateGuidanceBlock,
} from "./runtime-template-personality";

export interface AssistantRequestPayload {
  message: { type: string; call?: any };
  agent: { id: string; user_id: string };
  userSettings: any;
  surface?: "pstn" | "browser_test";
}

const promptItem = (prefix: string, values: Array<{ content?: string | null }>) => {
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

export interface VapiRuntimePromptAgent {
  id: string;
  userId: string;
  name: string;
  role?: string | null;
  systemPromptOverride?: string | null;
  businessVariables?: unknown;
  timezone?: AgentRuntimeProfile["timezone"];
  businessHours?: AgentRuntimeProfile["business_hours"];
  complianceMode?: AgentRuntimeProfile["compliance_mode"];
  disallowedTopics?: AgentRuntimeProfile["disallowed_topics"];
  escalationKeywords?: AgentRuntimeProfile["escalation_keywords"];
  outOfHoursMessage?: AgentRuntimeProfile["out_of_hours_message"];
  kpiFocus?: AgentRuntimeProfile["kpi_focus"];
  personalityVibe?: AgentRuntimeProfile["personality_vibe"];
  escalationPhone?: string | null;
  escalationEmail?: string | null;
  flowConfig?: unknown;
}

export function composeVapiRuntimePrompt(input: {
  configured: VapiRuntimePromptAgent;
  personality: string;
  directives: Array<{ content?: string | null }>;
  knowledge: Array<{ content?: string | null }>;
  browserTest: boolean;
  isOutbound: boolean;
  model: string;
  now?: Date;
}) {
  const { configured } = input;
  const internalPolicy = resolveFounderInternalRuntimePolicy({
    agentId: configured.id,
    userId: configured.userId,
    businessVariables: configured.businessVariables,
  });
  const runtimeTemplate = internalPolicy
    ? null
    : resolveRuntimeTemplatePersonality(input.personality);
  const runtimeReviewRequired = isRuntimeReviewRequired(runtimeTemplate, configured.role);
  // Managed internal rows carry the canonical policy in the personality table
  // for workspace chat, but the live voice policy must not use that truncated
  // copy. It leads the prompt once, through the trusted structured marker path.
  const personality = internalPolicy
    ? ""
    : runtimeReviewRequired
      ? ""
      : truncateRuntimeSnippet(
          runtimeTemplate ? runtimeTemplate.rolePersonality : input.personality || "",
          1_200,
        );
  const templateGuidance = runtimeTemplateGuidanceBlock(runtimeTemplate, configured.role);
  const flow =
    !runtimeReviewRequired && Array.isArray(configured.flowConfig)
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
  const principalFacing = isPrincipalVoiceRole(configured.role);
  const identityBlock = runtimeReviewRequired
    ? [
        "You are a BotBound Bot in review-required hold mode.",
        "Do not collect, repeat, infer, or discuss customer, patient, account, balance, insurance, identity, or payment details.",
        "Explain the review hold briefly and direct the caller only to a verified general contact channel.",
      ].join("\n")
    : principalFacing
      ? [
          `You are ${configured.name}, a BotBound Bot for your principal.`,
          "Be accurate, concise, discreet, and protective of their time. Never invent personal facts, schedule commitments, or private details.",
          "Represent your principal professionally. When something is outside your authority, say so and offer to relay a message or escalate.",
          "Default to privacy: do not volunteer address, family, health, finances, or schedule details unless required for the immediate task.",
        ].join("\n")
      : [
          `You are ${configured.name}, a BotBound ${configured.role || "agent"}.`,
          "Be accurate, concise, kind, and action-oriented. Never invent business facts, prices, availability, or commitments.",
          "When an action is outside your permissions or confidence, clearly explain the limitation and escalate to a human.",
        ].join("\n");
  const callSpecificContext = [
    runtimeReviewRequired ? "" : LIVE_CALL_EXECUTION_PROTOCOL,
    !runtimeReviewRequired && input.browserTest
      ? "\n## PRIVATE BROWSER TEST\nThis is a private live test with the account holder. Use the same intelligence and voice as a live phone call. Do not send messages, book, transfer, create records, or change outside systems. Search approved Training when facts are needed.\n"
      : "",
    personality ? `\n## TONE\n${personality}\n` : "",
    templateGuidance ? `\n${templateGuidance}\n` : "",
    runtimeReviewRequired ? "" : promptItem("OPERATING RULES", input.directives),
    runtimeReviewRequired ? "" : promptItem("APPROVED TRAINING", input.knowledge),
    flowBlock,
    !runtimeReviewRequired && (configured.escalationPhone || configured.escalationEmail)
      ? principalFacing
        ? "\n## ESCALATION\nEscalate when the caller is urgent, distressed, asks for your principal by name with a time-sensitive matter, or anything exceeds your approved personal preferences.\n"
        : "\n## ESCALATION\nEscalate when the caller requests a human, a policy exception, legal/medical/financial advice, a final price, or anything not covered by approved Training.\n"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const internalBasePrompt = internalPolicy
    ? founderInternalRuntimePolicyBlock(internalPolicy)
    : null;
  const basePrompt = resolveAssistantBasePrompt({
    // A current managed internal policy is authoritative. Account-holder
    // overrides retain their existing priority for every non-internal Bot.
    override:
      internalBasePrompt || (runtimeReviewRequired ? null : configured.systemPromptOverride),
    autoComposedPrompt: [identityBlock, callSpecificContext].filter(Boolean).join("\n"),
    callSpecificContext,
  });
  const runtimeProfile: AgentRuntimeProfile = runtimeReviewRequired
    ? {}
    : {
        timezone: configured.timezone,
        business_hours: configured.businessHours,
        compliance_mode: configured.complianceMode,
        disallowed_topics: configured.disallowedTopics,
        escalation_keywords: configured.escalationKeywords,
        business_variables:
          configured.businessVariables as AgentRuntimeProfile["business_variables"],
        out_of_hours_message: configured.outOfHoursMessage,
        kpi_focus: configured.kpiFocus,
        personality_vibe: configured.personalityVibe,
      };
  const runtime = buildAgentRuntimeContext(basePrompt, runtimeProfile, input.now);
  const afterHours = !runtimeReviewRequired && !input.isOutbound && !runtime.inHours;
  const systemPrompt = afterHours
    ? principalFacing
      ? `${runtime.prompt}\n\n## QUIET-HOURS MODE\nYour principal is not available right now. Let the caller know and collect a complete message: name, number, reason for calling, and urgency. Use create_followup_task before closing. Promise a relay only if that tool explicitly confirms the task was created; otherwise say the message could not be recorded and offer another contact channel. Do NOT commit to appointments or personal details you are not cleared to share.`
      : `${runtime.prompt}\n\n## AFTER-HOURS MODE\nThe business is currently closed. Let the caller know and collect a complete message: name, number, reason for calling, and urgency. Use create_followup_task before closing. Promise follow-up only if that tool explicitly confirms the task was created; otherwise say the message could not be recorded and offer another contact channel. Do NOT commit to appointments, prices, or actions that require the business to be open.`
    : runtime.prompt;
  const augmentedSystemPrompt =
    !runtimeReviewRequired && isGrokModelId(input.model)
      ? `${systemPrompt}\n\n${buildGrokStrengthsPromptSection()}`
      : systemPrompt;
  const authoritativeSystemPrompt = internalPolicy
    ? `${augmentedSystemPrompt}\n\n${founderInternalRuntimeAuthorityBoundary(internalPolicy)}`
    : augmentedSystemPrompt;

  return {
    finalSystemPrompt: clampRuntimePromptPreservingTail(authoritativeSystemPrompt),
    afterHours,
    outOfHoursMessage: runtime.outOfHoursMessage,
    principalFacing,
    internalPolicyApplied: Boolean(internalPolicy),
    reviewRequired: runtimeReviewRequired,
  };
}

export async function buildVapiAssistant({
  message,
  agent,
  userSettings,
  surface = "pstn",
}: AssistantRequestPayload) {
  const agentId = agent.id;
  const browserTest = surface === "browser_test";
  const isOutbound =
    !browserTest &&
    (message.type === "outboundPhoneCall" || message.call?.type === "outboundPhoneCall");
  const [agentRows, directives, knowledge, personalityRows] = await drizzle.transaction(
    async (tx) => {
      // A pg transaction owns one client. Concurrent tx queries are only
      // queued by pg@8 and are rejected by pg@9, so keep this snapshot's
      // reads explicitly ordered on the checked-out client.
      const agentRows = await tx
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.id, agentId))
        .limit(1);
      const directives = await tx
        .select({ content: schema.directives.content })
        .from(schema.directives)
        .where(eq(schema.directives.agentId, agentId))
        .orderBy(desc(schema.directives.priority))
        .limit(MAX_RUNTIME_DIRECTIVES);
      const knowledge = await tx
        .select({ content: schema.knowledge.content })
        .from(schema.knowledge)
        .where(eq(schema.knowledge.agentId, agentId))
        .orderBy(desc(schema.knowledge.createdAt))
        .limit(MAX_RUNTIME_KNOWLEDGE);
      const personalityRows = await tx
        .select({ content: schema.personality.content })
        .from(schema.personality)
        .where(eq(schema.personality.agentId, agentId))
        .limit(1);
      return [agentRows, directives, knowledge, personalityRows] as const;
    },
  );
  const configured = agentRows[0];
  if (!configured) throw new Error("Agent not found for Vapi assistant request");

  // Coherent (provider, model) pair — agent brain first, tenant default
  // second — so a partially-configured agent never crosses its provider with
  // the tenant's model and collapses to the managed default.
  const modelSelection = resolveCoherentVoiceModel(configured, userSettings);
  // Presenter/live-voice agents store a non-Vapi studio voice; their dedicated
  // PSTN pick (phone_voice_id) applies before the roster default.
  const directionalVoice = isOutbound
    ? configured.voiceIdOutbound || configured.voiceId
    : configured.voiceIdInbound || configured.voiceId;
  // ElevenLabs is itself a PSTN voice through Vapi. The presenter-only phone
  // fallback must not replace it before the managed runtime can authorize it.
  const requestedVoice =
    configured.voiceProvider === "11labs"
      ? directionalVoice
      : resolvePstnVoiceCandidate(directionalVoice, configured.phoneVoiceId);
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
  const promptComposition = composeVapiRuntimePrompt({
    configured: {
      ...configured,
      businessHours: configured.businessHours as AgentRuntimeProfile["business_hours"],
    },
    personality: personalityRows[0]?.content || "",
    directives,
    knowledge,
    browserTest,
    isOutbound,
    model: modelSelection.model,
  });
  const { finalSystemPrompt, afterHours, outOfHoursMessage, principalFacing, reviewRequired } =
    promptComposition;
  const afterHoursGreeting = afterHours
    ? outOfHoursMessage ||
      (principalFacing
        ? `Hi, you've reached ${configured.name}. They're not available right now, but I can take a message for them.`
        : `Hi, you've reached ${configured.name}. We're currently closed, but I can take a message for the team.`)
    : null;
  const functionTools = reviewRequired
    ? []
    : toVapiFunctionTools(
        await buildRoleToolDefsForTenant(
          configured.role || "customer_service",
          browserTest ? ["search_knowledge_base"] : configured.enabledTools,
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

  // BotBound retains transcript-driven product value without full-call provider
  // audio by default. Vapi artifact defaults are permissive, so send the
  // privacy posture explicitly on every managed assistant payload.
  const artifactPlan = buildVapiTranscriptOnlyArtifactPlan();
  const disclosurePrefix = complianceFirstMessagePrefix(
    configured.complianceMode,
    userSettings?.businessName || configured.name,
    { outboundAiCall: isOutbound, recordingEnabled: artifactPlan.recordingEnabled },
  );
  return {
    name: configured.name,
    firstMessage:
      disclosurePrefix +
      (reviewRequired
        ? RUNTIME_REVIEW_REQUIRED_GREETING
        : afterHoursGreeting ||
          configured.firstMessage ||
          `Hi, this is ${configured.name}. How can I help?`),
    ...(isOutbound ? { firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE } : {}),
    maxDurationSeconds: browserTest
      ? STUDIO_BROWSER_TEST_MAX_SECONDS
      : isOutbound
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
    artifactPlan,
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
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "conversation-update",
      "tool-calls",
      "speech-update",
    ],
    clientMessages: ["transcript", "hang", "function-call", "speech-update", "conversation-update"],
    analysisPlan: VAPI_ANALYSIS_PLAN,
    // Ambient noise parity with outbound — the user-settable field only
    // affected outbound dials before; inbound calls silently ignored it.
    backgroundSound: sanitizeAmbientNoise(configured.ambientNoise),
  };
}
