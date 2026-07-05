/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, ilike, sql, notInArray } from "drizzle-orm";
import {
  sanitizePhone,
  KNOWLEDGE_GAP_PREFIX,
  MAX_RUNTIME_LESSONS,
  MAX_RUNTIME_DIRECTIVES,
  MAX_RUNTIME_KNOWLEDGE,
  clampRuntimePromptPreservingTail,
  truncateRuntimeSnippet,
  ROLE_SPECIFIC_PROTOCOLS,
  buildCallerProfileBlock,
  OUTBOUND_ARCHETYPE_BY_ROLE,
  getArchetypeConfig,
  buildRoleToolDefsForTenant,
  VAPI_WEBHOOK_SECRET,
} from "./vapi-helpers";
import {
  buildAgentRuntimeContext,
  resolveAssistantBasePrompt,
  type AgentRuntimeProfile,
} from "./agent-runtime";
import { buildCustomerIntelBlock } from "./customer-intel";
import {
  getVoiceLatencyProfile,
  resolveElevenLabsSpeed,
  resolveOutboundStartSpeakingPlan,
  resolveVapiSpeechPipeline,
  VAPI_OUTBOUND_FIRST_MESSAGE_MODE,
} from "./voice-agent-profile";
import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  resolveVapiVoiceModelSelection,
  clampVoiceTemperature,
} from "./claude-brain";
import { getWirelinePersona } from "./wireline-agent-personas";
import type { WirelinePersonaId } from "./wireline-agent-escalation";

const DEFAULT_AGENT_ROLE = "customer_service";

export interface AssistantRequestPayload {
  message: {
    type: string;
    call?: any;
  };
  agent: {
    id: string;
    user_id: string;
  };
  userSettings: any;
}

export async function buildVapiAssistant({
  message,
  agent,
  userSettings,
}: AssistantRequestPayload) {
  const webhookAgentId = agent.id;
  const userId = agent.user_id;
  const isOutbound =
    message.type === "outboundPhoneCall" || message.call?.type === "outboundPhoneCall";
  const customerNumber = message.call?.customer?.number;
  const safeCallerPhone = sanitizePhone(customerNumber);

  const [
    agentConfigRow,
    directivesData,
    knowledgeData,
    personalityRow,
    lessonsData,
    pastCallHistory,
    capturedProfileRow,
    callerLeadRow,
    pronunciationDicts,
  ] = await Promise.all([
    drizzle
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, webhookAgentId))
      .limit(1)
      .then((r) => r[0] || null),
    drizzle
      .select()
      .from(schema.directives)
      .where(eq(schema.directives.agentId, webhookAgentId))
      .orderBy(desc(schema.directives.priority))
      .limit(MAX_RUNTIME_DIRECTIVES),
    drizzle
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.agentId, webhookAgentId))
      .orderBy(desc(schema.knowledge.createdAt))
      .limit(MAX_RUNTIME_KNOWLEDGE),
    drizzle
      .select()
      .from(schema.personality)
      .where(eq(schema.personality.agentId, webhookAgentId))
      .limit(1)
      .then((r) => r[0] || null),
    // Lesson injection — QA-filtered. Previously took the latest 5
    // lessons regardless of source-call quality, which meant a bad
    // call's "lesson" got equal weight as a great call's. Now we
    // LEFT JOIN call_logs and prefer lessons sourced from calls
    // with qa_score >= 70 (4-star equivalent) and a positive
    // outcome intent (booked / qualified > info > escalated).
    //
    // Lessons with no source call attached (e.g. Account Holder-injected
    // playbook lessons or adaptive_tuning syntheses) pass through
    // unfiltered — we trust those by default since they didn't come
    // from a regrettable call.
    drizzle
      .select({ lesson: schema.agentLessons.lesson })
      .from(schema.agentLessons)
      .leftJoin(schema.callLogs, eq(schema.agentLessons.sourceCallId, schema.callLogs.id))
      .where(
        and(
          eq(schema.agentLessons.agentId, webhookAgentId),
          sql`(${schema.agentLessons.lessonStatus} IS NULL OR ${schema.agentLessons.lessonStatus} = 'approved')`,
          // Either no source call (synthetic / Account Holder lesson),
          // OR a source call with qa_score >= 70.
          sql`(${schema.agentLessons.sourceCallId} IS NULL OR ${schema.callLogs.qaScore} >= 70)`,
        ),
      )
      .orderBy(
        // Ranked: outcome quality first, then recency. "booked" +
        // "qualified" intents lift to the top; "escalated" drops.
        sql`CASE
          WHEN ${schema.callLogs.intentLabel} = 'booked' THEN 0
          WHEN ${schema.callLogs.intentLabel} = 'qualified' THEN 1
          WHEN ${schema.callLogs.intentLabel} = 'info' THEN 2
          WHEN ${schema.callLogs.intentLabel} = 'escalated' THEN 3
          ELSE 4
        END`,
        desc(schema.agentLessons.createdAt),
      )
      .limit(MAX_RUNTIME_LESSONS),
    safeCallerPhone
      ? drizzle
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
              eq(schema.callLogs.customerNumber, safeCallerPhone),
              eq(schema.callLogs.agentId, webhookAgentId),
            ),
          )
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(3)
      : Promise.resolve([]),
    safeCallerPhone && userId
      ? drizzle
          .select({
            description: schema.followUpTasks.description,
            createdAt: schema.followUpTasks.createdAt,
          })
          .from(schema.followUpTasks)
          .where(
            and(
              eq(schema.followUpTasks.userId, userId),
              eq(schema.followUpTasks.taskType, "customer_profile_captured"),
              ilike(schema.followUpTasks.description, `%${safeCallerPhone}%`),
            ),
          )
          .orderBy(desc(schema.followUpTasks.createdAt))
          .limit(1)
          .then((r) => r[0] || null)
      : Promise.resolve(null),
    safeCallerPhone && userId
      ? drizzle
          .select({
            customerName: schema.outboundLeads.customerName,
            status: schema.outboundLeads.status,
            context: schema.outboundLeads.context,
          })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, userId),
              ilike(schema.outboundLeads.customerNumber, `%${safeCallerPhone}%`),
              notInArray(schema.outboundLeads.status, ["Blocked-DNC"]),
            ),
          )
          .orderBy(desc(schema.outboundLeads.createdAt))
          .limit(1)
          .then((r) => r[0] || null)
      : Promise.resolve(null),
    // Tenant's active pronunciation dictionaries — attached to the
    // 11labs voice config below so industry jargon (HVAC, ACL,
    // deposition) is pronounced correctly. Only dictionaries that
    // have been successfully synced to ElevenLabs (non-null IDs) and
    // are flagged active by the Account Holder are included.
    //
    // Failure-tolerant: if the table is missing on this environment
    // (migrate-pronunciation-dicts hasn't been run yet) or the query
    // errors, we treat it as an empty list and the assistant still
    // builds without dictionaries — pronunciation just falls back to
    // the platform default.
    userId
      ? drizzle
          .select({
            dictionaryId: schema.pronunciationDictionaries.elevenlabsDictionaryId,
            versionId: schema.pronunciationDictionaries.elevenlabsVersionId,
          })
          .from(schema.pronunciationDictionaries)
          .where(
            and(
              eq(schema.pronunciationDictionaries.userId, userId),
              eq(schema.pronunciationDictionaries.active, true),
            ),
          )
          .then((rows) =>
            rows
              .filter((r) => r.dictionaryId && r.versionId)
              .map((r) => ({
                pronunciation_dictionary_id: r.dictionaryId as string,
                version_id: r.versionId as string,
              })),
          )
          .catch((e) => {
            log.warn("pronunciation dict load failed — skipping", {
              error: e?.message,
              userId,
            });
            return [] as Array<{
              pronunciation_dictionary_id: string;
              version_id: string;
            }>;
          })
      : Promise.resolve([] as Array<{ pronunciation_dictionary_id: string; version_id: string }>),
  ]);

  let flowConfigBlock = "";
  if (
    agentConfigRow?.flowConfig &&
    Array.isArray(agentConfigRow.flowConfig) &&
    agentConfigRow.flowConfig.length > 0
  ) {
    const steps = agentConfigRow.flowConfig;
    let formattedSteps = steps
      .map((s: any, i: number) => {
        let stepStr = `[STAGE ${i + 1}: ${s.name}]\n- INSTRUCTIONS: ${s.instructions}`;
        if (s.transitionCondition && !s.isEndNode) {
          stepStr += `\n- TRANSITION CRITERIA: Proceed to stage ${i + 2} only when: ${s.transitionCondition}`;
        }
        if (s.isEndNode) {
          stepStr += `\n- END NODE: Gracefully end the call after completing these instructions.`;
        }
        return stepStr;
      })
      .join("\n\n");

    flowConfigBlock = `\n## CRITICAL CONVERSATION FLOW (MANDATORY)\nYou must progress through the following stages strictly in order. Do not skip stages unless explicitly forced by the caller. Start at STAGE 1.\n\n${formattedSteps}\n`;
  }

  const lessonsBlock = (() => {
    const lines = (lessonsData || [])
      .filter(
        (l: { lesson?: string | null }) =>
          l.lesson && typeof l.lesson === "string" && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX),
      )
      .map((l: { lesson?: string | null }) => truncateRuntimeSnippet(l.lesson as string));
    if (lines.length === 0) return "";
    return `\n## RECENT LESSONS (from high-quality calls)\n${lines.map((t) => `- ${t}`).join("\n")}\n`;
  })();

  const directivesBlock = (() => {
    const lines = (directivesData || [])
      .map((d: { content?: string | null }) => truncateRuntimeSnippet(d.content || ""))
      .filter(Boolean);
    if (lines.length === 0) return "";
    return `\n## Account Holder DIRECTIVES (priority order)\n${lines.map((t) => `- ${t}`).join("\n")}\n`;
  })();

  const knowledgeBlock = (() => {
    const lines = (knowledgeData || [])
      .map((k: { content?: string | null }) => truncateRuntimeSnippet(k.content || ""))
      .filter(Boolean);
    if (lines.length === 0) return "";
    return `\n## KNOWLEDGE BASE\n${lines.map((t) => `- ${t}`).join("\n")}\n`;
  })();

  const personalityBlock = personalityRow?.content?.trim()
    ? `\n## PERSONALITY\n${truncateRuntimeSnippet(personalityRow.content)}\n`
    : "";

  const callerProfile = buildCallerProfileBlock(pastCallHistory || [], false);

  /**
   * Sentiment-driven vibe shift — caller-history continuity.
   * If the LAST call with this same caller ended on a negative
   * sentiment note, inject an empathy directive ahead of the
   * normal vibe block. The agent will be SOFTER on this call:
   * no playfulness, acknowledge the prior issue, lead with
   * "I see we spoke before — how can I make this right?"
   *
   * Doesn't override the Account Holder's chosen vibe entirely — it
   * sits as a one-call override layer. On the call AFTER this
   * one (assuming sentiment recovers), the agent returns to
   * the configured vibe.
   *
   * Pure additive — emits empty string when no signal exists.
   */
  let sentimentShift = "";
  const lastCall = (pastCallHistory || [])[0] as { sentiment?: string | null } | undefined;
  if (lastCall?.sentiment === "negative") {
    sentimentShift = `\n## CALLER CONTINUITY — TONE OVERRIDE\nThis caller's PREVIOUS call ended on a negative note. Drop ALL playfulness on this call, regardless of your configured vibe. Open by acknowledging you remember them ("I see we connected before — how can I make this right?") and lead with empathy + speed. No jokes. No filler. If they reopen the prior issue, take it seriously immediately. Recovery is the only goal for the first 60 seconds; everything else is secondary.\n`;
  }

  const rawProfileDesc = capturedProfileRow?.description || "";
  const customerIntelBlock = buildCustomerIntelBlock(rawProfileDesc, false);

  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let leadContext = "";
  if (callerLeadRow) {
    const name = callerLeadRow.customerName || "this contact";
    const status = callerLeadRow.status || "Unknown";
    const ctx = callerLeadRow.context || "(no prior context)";
    leadContext = isOutbound
      ? `MISSION OBJECTIVE: You are calling ${name} (CRM status: ${status}). REASON FOR CALL: ${ctx}`
      : `INBOUND CRM MATCH: This caller is ${name} (status: ${status}). PRIOR CONTEXT: ${ctx}`;
  }

  const agentRole = agentConfigRow?.role || DEFAULT_AGENT_ROLE;
  // Per-agent reasoning-model override (Agent Studio) takes precedence over
  // the tenant default; both fall through to the platform default. The
  // resolver normalizes/validates against the Vapi-native provider set, so a
  // bad per-agent value can never reach Vapi — it lands on the tenant model.
  const voiceSelection = resolveVapiVoiceModelSelection({
    provider:
      agentConfigRow?.llmProvider ||
      userSettings?.voice_llm_provider ||
      VAPI_TENANT_DEFAULT_PROVIDER,
    model: agentConfigRow?.llmModel || userSettings?.voice_llm_model || VAPI_TENANT_DEFAULT_MODEL,
  });
  const voiceLlmProvider = voiceSelection.provider;
  const voiceLlmModel = voiceSelection.model;

  const archetype = isOutbound
    ? OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || "The Closer"
    : agentConfigRow?.archetype || "Receptionist";
  const { rules: archetypeRules, temp: archetypeTemp } = getArchetypeConfig(archetype);
  // Per-agent temperature override, clamped to the safe voice range; NULL
  // inherits the archetype's tuned default.
  const llmTemp = clampVoiceTemperature(agentConfigRow?.llmTemperature, archetypeTemp);

  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

  /**
   * Wireline-internal persona overlay.
   *
   * When this agent's `business_variables.wireline_internal` is true, it
   * means it's one of OUR own customer-facing agents (the ones answering
   * Mike's OWN_PHONE — Reception / Sales / Support). For those, we layer
   * the typed, declarative persona system prompt + first-message defined
   * in `wireline-agent-personas.ts` ON TOP of the normal tenant config.
   *
   * Critical: this is GATED. If a tenant agent doesn't carry the flag,
   * everything below behaves identically to before this patch — we are
   * additive, never destructive. The persona overlay only fires for
   * agents Mike has explicitly marked as platform-internal via the
   * /api/admin/provision-wireline-agents endpoint.
   *
   * The escalation rule engine + objection playbook are referenced
   * inside the persona's system prompt, so the LLM has the full
   * Wireline guardrails inline without us bloating every tenant
   * agent's prompt with them.
   */
  const bizVars = (agentConfigRow?.businessVariables || {}) as Record<string, unknown>;
  const isWirelineInternal = bizVars.wireline_internal === true;
  const wirelinePersonaId = (bizVars.wireline_persona_id as WirelinePersonaId | undefined) || null;
  const wirelinePersona =
    isWirelineInternal && wirelinePersonaId ? getWirelinePersona(wirelinePersonaId) : null;
  // Bilingual protocol — always injected. ElevenLabs voices are natively
  // multilingual (same voice speaks Spanish, French, etc.), so no voice
  // swap or secondary voice is needed. The LLM just responds in the
  // caller's language and ElevenLabs renders it in the same voice.
  //
  // The secondary voice swap (vapi-voice-swap.ts) remains as an OPTIONAL
  // enhancement for account holders who want a different-sounding native accent
  // (e.g. "Sarah" English → "Maria" Spanish). Most won't need it.
  const bilingualBlock = `
## BILINGUAL PROTOCOL
You are fluent in all languages. If the caller speaks in Spanish (or any non-English language):
- Match their language IMMEDIATELY in your next response. Do not ask for confirmation. Do not say "I'll switch to Spanish." Just respond in their language naturally, as if you always spoke it.
- If a caller ASKS to speak in Spanish (e.g. "¿habla español?", "do you speak Spanish?", "en español por favor"), respond warmly in Spanish: "¡Por supuesto! ¿En qué le puedo ayudar?"
- Maintain the SAME professional tone, personality, and helpfulness in both languages. You are the same person — just speaking their language.
- Once you switch, stay in that language unless the caller switches back to English.
- All your existing instructions, tools, and protocols apply identically in both languages.
`;

  const baseSystemPrompt = `
## IDENTITY & MISSION
You are ${agentConfigRow?.name || "Wireline Agent"}, a ${agentRole.replace(/_/g, " ")} specialist.

## VOICE DELIVERY RULES (MANDATORY)
- Ask one question per turn by default, but you may ask multiple questions at once if you need more context to answer sufficiently.
- Keep the first three turns under 25 words when possible.
- Maintain a consistent speaking pace from start to finish. Never speed up mid-call.
- When confirming details like email addresses, phone numbers, or spelling, slow down. Say each part with pauses between segments.
- Keep sentences under 20 words. Break complex information into short, digestible pieces.
- Use contractions naturally. "I'll" not "I will". "You're" not "you are".
- Never say technical terms, error codes, system names, or internal jargon to the caller. If something goes wrong, say "Let me note that and have someone follow up" — never "there was an error" or mention any system by name.
- If a tool or action fails silently, pivot gracefully. Offer an alternative path. Never tell the caller what broke.
${bilingualBlock}
${callerProfile}
${customerIntelBlock}
${sentimentShift}
${archetypeRules}
${leadContext}
${roleProtocol}
${flowConfigBlock}
${personalityBlock}
${directivesBlock}
${knowledgeBlock}
${lessonsBlock}
Today is ${currentDateTime}.
  `;

  // If a Wireline persona overlay applies, replace the base identity
  // block with the persona's full voice-optimized prompt. We still
  // append the dynamic blocks (caller profile, customer intel, sentiment
  // shift, lead context, current time) so personalization survives.
  //
  // An Account Holder-set `system_prompt_override` takes precedence over both
  // the auto-composed prompt and the persona overlay — it replaces the
  // base identity in the same additive way (override text leads, the
  // call-specific dynamic blocks follow). The runtime guardrails are
  // still appended below by buildAgentRuntimeContext, so compliance /
  // escalation / do-not-discuss / voice-consistency are never dropped.
  const callSpecificContext = `## CALL-SPECIFIC CONTEXT
${callerProfile}
${customerIntelBlock}
${sentimentShift}
${leadContext}
${flowConfigBlock}
${personalityBlock}
${directivesBlock}
${knowledgeBlock}
${lessonsBlock}
Today is ${currentDateTime}.
  `;

  const systemPrompt = resolveAssistantBasePrompt({
    override: agentConfigRow?.systemPromptOverride,
    personaPrompt: wirelinePersona?.systemPrompt,
    autoComposedPrompt: baseSystemPrompt,
    callSpecificContext,
  });

  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfigRow?.timezone,
    business_hours: agentConfigRow?.businessHours,
    compliance_mode: agentConfigRow?.complianceMode,
    disallowed_topics: agentConfigRow?.disallowedTopics,
    escalation_keywords: agentConfigRow?.escalationKeywords,
    business_variables: agentConfigRow?.businessVariables,
    out_of_hours_message: agentConfigRow?.outOfHoursMessage,
    kpi_focus: agentConfigRow?.kpiFocus,
    personality_vibe: (agentConfigRow as any)?.personalityVibe,
  };
  const runtime = buildAgentRuntimeContext(systemPrompt, runtimeProfile);
  // First-message resolution order:
  //   1. Out-of-hours override (always wins — caller hears the OOH msg)
  //   2. Account Holder-set firstMessage on the agent row
  //   3. Wireline persona overlay's first_message (if persona attached)
  //   4. Bare "Hello!" fallback
  // This means an Account Holder who overrides firstMessage on an internal
  // agent ALSO wins over the persona default — useful for seasonal
  // greetings ("Happy holidays from Wireline!") without rewriting the
  // persona definition.
  const firstMessage =
    !runtime.inHours && runtime.outOfHoursMessage
      ? runtime.outOfHoursMessage
      : agentConfigRow?.firstMessage || wirelinePersona?.firstMessage || "Hello!";

  // Honor the Account Holder's configured voice. Before this fix, every customer
  // assistant got Liam's default voice regardless of what they set in Assistants
  // Settings — silent override of their config. Direction-specific override:
  // voiceIdOutbound for outbound dial, voiceIdInbound for inbound, voiceId as
  // the shared fallback, and the platform default only if nothing is set.
  // Platform default voice — 11labs "Adam · Deep" (warm-male). Broad
  // fit across home services / medical / legal / real estate / SaaS.
  // Account Holders can override via AssistantSettings → Voice per-agent.
  // History: prior default was bIHbv24MWmeRgasZH58o (warm-female).
  // Switched after live A/B feedback that warm-male voices read as
  // more trustworthy + authoritative on B2B service calls.
  const PLATFORM_DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
  const directionalVoiceId = isOutbound
    ? agentConfigRow?.voiceIdOutbound
    : agentConfigRow?.voiceIdInbound;
  // Voice resolution order (mirrors firstMessage logic above):
  //   1. Directional override (Account Holder set inbound/outbound voice)
  //   2. Account Holder's agent-row voiceId
  //   3. Wireline persona overlay's voice_id (if persona attached)
  //   4. Platform default (Adam · Deep)
  const resolvedVoiceId =
    directionalVoiceId ||
    agentConfigRow?.voiceId ||
    wirelinePersona?.voiceId ||
    PLATFORM_DEFAULT_VOICE_ID;
  const resolvedVoiceProvider = agentConfigRow?.voiceProvider || "11labs";

  // Per-archetype silence timeout. Outbound SDRs need short patience (caller
  // dodging); CS agents need slightly longer (caller thinking). Tier-independent
  // — every tenant gets the same snappy turn-taking. Account Holder can override
  // per-agent via AssistantSettings → Advanced.
  const voiceLatency = getVoiceLatencyProfile({
    archetype,
    role: agentRole,
    isOutbound,
  });
  const silenceTimeoutSeconds =
    (agentConfigRow as any)?.silenceTimeoutSeconds ?? voiceLatency.silenceTimeoutSeconds;

  // ElevenLabs speed control — Account Holder-set per-agent multiplier in
  // AssistantSettings → Voice. The DB column is `numeric(3,2)` which Postgres
  // returns as a string via pg; coerce to Number and clamp to the
  // documented ElevenLabs range (0.7 – 1.2) so a corrupted row can't
  // ship a value Vapi/EL would reject. Only attach when the provider
  // is 11labs — OpenAI's voice block doesn't take a `speed` param and
  // including it would make Vapi reject the request.
  //
  // Docs: https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control
  const parsedVoiceSpeed = resolveElevenLabsSpeed((agentConfigRow as any)?.voiceSpeed, {
    outbound: isOutbound,
  });

  // ElevenLabs voice fine-tuning quality params. Account Holder-set per-agent
  // in AssistantSettings → Voice fine-tuning. Mirrors the four knobs in EL's
  // `voice_settings`: stability, similarity_boost, style, use_speaker_boost.
  // Stored as numeric(3,2) in PG (pg returns as string) so we coerce +
  // clamp to [0,1] before passing to Vapi. NULL is treated as "use EL
  // defaults" — we still pass them through so the Account Holder's UI value
  // is authoritative.
  //
  // Only attached when provider is 11labs; OpenAI's voice block ignores
  // these and Vapi would reject the request if we sent them.
  //
  // Vapi field names are camelCase per their assistant schema:
  // https://docs.vapi.ai/api-reference/assistants/create
  //
  // Docs (ElevenLabs):
  // https://elevenlabs.io/docs/api-reference/text-to-speech/convert#request.body.voice_settings
  const clamp01 = (v: unknown, fallback: number): number => {
    if (v == null) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  };
  //   - stability 0.65 (was 0.50): high stability dramatically reduces
  //     intra-call prosody variance — the voice sounds rock-solid
  //     consistent sentence-to-sentence. The 0.50 setting still allowed
  //     noticeable speed shifts mid-call, especially when the LLM output
  //     switched between conversational and information-dense content.
  //   - similarityBoost 0.80 (was 0.78): tightens fidelity to the
  //     trained voice without crossing into over-modeled territory.
  //   - style 0.10 (was 0.25): style adds emotional inflection which
  //     causes cadence oscillation — the TTS rushes through excited
  //     parts and drags on calm ones. 0.10 gives minimal warmth
  //     without ANY perceptible speed swings. The LLM prompt already
  //     handles emotional range; TTS should just render consistently.
  //     Account Holders can override via AssistantSettings → Voice fine-tuning.
  const parsedStability = clamp01((agentConfigRow as any)?.voiceStability, 0.65);
  const parsedSimilarityBoost = clamp01((agentConfigRow as any)?.voiceSimilarityBoost, 0.8);
  const parsedStyle = clamp01((agentConfigRow as any)?.voiceStyle, 0.1);
  // PG returns boolean as JS boolean — but a `null` (column missing
  // pre-migration) defaults to EL's spec'd true.
  const rawSpeakerBoost = (agentConfigRow as any)?.voiceSpeakerBoost;
  const parsedSpeakerBoost = rawSpeakerBoost == null ? true : Boolean(rawSpeakerBoost);

  // Brand sign-off — Vapi speaks `endCallMessage` via the configured TTS
  // when the assistant terminates the call (e.g. caller says goodbye, or
  // the assistant's flow hits an end node). We can't inject the brand
  // sting MP3 here directly — Vapi's `endCallMessage` field is a string,
  // not a media URL — so the Account Holder's chosen TTS voice speaks this
  // phrase. The matching audio file (public/sounds/wireline-end-sting.mp3)
  // is available for any non-Vapi path that CAN play media (e.g. the
  // post-call digest player in the dashboard, the marketing demo, etc.).
  // Account Holder override lives in agentConfigRow.endCallMessage when set.
  const endCallMessage =
    (agentConfigRow as any)?.endCallMessage ||
    wirelinePersona?.endCallMessage ||
    "Thanks for calling. Have a great rest of your day.";

  // Pre-transfer cue — same constraint as above: Vapi speaks
  // `transferPlan.message` via TTS, not as an audio URL. The matching
  // chime MP3 is in public/sounds/wireline-transfer-chime.mp3 and is
  // wired into the Twilio failover webhook's <Play> verb (where audio
  // URLs work natively). For Vapi-runtime transfers we ship a short
  // spoken phrase + use warm-transfer-say-message so the destination
  // hears the brand greeting; the caller hears the assistant's transfer
  // sentence before being bridged.
  const transferMessage = "Connecting you now. One moment.";
  const speechPipeline = resolveVapiSpeechPipeline();

  return {
    name: agentConfigRow?.name || "Wireline Agent",
    firstMessage: firstMessage,
    ...(isOutbound ? { firstMessageMode: VAPI_OUTBOUND_FIRST_MESSAGE_MODE } : {}),
    serverUrlSecret: VAPI_WEBHOOK_SECRET,
    silenceTimeoutSeconds,
    // Brand voice — what the assistant says on graceful call end.
    endCallMessage,
    // Default transfer plan applied to every transferCall tool invocation.
    // Mode is warm-transfer-say-message so the destination party hears
    // our handoff phrase before the customer is bridged. Vapi's
    // transferDestinationNumber is set by the tool call at runtime —
    // we only fix the message + mode here.
    transferPlan: {
      mode: "warm-transfer-say-message",
      message: transferMessage,
    },
    // Latency tuning — these collectively shave ~600-900ms off the
    // perceived "agent felt slow" gap. Three knobs:
    //   1. responseDelaySeconds: 0 — Vapi waits this long after the
    //      caller stops talking before starting to speak. Default is
    //      ~0.4s, which lets the LLM stream first-token. With 11labs
    //      streaming on the TTS side we can go straight to 0.
    //   2. numWordsToInterruptAssistant: 2 — caller can barge in after
    //      saying just 2 words. Default 3 felt like the agent was
    //      steamrolling.
    //   3. backgroundDenoisingEnabled: false — adds latency to the
    //      audio pipeline; usually unnecessary on modern handsets.
    responseDelaySeconds: voiceLatency.responseDelaySeconds,
    numWordsToInterruptAssistant: voiceLatency.numWordsToInterruptAssistant,
    backgroundDenoisingEnabled: false,
    backchannelingEnabled: true,
    clientMessages: [
      "transcript",
      "hang",
      "function-call",
      "speech-update",
      "metadata",
      "conversation-update",
    ],
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "hang",
      "function-call",
      "speech-update",
    ],
    // Subtle background office ambience by default. A real receptionist
    // sits at a desk with faint room tone, typing, and distant voices —
    // pure silence between agent utterances reads as "robocall". Vapi's
    // "office" track is the closest match to a small business front desk
    // and is the same texture leading voice-AI products (Air, Bland)
    // ship by default. Account Holders can override via AssistantSettings →
    // Ambient atmosphere (off / office / phone-internal), and HIPAA /
    // legal use cases that need recorded silence can opt out to "off".
    backgroundSound: (agentConfigRow as any)?.ambientNoise || "office",
    // Smart endpointing — instead of a fixed timeout, use LiveKit's
    // turn-detection model to decide when the caller has actually
    // finished a thought. waitSeconds: 0.05 is the minimum hold before
    // we even consider responding (filter out caller breath); the
    // smartEndpointingPlan adapts the actual silence-to-respond gap
    // based on the audio + transcript context. Matches the showcase
    // assistant; the previous fixed-timeout behaviour was prone to
    // either interrupting (too short) or feeling sluggish (too long).
    startSpeakingPlan: isOutbound
      ? resolveOutboundStartSpeakingPlan(speechPipeline)
      : speechPipeline.startSpeakingPlan,
    model: {
      provider: voiceLlmProvider,
      model: voiceLlmModel,
      ...(voiceSelection.fallbackModels?.length
        ? { fallbackModels: voiceSelection.fallbackModels }
        : {}),
      systemPrompt: clampRuntimePromptPreservingTail(runtime.prompt),
      temperature: llmTemp,
    },
    voice: {
      provider: resolvedVoiceProvider,
      voiceId: resolvedVoiceId,
      // Pin the ElevenLabs TTS model explicitly. Without this, Vapi
      // silently auto-selects between eleven_turbo_*, eleven_flash_*,
      // eleven_multilingual_*, and eleven_v3 mid-call (typically a
      // fast model for the first audio-out, then a higher-quality
      // model for subsequent turns). Different models render the same
      // voiceId with noticeably different prosody and cadence — the
      // caller hears "the agent's voice shifted halfway through" even
      // though voiceId never changed. Pinning eleven_flash_v2_5 keeps
      // every utterance on the same TTS engine for the full call.
      // Reverted from turbo_v2_5 — Account Holder preferred the ~50ms TTFA
      // savings over the slight prosody bump; with the Claude Haiku
      // LLM already adding ~400ms to TTFT, every TTS millisecond
      // counts toward perceived snappiness.
      ...(resolvedVoiceProvider === "11labs" ? { model: "eleven_flash_v2_5" } : {}),
      // 11labs-specific streaming optimization. 4 is the max — slight
      // quality trade for fastest first-audio-out. Most call quality
      // differences are imperceptible vs the latency win.
      optimizeStreamingLatency: voiceLatency.optimizeStreamingLatency,
      // ElevenLabs speed control (Account Holder-set, 0.7–1.2). Vapi forwards
      // this to ElevenLabs as `voice.eleven_labs.speed`. Only attach
      // when the resolved provider is 11labs and the value differs from
      // the neutral default so we don't bloat every assistant payload
      // with a no-op. Slower for elderly customers (~0.85), faster for
      // impatient callers (~1.1).
      ...(resolvedVoiceProvider === "11labs" && parsedVoiceSpeed !== 1.0
        ? { speed: parsedVoiceSpeed }
        : {}),
      // ElevenLabs voice fine-tuning quality params. Account Holder-set per-
      // agent — most impactful on cloned voices where the source
      // recording quality dictates how much room there is to tune.
      // Always passed when provider is 11labs (even at defaults) so
      // the Account Holder's UI value is authoritative — otherwise EL would
      // apply ITS defaults and diverge from what the slider shows.
      // Map our snake_case schema → Vapi's camelCase voice schema:
      //   stability             → stability
      //   similarity_boost      → similarityBoost
      //   style                 → style
      //   speaker_boost         → useSpeakerBoost
      ...(resolvedVoiceProvider === "11labs"
        ? {
            stability: parsedStability,
            similarityBoost: parsedSimilarityBoost,
            style: parsedStyle,
            useSpeakerBoost: parsedSpeakerBoost,
            fallbackPlan: {
              voices: [
                {
                  provider: "vapi",
                  voiceId: "Elliot",
                },
              ],
            },
          }
        : {}),
      // Per-tenant pronunciation dictionaries — only valid when the
      // resolved provider is 11labs (Vapi ignores them for other TTS
      // providers and would warn). Vapi forwards these to ElevenLabs
      // as `voice.eleven_labs.pronunciation_dictionary_locators` at
      // synthesis time. Empty array stays absent from the config so
      // we don't bloat the assistant payload for tenants who haven't
      // configured any dictionaries.
      ...(pronunciationDicts.length > 0 && resolvedVoiceProvider === "11labs"
        ? { pronunciationDictionaryLocators: pronunciationDicts }
        : {}),
    },
    // Explicit transcriber — Deepgram Nova-3 is the current best-in-class
    // streaming STT (~6.8% WER, 25% better than Nova-2). Nova-3 also
    // handles code-switching natively, which is critical for the mid-call
    // language swap (vapi-voice-swap.ts). Pinning the model explicitly
    // (vs relying on Vapi defaults) protects us from silent upstream
    // model swaps that could regress accuracy.
    transcriber: speechPipeline.transcriber,
    // Voicemail detection — Vapi's ML-based answering-machine detector.
    // When triggered, the assistant skips its first message + can
    // optionally leave a custom voicemail. Huge cost saver on outbound:
    // we don't pay for 30 seconds of LLM tokens talking to a robot.
    voicemailDetection: {
      provider: "twilio",
      voicemailDetectionTypes: ["machine_end_beep", "machine_end_silence"],
      enabled: true,
      machineDetectionTimeout: 15,
    },
    // Custom voicemail message — concise, branded with the TENANT's
    // company name. Uses business_name variable so customers hear the
    // business ("Acme Plumbing"), not the agent's first name.
    // Saves LLM cost vs. having the model improvise.
    voicemailMessage: `Hi, this is ${(bizVars.business_name as string) || agentConfigRow?.name || "your Wireline agent"} calling. Sorry we missed you — feel free to call us back at any time and we'll be happy to help. Thanks!`,
    // Always record so we can replay + retrain. Account Holder can disable per-
    // agent if HIPAA mode is on.
    monitorPlan: {
      listenEnabled: true,
      controlEnabled: true,
    },
    recordingEnabled: true,
    // Post-call analysis — Vapi runs these prompts against the
    // transcript after the call ends + surfaces results in webhook.
    // Better than the default generic summary: pulls out caller intent,
    // outcome, and any commitments the agent made.
    analysisPlan: {
      summaryPrompt:
        "Summarize this call in 2-3 sentences. Focus on: (1) what the caller wanted, (2) what the agent did, (3) any follow-up the agent committed to.",
      structuredDataPrompt: "Extract structured data from this call.",
      structuredDataSchema: {
        type: "object",
        properties: {
          caller_intent: {
            type: "string",
            description:
              "One of: book_appointment, ask_question, complaint, sales_inquiry, support, transfer_request, other",
          },
          outcome: {
            type: "string",
            description:
              "One of: resolved, scheduled, transferred, voicemail, unresolved, callback_needed",
          },
          commitments: {
            type: "array",
            items: { type: "string" },
            description:
              "List of any commitments the agent made (e.g., 'will send invoice by 5pm', 'will call back tomorrow')",
          },
          sentiment: {
            type: "string",
            description: "One of: positive, neutral, negative, frustrated",
          },
        },
      },
      successEvaluationPrompt:
        "Did the agent successfully address what the caller wanted? Reply with 'true' or 'false' only.",
    },
    functions: await buildRoleToolDefsForTenant(
      agentRole,
      agentConfigRow?.enabledTools,
      userId,
      userSettings?.aiTier,
      {
        twilioMessaging: !!userSettings?.twilioMessagingEnabled,
        twilioLookup: !!userSettings?.twilioLookupEnabled,
      },
    ),
  };
}
