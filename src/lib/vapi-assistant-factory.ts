import { db, log } from "./server-context";
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

  const [agentConfig, _directivesData, _knowledgeData, _personalityData, lessonsData, callerHistoryData, capturedProfileData, callerLeadData] = await Promise.all([
    db.from('wireline_agents').select('*').eq('id', webhookAgentId).single(),
    db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).order('priority', { ascending: false }).limit(500),
    db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId).limit(500),
    db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).single(),
    db.from('wireline_agent_lessons').select('lesson').eq('agent_id', webhookAgentId).order('created_at', { ascending: false }).limit(MAX_RUNTIME_LESSONS),
    safeCallerPhone
      ? db.from('wireline_call_logs')
          .select('summary, intent_label, sentiment, created_at, direction')
          .eq('customer_number', safeCallerPhone)
          .eq('agent_id', webhookAgentId)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    safeCallerPhone && userId
      ? db.from('wireline_fleet_tasks')
          .select('description, created_at')
          .eq('user_id', userId)
          .eq('task_type', 'customer_profile_captured')
          .ilike('description', `%${safeCallerPhone}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    safeCallerPhone && userId
      ? db.from('wireline_outbound_leads')
          .select('customer_name, status, context')
          .eq('user_id', userId)
          .ilike('customer_number', `%${safeCallerPhone}%`)
          .not('status', 'in', ['Blocked-DNC'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const _lessons = (lessonsData?.data || [])
    .filter((l: { lesson?: string }) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
    .map((l: { lesson?: string }) => l.lesson)
    .join('\n');

  const pastCallHistory: any[] = (callerHistoryData as any)?.data || [];
  const callerProfile = buildCallerProfileBlock(pastCallHistory, false);

  const rawProfileDesc = (capturedProfileData as any)?.data?.description || "";
  const customerIntelBlock = buildCustomerIntelBlock(rawProfileDesc, false);

  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  let leadContext = "";
  const callerLead: any = (callerLeadData as any)?.data || null;
  if (callerLead) {
    const name   = callerLead.customer_name || "this contact";
    const status = callerLead.status || "Unknown";
    const ctx    = callerLead.context || "(no prior context)";
    leadContext = isOutbound
      ? `MISSION OBJECTIVE: You are calling ${name} (CRM status: ${status}). REASON FOR CALL: ${ctx}`
      : `INBOUND CRM MATCH: This caller is ${name} (status: ${status}). PRIOR CONTEXT: ${ctx}`;
  }

  const agentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
  const voiceLlmProvider = userSettings?.voice_llm_provider || 'google';
  const voiceLlmModel = userSettings?.voice_llm_model || 'gemini-1.5-flash';
  
  const enabledToolNames = resolveAgentTools(agentRole, agentConfig?.data?.enabled_tools)
    .filter((toolName) => toolName !== "send_text_message" || !!userSettings?.twilio_messaging_enabled)
    .filter((toolName) => toolName !== "lookup_phone_number" || !!userSettings?.twilio_lookup_enabled);
    
  const archetype = isOutbound
    ? (OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || 'The Closer')
    : (agentConfig?.data?.archetype || 'Receptionist');
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);

  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

  const systemPrompt = `
## IDENTITY & MISSION
You are ${agentConfig?.data?.name || 'Wireline Agent'}, a ${agentRole.replace(/_/g, ' ')} specialist.

${callerProfile}
${customerIntelBlock}

${archetypeRules}
${leadContext}
${roleProtocol}
Today is ${currentDateTime}.
  `;

  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfig?.data?.timezone,
    business_hours: agentConfig?.data?.business_hours,
    compliance_mode: agentConfig?.data?.compliance_mode,
    disallowed_topics: agentConfig?.data?.disallowed_topics,
    escalation_keywords: agentConfig?.data?.escalation_keywords,
    business_variables: agentConfig?.data?.business_variables,
    out_of_hours_message: agentConfig?.data?.out_of_hours_message,
    kpi_focus: agentConfig?.data?.kpi_focus,
  };
  const runtime = buildAgentRuntimeContext(systemPrompt, runtimeProfile);
  const firstMessage =
    (!runtime.inHours && runtime.outOfHoursMessage)
      ? runtime.outOfHoursMessage
      : (agentConfig?.data?.first_message || "Hello!");

  return {
    name: agentConfig?.data?.name || "Wireline Agent",
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
