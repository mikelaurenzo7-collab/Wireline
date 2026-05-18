import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, ilike, sql, notInArray } from "drizzle-orm";
import {
  sanitizePhone,
  KNOWLEDGE_GAP_PREFIX,
  MAX_RUNTIME_LESSONS,
  ROLE_SPECIFIC_PROTOCOLS,
  buildCallerProfileBlock,
  OUTBOUND_ARCHETYPE_BY_ROLE,
  getArchetypeConfig,
  buildRoleToolDefs,
  VAPI_WEBHOOK_SECRET,
} from "./vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "./agent-runtime";
import { buildCustomerIntelBlock } from "./customer-intel";
import { resolveAgentTools } from "./agent-capabilities";
import { VAPI_TENANT_DEFAULT_MODEL } from "./claude-brain";

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
      .limit(500),
    drizzle
      .select()
      .from(schema.knowledge)
      .where(eq(schema.knowledge.agentId, webhookAgentId))
      .limit(500),
    drizzle
      .select()
      .from(schema.personality)
      .where(eq(schema.personality.agentId, webhookAgentId))
      .limit(1)
      .then((r) => r[0] || null),
    drizzle
      .select({ lesson: schema.agentLessons.lesson })
      .from(schema.agentLessons)
      .where(eq(schema.agentLessons.agentId, webhookAgentId))
      .orderBy(desc(schema.agentLessons.createdAt))
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
            description: schema.fleetTasks.description,
            createdAt: schema.fleetTasks.createdAt,
          })
          .from(schema.fleetTasks)
          .where(
            and(
              eq(schema.fleetTasks.userId, userId),
              eq(schema.fleetTasks.taskType, "customer_profile_captured"),
              ilike(schema.fleetTasks.description, `%${safeCallerPhone}%`),
            ),
          )
          .orderBy(desc(schema.fleetTasks.createdAt))
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
  ]);

  const _lessons = (lessonsData || [])
    .filter(
      (l: { lesson?: string | null }) =>
        l.lesson && typeof l.lesson === "string" && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX),
    )
    .map((l: { lesson?: string | null }) => l.lesson)
    .join("\n");

  const callerProfile = buildCallerProfileBlock(pastCallHistory || [], false);

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
  // Default brain: VAPI_TENANT_DEFAULT_MODEL (Sonnet, currently). Smarter
  // than Gemini Flash for objection handling + multi-turn CS work, half
  // the cost of Opus. Operators can override per-tenant via
  // settings.voice_llm_*. Source of truth: claude-brain.ts.
  const voiceLlmProvider = userSettings?.voice_llm_provider || "anthropic";
  const voiceLlmModel = userSettings?.voice_llm_model || VAPI_TENANT_DEFAULT_MODEL;

  const enabledToolNames = resolveAgentTools(agentRole, agentConfigRow?.enabledTools)
    .filter(
      (toolName) => toolName !== "send_text_message" || !!userSettings?.twilio_messaging_enabled,
    )
    .filter(
      (toolName) => toolName !== "lookup_phone_number" || !!userSettings?.twilio_lookup_enabled,
    );

  const archetype = isOutbound
    ? OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || "The Closer"
    : agentConfigRow?.archetype || "Receptionist";
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);

  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

  const systemPrompt = `
## IDENTITY & MISSION
You are ${agentConfigRow?.name || "Wireline Agent"}, a ${agentRole.replace(/_/g, " ")} specialist.

${callerProfile}
${customerIntelBlock}

${archetypeRules}
${leadContext}
${roleProtocol}
Today is ${currentDateTime}.
  `;

  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfigRow?.timezone,
    business_hours: agentConfigRow?.businessHours,
    compliance_mode: agentConfigRow?.complianceMode,
    disallowed_topics: agentConfigRow?.disallowedTopics,
    escalation_keywords: agentConfigRow?.escalationKeywords,
    business_variables: agentConfigRow?.businessVariables,
    out_of_hours_message: agentConfigRow?.outOfHoursMessage,
    kpi_focus: agentConfigRow?.kpiFocus,
  };
  const runtime = buildAgentRuntimeContext(systemPrompt, runtimeProfile);
  const firstMessage =
    !runtime.inHours && runtime.outOfHoursMessage
      ? runtime.outOfHoursMessage
      : agentConfigRow?.firstMessage || "Hello!";

  // Honor the operator's configured voice. Before this fix, every customer
  // assistant got Liam's default voice regardless of what they set in Fleet
  // Settings — silent override of their config. Direction-specific override:
  // voiceIdOutbound for outbound dial, voiceIdInbound for inbound, voiceId as
  // the shared fallback, and the platform default only if nothing is set.
  const PLATFORM_DEFAULT_VOICE_ID = "bIHbv24MWmeRgasZH58o";
  const directionalVoiceId = isOutbound
    ? agentConfigRow?.voiceIdOutbound
    : agentConfigRow?.voiceIdInbound;
  const resolvedVoiceId =
    directionalVoiceId || agentConfigRow?.voiceId || PLATFORM_DEFAULT_VOICE_ID;
  const resolvedVoiceProvider = agentConfigRow?.voiceProvider || "11labs";

  // Per-archetype silence timeout. Outbound SDRs need short patience (caller
  // dodging); CS agents need longer (caller thinking). Operator can override
  // per-agent via FleetSettings → Advanced.
  const archetypeSilenceDefault: Record<string, number> = {
    "The Closer": 2,
    "The Hunter": 2,
    "The Negotiator": 3,
    "The Collector": 3,
    Scheduler: 4,
    Receptionist: 5,
  };
  const silenceTimeoutSeconds =
    (agentConfigRow as any)?.silenceTimeoutSeconds ?? archetypeSilenceDefault[archetype] ?? 5;

  return {
    name: agentConfigRow?.name || "Wireline Agent",
    firstMessage: firstMessage,
    serverUrlSecret: VAPI_WEBHOOK_SECRET,
    silenceTimeoutSeconds,
    model: {
      provider: voiceLlmProvider,
      model: voiceLlmModel,
      systemPrompt: runtime.prompt,
      temperature: llmTemp,
    },
    voice: {
      provider: resolvedVoiceProvider,
      voiceId: resolvedVoiceId,
    },
    functions: buildRoleToolDefs(agentRole, enabledToolNames),
  };
}
