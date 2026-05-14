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
  VAPI_WEBHOOK_SECRET
} from "./vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "./agent-runtime";
import { buildCustomerIntelBlock } from "./customer-intel";
import { resolveAgentTools } from "./agent-capabilities";

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

export async function buildVapiAssistant({ message, agent, userSettings }: AssistantRequestPayload) {
  const webhookAgentId = agent.id;
  const userId = agent.user_id;
  const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
  const customerNumber = message.call?.customer?.number;
  const safeCallerPhone = sanitizePhone(customerNumber);

  const [agentConfigRow, directivesData, knowledgeData, personalityRow, lessonsData, pastCallHistory, capturedProfileRow, callerLeadRow] = await Promise.all([
    drizzle.select().from(schema.agents).where(eq(schema.agents.id, webhookAgentId)).limit(1).then(r => r[0] || null),
    drizzle.select().from(schema.directives).where(eq(schema.directives.agentId, webhookAgentId)).orderBy(desc(schema.directives.priority)).limit(500),
    drizzle.select().from(schema.knowledge).where(eq(schema.knowledge.agentId, webhookAgentId)).limit(500),
    drizzle.select().from(schema.personality).where(eq(schema.personality.agentId, webhookAgentId)).limit(1).then(r => r[0] || null),
    drizzle.select({ lesson: schema.agentLessons.lesson }).from(schema.agentLessons).where(eq(schema.agentLessons.agentId, webhookAgentId)).orderBy(desc(schema.agentLessons.createdAt)).limit(MAX_RUNTIME_LESSONS),
    safeCallerPhone
      ? drizzle.select({ summary: schema.callLogs.summary, intentLabel: schema.callLogs.intentLabel, sentiment: schema.callLogs.sentiment, createdAt: schema.callLogs.createdAt, direction: schema.callLogs.direction })
          .from(schema.callLogs)
          .where(and(eq(schema.callLogs.customerNumber, safeCallerPhone), eq(schema.callLogs.agentId, webhookAgentId)))
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(3)
      : Promise.resolve([]),
    safeCallerPhone && userId
      ? drizzle.select({ description: schema.fleetTasks.description, createdAt: schema.fleetTasks.createdAt })
          .from(schema.fleetTasks)
          .where(and(
            eq(schema.fleetTasks.userId, userId),
            eq(schema.fleetTasks.taskType, 'customer_profile_captured'),
            ilike(schema.fleetTasks.description, `%${safeCallerPhone}%`)
          ))
          .orderBy(desc(schema.fleetTasks.createdAt))
          .limit(1)
          .then(r => r[0] || null)
      : Promise.resolve(null),
    safeCallerPhone && userId
      ? drizzle.select({ customerName: schema.outboundLeads.customerName, status: schema.outboundLeads.status, context: schema.outboundLeads.context })
          .from(schema.outboundLeads)
          .where(and(
            eq(schema.outboundLeads.userId, userId),
            ilike(schema.outboundLeads.customerNumber, `%${safeCallerPhone}%`),
            notInArray(schema.outboundLeads.status, ['Blocked-DNC'])
          ))
          .orderBy(desc(schema.outboundLeads.createdAt))
          .limit(1)
          .then(r => r[0] || null)
      : Promise.resolve(null),
  ]);

  const _lessons = (lessonsData || [])
    .filter((l: { lesson?: string | null }) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
    .map((l: { lesson?: string | null }) => l.lesson)
    .join('\n');

  const callerProfile = buildCallerProfileBlock(pastCallHistory || [], false);

  const rawProfileDesc = capturedProfileRow?.description || "";
  const customerIntelBlock = buildCustomerIntelBlock(rawProfileDesc, false);

  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  let leadContext = "";
  if (callerLeadRow) {
    const name   = callerLeadRow.customerName || "this contact";
    const status = callerLeadRow.status || "Unknown";
    const ctx    = callerLeadRow.context || "(no prior context)";
    leadContext = isOutbound
      ? `MISSION OBJECTIVE: You are calling ${name} (CRM status: ${status}). REASON FOR CALL: ${ctx}`
      : `INBOUND CRM MATCH: This caller is ${name} (status: ${status}). PRIOR CONTEXT: ${ctx}`;
  }

  const agentRole = agentConfigRow?.role || DEFAULT_AGENT_ROLE;
  const voiceLlmProvider = userSettings?.voice_llm_provider || 'google';
  const voiceLlmModel = userSettings?.voice_llm_model || 'gemini-1.5-flash';
  
  const enabledToolNames = resolveAgentTools(agentRole, agentConfigRow?.enabledTools)
    .filter((toolName) => toolName !== "send_text_message" || !!userSettings?.twilio_messaging_enabled)
    .filter((toolName) => toolName !== "lookup_phone_number" || !!userSettings?.twilio_lookup_enabled);
    
  const archetype = isOutbound
    ? (OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || 'The Closer')
    : (agentConfigRow?.archetype || 'Receptionist');
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);

  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

  const systemPrompt = `
## IDENTITY & MISSION
You are ${agentConfigRow?.name || 'Wireline Agent'}, a ${agentRole.replace(/_/g, ' ')} specialist.

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
    (!runtime.inHours && runtime.outOfHoursMessage)
      ? runtime.outOfHoursMessage
      : (agentConfigRow?.firstMessage || "Hello!");

  return {
    name: agentConfigRow?.name || "Wireline Agent",
    firstMessage: firstMessage,
    serverUrlSecret: VAPI_WEBHOOK_SECRET,
    model: {
      provider: voiceLlmProvider,
      model: voiceLlmModel,
      systemPrompt: runtime.prompt,
      temperature: llmTemp,
    },
    voice: {
      provider: "11labs",
      voiceId: "bIHbv24MWmeRgasZH58o" 
    },
    functions: buildRoleToolDefs(agentRole, enabledToolNames)
  };
}
