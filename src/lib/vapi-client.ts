/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * src/lib/vapi-client.ts
 *
 * Client logic for interacting with the Vapi API for outbound dialing.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { drizzle, fetchWithTimeout, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";
import { isDncBlocked } from "./compliance";
import { getErrorMessage } from "./server-utils";
import { isAllowedVapiControlUrl } from "./vapi-monitor-url";
import {
  sanitizePhone,
  KNOWLEDGE_GAP_PREFIX,
  MAX_RUNTIME_LESSONS,
  MAX_RUNTIME_DIRECTIVES,
  MAX_RUNTIME_KNOWLEDGE,
  truncateRuntimeSnippet,
  clampRuntimePromptPreservingTail,
  buildCallerProfileBlock,
  OUTBOUND_ARCHETYPE_BY_ROLE,
  getArchetypeConfig,
  ROLE_SPECIFIC_PROTOCOLS,
  buildRoleToolDefsForTenant,
  mapOutboundVoiceRole,
} from "./vapi-helpers";
import { toVapiFunctionTools } from "./vapi-tool-format";
import { buildVapiServerConfig } from "./vapi-server-config";
import { normalizeOutboundNumber } from "./dialer-compliance";
import {
  buildAgentRuntimeContext,
  complianceFirstMessagePrefix,
  type AgentRuntimeProfile,
} from "./agent-runtime";
import { buildCustomerIntelBlock } from "./customer-intel";
import { DEFAULT_AGENT_ROLE } from "./agent-constants";
import { resolvePstnVoiceCandidate } from "../data/voice-roster";
import {
  buildManagedVoiceRuntime,
  isCuratedElevenLabsVoiceId,
} from "./managed-voice-runtime";
import { sanitizeAmbientNoise } from "./workspace-planner";
import {
  buildOutboundVoicemailMessage,
  resolveOutboundStartSpeakingPlan,
  resolveVapiSpeechPipeline,
  VAPI_ANALYSIS_PLAN,
  VAPI_MAX_OUTBOUND_CALL_SECONDS,
  VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
  VAPI_VOICEMAIL_DETECTION_PLAN,
} from "./voice-agent-profile";
import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_PROVIDER,
  clampVoiceTemperature,
  isGeminiModelId,
  isOpenAIModelId,
  resolveCoherentVoiceModel,
} from "./ai-models";

// Retry configuration for transient failures
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const RETRY_BACKOFF_MULTIPLIER = 2;

// HTTP status codes that indicate transient failures worth retrying
const TRANSIENT_ERROR_CODES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Delay helper for retry backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a fetch with retry logic for transient failures.
 * Uses exponential backoff: 500ms, 1000ms, 2000ms between retries.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  operationName: string,
  retryTransportErrors = true,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // If response is ok or not a transient error, return immediately
      if (response.ok || !TRANSIENT_ERROR_CODES.has(response.status)) {
        return response;
      }

      // Transient error - will retry
      const retryAfter =
        attempt < MAX_RETRIES - 1
          ? RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt)
          : 0;

      log.warn(
        `${operationName}: Transient error ${response.status}, retrying after ${retryAfter}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );

      if (attempt < MAX_RETRIES - 1) {
        await delay(retryAfter);
      }
    } catch (error) {
      // Transport failures (timeout, connection reset) are ambiguous for
      // non-idempotent POSTs: the carrier may have accepted the call before
      // its response was lost, and Vapi offers no idempotency key on call
      // creation. Callers placing calls pass retryTransportErrors=false so an
      // interrupted attempt surfaces once as ambiguous instead of re-POSTing
      // and potentially dialing the same consumer twice.
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!retryTransportErrors) break;

      const retryAfter =
        attempt < MAX_RETRIES - 1
          ? RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt)
          : 0;

      log.warn(
        `${operationName}: Network error, retrying after ${retryAfter}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        {
          error: lastError.message,
        },
      );

      if (attempt < MAX_RETRIES - 1) {
        await delay(retryAfter);
      }
    }
  }

  // All retries exhausted
  throw (
    lastError ||
    new Error(`${operationName}: Failed after ${MAX_RETRIES} attempts`)
  );
}

export type PlaceCallResult = {
  ok: boolean;
  status: number;
  error?: string;
  callId?: string;
};

/** Turn raw Vapi error JSON into a short Account Holder-facing message. */
export function formatVapiCallError(errBody: string): string {
  const trimmed = errBody.trim();
  if (!trimmed)
    return "Voice carrier rejected the call. Try again in a moment.";

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string | string[];
      error?: string;
      errors?: Array<{ message?: string }>;
    };
    const parts: string[] = [];
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      parts.push(parsed.message.trim());
    } else if (Array.isArray(parsed.message)) {
      parts.push(
        ...parsed.message.map((m) => String(m).trim()).filter(Boolean),
      );
    }
    if (parsed.error?.trim()) parts.push(parsed.error.trim());
    if (Array.isArray(parsed.errors)) {
      for (const e of parsed.errors) {
        if (e.message?.trim()) parts.push(e.message.trim());
      }
    }
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // Not JSON — fall through to raw slice.
  }

  return trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
}

function buildOutboundFirstMessage(
  role: string,
  agentName: string,
  customerName?: string | null,
): string {
  const name = agentName || "your representative";
  const firstName = customerName?.trim()
    ? customerName.trim().split(" ")[0]
    : null;
  const customer = firstName || "there";
  const hasName = !!firstName;
  switch (role) {
    case "collections":
      return `Hi, is this ${hasName ? customer : "the account holder"}? This is ${name} calling regarding an account matter. Do you have a moment?`;
    case "scheduler":
      return `Hi ${customer}! This is ${name} reaching out about your upcoming appointment. Quick question for you — do you have 30 seconds?`;
    case "technical_support":
      return `Hi ${customer}, this is ${name} from our technical team following up on your case. Is now an okay time to troubleshoot?`;
    case "customer_service":
      return `Hi ${customer}, this is ${name} — I'm following up personally. Is now a good moment to talk?`;
    case "lead_qualifier":
      return `Hi ${customer}, this is ${name}. You'd recently expressed interest in us, and I wanted to connect. Do you have 2 minutes?`;
    case "marketing":
      return `Hi ${customer}, it's ${name} — I'm reaching out because I think we have something really relevant for you. Is now an okay time?`;
    case "receptionist":
      return `Hi ${customer}, this is ${name} following up on your message. Do you have a quick moment?`;
    case "sales":
    default:
      return `Hi ${customer}, this is ${name} calling. I wanted to reach out personally — do you have 30 seconds?`;
  }
}

export async function placeOutboundCall(opts: {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  context?: string | null;
}): Promise<PlaceCallResult> {
  const { userId, agentId, customerName, customerNumber, context } = opts;

  const [ownedAgent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);

  if (!ownedAgent) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  const [userSettings] = await drizzle
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  const subscriptionStatus =
    userSettings?.subscriptionStatus ?? "pending_activation";
  if (subscriptionStatus !== "active") {
    return {
      ok: false,
      status: 403,
      error:
        "Access Denied: Please upgrade your billing plan to access outbound dialing.",
    };
  }

  const dialNumber = normalizeOutboundNumber(customerNumber);
  const dialDigits = dialNumber.replace(/\D/g, "");
  if (!dialDigits || dialDigits.length < 10) {
    return {
      ok: false,
      status: 400,
      error: "Invalid phone number. Use E.164 format like +14155551234.",
    };
  }

  if (dialNumber && (await isDncBlocked(userId, dialNumber))) {
    return {
      ok: false,
      status: 403,
      error: "DNC blocked: this number is on the Do Not Call list.",
    };
  }

  const settings = userSettings;
  const vapiSecret = process.env.VAPI_PRIVATE_KEY;
  if (!vapiSecret) {
    return {
      ok: false,
      status: 400,
      error:
        "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets.",
    };
  }

  const { resolveAgentVapiPhoneNumberId } = await import("./agent-phone-lines");
  const outboundPhoneNumberId = await resolveAgentVapiPhoneNumberId(
    userId,
    agentId,
  );
  if (!outboundPhoneNumberId) {
    return {
      ok: false,
      status: 400,
      error:
        "No voice line is configured for this agent. Provision a dedicated number in Settings → Carrier to wire this agent for calls.",
    };
  }

  const safeOutboundPhone = sanitizePhone(customerNumber);
  const [
    agentRes,
    directivesRes,
    knowledgeRes,
    personalityRes,
    lessonsRes,
    outboundCallerHistoryRes,
    outboundCapturedProfileRes,
  ] = await drizzle.transaction(async (tx) => {
    // Voice setup reads share one transaction snapshot and therefore one pg
    // client. Explicit sequencing avoids pg@8's deprecated concurrent-query
    // queue and keeps this path compatible with pg@9.
    const agentRes = await tx
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, agentId))
      .limit(1);
    // Prompt size is the largest cost lever on voice calls (the system prompt
    // is re-sent every turn). Load only what the prompt will actually carry —
    // the highest-priority directives and most recent knowledge — instead of
    // 500 of each, mirroring the inbound factory's caps.
    const directivesRes = await tx
      .select()
      .from(schema.directives)
      .where(eq(schema.directives.agentId, agentId))
      .orderBy(desc(schema.directives.priority))
      .limit(MAX_RUNTIME_DIRECTIVES);
    const knowledgeRes = await tx
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.agentId, agentId))
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(MAX_RUNTIME_KNOWLEDGE);
    const personalityRes = await tx
      .select()
      .from(schema.personality)
      .where(eq(schema.personality.agentId, agentId))
      .limit(1);
    const lessonsRes = await tx
      .select()
      .from(schema.agentLessons)
      .where(eq(schema.agentLessons.agentId, agentId))
      .orderBy(desc(schema.agentLessons.createdAt))
      .limit(MAX_RUNTIME_LESSONS);
    const outboundCallerHistoryRes = safeOutboundPhone
      ? await tx
          .select({
            summary: schema.callLogs.summary,
            intentLabel: schema.callLogs.intentLabel,
            sentiment: schema.callLogs.sentiment,
            createdAt: schema.callLogs.createdAt,
            direction: schema.callLogs.direction,
          })
          .from(schema.callLogs)
          .where(
            and(
              eq(schema.callLogs.customerNumber, safeOutboundPhone),
              eq(schema.callLogs.agentId, agentId),
            ),
          )
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(3)
      : [];
    const outboundCapturedProfileRes = safeOutboundPhone
      ? await tx
          .select({
            description: schema.followUpTasks.description,
            createdAt: schema.followUpTasks.createdAt,
          })
          .from(schema.followUpTasks)
          .where(
            and(
              eq(schema.followUpTasks.agentId, agentId),
              eq(schema.followUpTasks.taskType, "customer_profile_captured"),
              ilike(schema.followUpTasks.description, `%${safeOutboundPhone}%`),
            ),
          )
          .orderBy(desc(schema.followUpTasks.createdAt))
          .limit(1)
      : [];
    return [
      agentRes,
      directivesRes,
      knowledgeRes,
      personalityRes,
      lessonsRes,
      outboundCallerHistoryRes,
      outboundCapturedProfileRes,
    ] as const;
  });

  const agentConfig = agentRes[0];
  if (!agentConfig) {
    return { ok: false, status: 404, error: `Agent ${agentId} not found.` };
  }

  const lessons = (lessonsRes || [])
    .filter(
      (l: any) =>
        l.lesson &&
        typeof l.lesson === "string" &&
        !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX),
    )
    .map((l: any) => l.lesson)
    .join("\n");

  const outboundPastCalls: any[] = outboundCallerHistoryRes || [];
  const outboundCallerProfile = buildCallerProfileBlock(
    outboundPastCalls,
    true,
  );

  const outboundRawProfileDesc =
    outboundCapturedProfileRes[0]?.description || "";
  const outboundCustomerIntelBlock = buildCustomerIntelBlock(
    outboundRawProfileDesc,
    true,
  );

  const outboundTimeZone = agentConfig.timezone || "America/New_York";
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: outboundTimeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const outboundAgentRole = mapOutboundVoiceRole(
    agentConfig.role || DEFAULT_AGENT_ROLE,
  );
  const archetype =
    OUTBOUND_ARCHETYPE_BY_ROLE[outboundAgentRole] ||
    agentConfig.archetype ||
    "The Closer";
  const { rules: archetypeRules, temp: llmTemp } =
    getArchetypeConfig(archetype);
  const ambientNoiseActive =
    agentConfig.ambientNoise && agentConfig.ambientNoise !== "off";
  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[outboundAgentRole] || "";
  // Per-agent brain first (mirrors the inbound factory), tenant default second
  // — resolved as a coherent pair so a partially-configured agent can't cross
  // its provider with the tenant's model and silently collapse to the default.
  const voiceSelection = resolveCoherentVoiceModel(agentConfig, settings);
  const voiceLlmProvider = voiceSelection.provider;
  const voiceLlmModel = voiceSelection.model;

  const systemPrompt = `
## IDENTITY & OUTBOUND MISSION
You are ${agentConfig.name || "a scheduling agent"}, a ${outboundAgentRole.replace(/_/g, " ")} specialist making an outbound call.
${ambientNoiseActive ? "You are operating from a professional office environment. Speak with focused, professional energy." : ""}

## VOICE DELIVERY RULES (MANDATORY)
- Maintain a consistent speaking pace from start to finish. Never speed up mid-call.
- When confirming details like email addresses, phone numbers, or spelling, slow down. Say each part with pauses between segments.
- Speak in clear, natural sentences. Break complex information into digestible pieces with pauses between them.
- Use contractions naturally. "I'll" not "I will". "You're" not "you are".
- Never mention technical terms, error codes, system names, or internal jargon. If something goes wrong, say "Let me note that and have someone follow up."
- Your tone and pace should be consistent from greeting to goodbye. No energy spikes. No rushing.
- Be confident and explanatory. Outbound calls often catch people off guard — take the time to explain who you are, why you're calling, and what's in it for them. Don't be terse.

${outboundCallerProfile}

${outboundCustomerIntelBlock}

## YOUR PROFESSIONAL CHARACTER & METHOD
${personalityRes[0]?.content || "You are a highly professional, empathetic, and effective representative who puts the caller's outcome first."}

## YOUR TACTICAL APPROACH FOR THIS ROLE
${archetypeRules}

## ⚡ OUTBOUND CALL OBJECTIVE — EXECUTE THIS
You are calling ${customerName || "a customer"}.
Objective: ${context || "Check in and offer assistance."}
Execute this objective naturally — integrate it into the conversation, don't read it like a script.

${agentConfig.websiteUrl ? `## COMPANY WEBSITE\nYour company's official website: ${agentConfig.websiteUrl}. For detailed specs, pricing pages, or information not in your knowledge base, direct the contact here or offer to send the link by email.` : ""}

${lessons ? `## LEARNED IMPROVEMENTS (APPLY THESE)\nYour previous call analysis identified these adjustments — apply them actively:\n${lessons}\n` : ""}

${roleProtocol}

## VOICEMAIL PROTOCOL
If you detect you have reached a voicemail or answering machine (recorded greeting, beep, or "please leave a message"):
1. IMMEDIATELY call the leave_voicemail tool before speaking.
2. After the tool responds, deliver a clear, professional voicemail: identify yourself and your company, state the reason for your call in ONE sentence, leave a callback number if available, and close with "I look forward to connecting with you."
3. Keep the voicemail under 20 seconds total.
4. Say goodbye naturally to end the call.

## EMOTIONAL INTELLIGENCE
- If the contact sounds surprised, annoyed, or busy: acknowledge it immediately ("I know this is unexpected — I'll be brief"). Respect their time.
- If the contact is warm and engaged: stay in your own consistent voice and let the rapport build through substance and listening. Do NOT raise your energy to match them — a sudden enthusiasm spike sounds artificial.
- If the contact says it's a bad time: "Of course — when would be a better time? I can call back at [specific time]."
- Never push through emotional resistance. Acknowledge what they're feeling and adjust the SUBSTANCE of your next sentence — your tone, pace, and personality stay the same throughout the call.

## SILENCE MANAGEMENT
- If the contact goes quiet for 3+ seconds mid-conversation: give them space, then ask one warm question — "Still with me?" 
- If silence extends to 15+ seconds: "Take your time — I'm here." Never assume silence means disinterest.
- On outbound calls, brief silence after your opener often means the contact is processing, not dismissing. Be patient.

## OUTBOUND CONVERSATION DISCIPLINE
Today is ${currentDateTime} in the agent's local timezone (${outboundTimeZone}). Calculate specific dates for "tomorrow," "next week," etc. in that timezone.
- Be confident and thorough. These calls are often unexpected for the contact — take the time to explain clearly. Don't rush through value props or gloss over details. If they're listening, earn their attention with substance.
- Opener discipline: No generic "How are you today?" Get to the reason for the call naturally, but don't be abrupt. A warm, confident introduction builds trust.
- One question per turn by default, but you may ask multiple questions at once if you need more context to answer sufficiently. Let them finish before you respond.
- When explaining your product, service, or reason for calling, be detailed enough that they understand the value. Don't assume they already know. Paint the picture.
- If they push back or seem uncomfortable, slow down — don't speed up. Acknowledge their concern, then explain calmly.
- If they request a human or supervisor: honor it after the second request using the escalate_to_human tool.
- Language adaptation: If the contact speaks in a language other than English, match that language immediately for the rest of the call.
- Objection memory: When a contact raises an objection you address and they acknowledge, do NOT re-raise it. Each objection is resolved once, then set aside.

## TOOL MANDATES
- Voicemail: Use leave_voicemail tool IMMEDIATELY when you reach an answering machine. Do not start speaking first.
- Escalation: If the contact asks for a human/supervisor (second request) or uses legal/liability language, use escalate_to_human tool with a clear "reason" describing why. Never escalate without stating the reason.
- Callback scheduling: If the contact asks to be called back at a specific time, use schedule_callback tool immediately. Calculate the exact ISO datetime from what they say and confirm it back to them. "Perfect — I have you down for [exact time]. You'll hear from me then."
- Email follow-up: If the contact wants information sent: use send_email tool. "I'll send that to you right now — what email?"
- Lead outcome: Use update_lead_status at the END of every live call — never leave the outcome unlogged.
- Tasks: Use create_followup_task for any promised follow-up that requires human action.
- Scheduling: Always check_calendar_availability BEFORE confirming any appointment slot. Never promise a time from memory.
- Customer intel: Use capture_customer_profile whenever you learn something meaningful — budget, pain points, timeline, decision authority, objections, or agreed next steps. Capture it in the moment, not at the end. This data travels with the contact across all future calls.

## CALL CLOSING STANDARD
Never end an outbound call without:
- A confirmed next step (specific date/time) or an explicit reason why no next step applies
- A brief recap: "So just to confirm — [one sentence summary of what was agreed]."
- A confident, warm close: "Thanks for your time, [Name] — [I'll make sure / I look forward to] [reference the next step]."
- Own the ending. The last impression is as important as the first.

## HONESTY GUARDRAILS
Never invent prices, availability, dates, or product specs. If you don't know: "Great question — let me have someone with the exact details reach out to you. What's the best email?"

## ABSOLUTE Account Holder RULES
${(directivesRes || []).map((d: any) => `[PRIORITY ${d.priority}] ${truncateRuntimeSnippet(d.content || "")}`).join("\n") || "Follow all standard professional and ethical guidelines."}

## KNOWLEDGE BASE
${(knowledgeRes || []).map((k: any) => `- ${truncateRuntimeSnippet(k.content || "")}`).join("\n") || "No specific knowledge base entries loaded."}
    `;

  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfig.timezone,
    business_hours:
      agentConfig.businessHours as AgentRuntimeProfile["business_hours"],
    compliance_mode: agentConfig.complianceMode,
    disallowed_topics: agentConfig.disallowedTopics,
    escalation_keywords: agentConfig.escalationKeywords,
    business_variables:
      agentConfig.businessVariables as AgentRuntimeProfile["business_variables"],
    out_of_hours_message: agentConfig.outOfHoursMessage,
    kpi_focus: agentConfig.kpiFocus,
    personality_vibe: agentConfig.personalityVibe,
  };
  const runtime = buildAgentRuntimeContext(systemPrompt, runtimeProfile);
  if (!runtime.inHours) {
    return {
      ok: false,
      status: 409,
      error:
        runtime.outOfHoursMessage ||
        "Outbound dialing is suspended outside this agent's configured business hours.",
    };
  }
  // Final size clamp that never drops the compliance/escalation guardrail
  // tail — the last defense when a tenant's directives/knowledge are long
  // even after the per-item caps above.
  const finalSystemPrompt = clampRuntimePromptPreservingTail(runtime.prompt);

  const outboundServerUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/vapi-webhook?agentId=${agentId}`
    : undefined;
  const speechPipeline = resolveVapiSpeechPipeline();
  const outboundFunctions = await buildRoleToolDefsForTenant(
    agentConfig.role || outboundAgentRole,
    agentConfig.enabledTools,
    userId,
    settings?.aiTier,
    {
      twilioMessaging: !!settings?.twilioMessagingEnabled,
      twilioLookup: !!settings?.twilioLookupEnabled,
    },
  );
  const outboundTools = toVapiFunctionTools(outboundFunctions);
  const recordingEnabled = agentConfig.complianceMode !== "hipaa";
  const openingMessage =
    agentConfig.firstMessage ||
    buildOutboundFirstMessage(
      outboundAgentRole,
      agentConfig.name || "your representative",
      customerName,
    );
  const disclosurePrefix = complianceFirstMessagePrefix(
    agentConfig.complianceMode,
    settings?.businessName || agentConfig.name,
    { outboundAiCall: true, recordingEnabled },
  );
  const outboundVoiceId = agentConfig.voiceIdOutbound || agentConfig.voiceId;
  // A selected ElevenLabs voice already runs on PSTN through Vapi. Reserve the
  // separate phoneVoiceId fallback for presenter/browser-only providers.
  const requestedPhoneVoiceId =
    agentConfig.voiceProvider === "11labs"
      ? outboundVoiceId
      : resolvePstnVoiceCandidate(outboundVoiceId, agentConfig.phoneVoiceId);
  let approvedClone = false;
  if (
    agentConfig.voiceProvider === "11labs" &&
    requestedPhoneVoiceId &&
    !isCuratedElevenLabsVoiceId(requestedPhoneVoiceId)
  ) {
    const [clone] = await drizzle
      .select({ voiceId: schema.clonedVoices.voiceId })
      .from(schema.clonedVoices)
      .where(
        and(
          eq(schema.clonedVoices.voiceId, requestedPhoneVoiceId),
          eq(schema.clonedVoices.userId, agentConfig.userId),
          eq(schema.clonedVoices.status, "approved"),
        ),
      )
      .limit(1);
    approvedClone = Boolean(clone);
  }
  const managedVoiceRuntime = buildManagedVoiceRuntime({
    voiceProvider: agentConfig.voiceProvider,
    voiceId: requestedPhoneVoiceId,
    approvedClone,
    voiceSpeed: agentConfig.voiceSpeed,
    voiceStability: agentConfig.voiceStability,
    voiceSimilarityBoost: agentConfig.voiceSimilarityBoost,
    voiceStyle: agentConfig.voiceStyle,
    voiceSpeakerBoost: agentConfig.voiceSpeakerBoost,
    fallbackVoiceId: agentConfig.phoneVoiceId,
  });

  const assistantPayload: Record<string, unknown> = {
    name: agentConfig.name || "Wireline Outbound Agent",
    firstMessage: disclosurePrefix + openingMessage,
    backgroundSound: sanitizeAmbientNoise(agentConfig.ambientNoise),
    firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
    maxDurationSeconds: VAPI_MAX_OUTBOUND_CALL_SECONDS,
    voicemailDetection: VAPI_VOICEMAIL_DETECTION_PLAN,
    voicemailMessage: buildOutboundVoicemailMessage(
      agentConfig.name || "your representative",
    ),
    responseDelaySeconds: 0,
    numWordsToInterruptAssistant: 2,
    backgroundDenoisingEnabled: false,
    backchannelingEnabled: true,
    // Same Wireline-tuned post-call analysis as inbound — without it,
    // outbound summaries/success metrics fell back to Vapi generic defaults.
    analysisPlan: VAPI_ANALYSIS_PLAN,
    startSpeakingPlan: resolveOutboundStartSpeakingPlan(speechPipeline),
    transcriber: speechPipeline.transcriber,
    ...(outboundServerUrl && {
      server: buildVapiServerConfig(outboundServerUrl),
    }),
    serverMessages: [
      "tool-calls",
      "status-update",
      "conversation-update",
      "end-of-call-report",
      "speech-update",
    ],
    model: {
      provider: voiceLlmProvider,
      model: voiceLlmModel,
      ...(voiceSelection.fallbackModels?.length
        ? { fallbackModels: voiceSelection.fallbackModels }
        : {}),
      systemPrompt: finalSystemPrompt,
      temperature: clampVoiceTemperature(agentConfig.llmTemperature, llmTemp),
      tools: outboundTools,
    },
    // Recording parity with the inbound factory: HIPAA-mode agents must not
    // record on EITHER direction — a hardcoded true here recorded every
    // outbound call (manual, campaign, cadence, callback, intake auto-dial)
    // for agents whose owners selected HIPAA compliance, and persisted the
    // recording URL to call logs.
    recordingEnabled,
    voice: managedVoiceRuntime,
  };

  const vapiPayload = {
    phoneNumberId: outboundPhoneNumberId,
    customer: { number: dialNumber },
    assistant: assistantPayload,
  };

  try {
    let vapiResponse = await fetchWithRetry(
      "https://api.vapi.ai/call/phone",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vapiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vapiPayload),
      },
      20_000,
      "Vapi placeOutboundCall",
      false,
    );

    if (!vapiResponse.ok && voiceSelection.provider === "google") {
      const geminiErrorBody = await vapiResponse.text();
      const retryModel =
        voiceSelection.fallbackModels?.find((model) =>
          isOpenAIModelId(model),
        ) || VAPI_TENANT_DEFAULT_MODEL;
      const retryProvider = isGeminiModelId(retryModel)
        ? VAPI_VOICE_FALLBACK_PROVIDER
        : VAPI_TENANT_DEFAULT_PROVIDER;
      log.warn(
        "Vapi rejected Gemini outbound model; retrying with OpenAI voice fallback",
        {
          userId,
          agentId,
          customerNumber,
          model: voiceSelection.model,
          retryProvider,
          retryModel,
          error: geminiErrorBody.slice(0, 500),
        },
      );

      const fallbackPayload = {
        ...vapiPayload,
        assistant: {
          ...(vapiPayload.assistant as Record<string, unknown>),
          model: {
            ...(vapiPayload.assistant.model as Record<string, unknown>),
            provider: retryProvider,
            model: retryModel,
          },
        },
      } as any;
      delete fallbackPayload.assistant.model.fallbackModels;

      vapiResponse = await fetchWithRetry(
        "https://api.vapi.ai/call/phone",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vapiSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fallbackPayload),
        },
        20_000,
        "Vapi placeOutboundCall voice fallback",
        false,
      );
    }

    if (!vapiResponse.ok) {
      const errBody = await vapiResponse.text();
      log.warn("Vapi placeOutboundCall rejected", {
        userId,
        agentId,
        customerNumber: dialNumber,
        status: vapiResponse.status,
        error: errBody.slice(0, 500),
      });
      return { ok: false, status: 502, error: formatVapiCallError(errBody) };
    }
    const vapiData = await vapiResponse.json();
    if (vapiData?.id) {
      const { recordOutboundCallPlaced } =
        await import("./outbound-call-tracking");
      void recordOutboundCallPlaced({
        userId,
        agentId,
        vapiCallId: vapiData.id,
        customerNumber: dialNumber,
      });
    }
    return { ok: true, status: 200, callId: vapiData.id };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("Vapi API call failed after retries", {
      error: errMsg,
      userId,
      agentId,
      customerNumber,
    });
    return {
      ok: false,
      status: 502,
      error: `Voice carrier unavailable after retries: ${errMsg}`,
    };
  }
}

/**
 * Transfer an in-progress call to a phone number via Vapi's live call-control
 * URL (monitor.controlUrl). This is how the Account Holder "takes" a call from the
 * Wireline app: the agent warm-transfers the live caller to the Account Holder's
 * number. Uses Vapi only — no Twilio. The control URL is pre-authenticated by
 * Vapi (token embedded), so no Bearer is attached.
 *
 * The control URL is captured from the webhook and stored on signal_presence;
 * it's externally-sourced, so we SSRF-guard it and require a vapi.ai host
 * before issuing the request.
 */
export async function transferLiveCall(
  controlUrl: string,
  toNumber: string,
  content = "Transferring your call now — please hold.",
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!isAllowedVapiControlUrl(controlUrl)) {
    return { ok: false, status: 400, error: "Invalid control URL." };
  }

  try {
    const response = await fetchWithTimeout(
      controlUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "transfer",
          destination: { type: "number", number: toNumber },
          content,
        }),
      },
      10_000,
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log.warn("Vapi live transfer rejected", {
        status: response.status,
        body: body.slice(0, 200),
      });
      return {
        ok: false,
        status: response.status,
        error: "Transfer was rejected by the carrier.",
      };
    }
    return { ok: true, status: 200 };
  } catch (err) {
    log.error("Vapi live transfer failed", { error: getErrorMessage(err) });
    return {
      ok: false,
      status: 502,
      error: "Could not reach the voice carrier.",
    };
  }
}
