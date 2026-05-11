/**
 * src/lib/vapi-client.ts
 *
 * Client logic for interacting with the Vapi API for outbound dialing.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { db, log, fetchWithTimeout } from "./server-context";
import { isDncBlocked } from "./compliance";
import { sanitizePhone, KNOWLEDGE_GAP_PREFIX, MAX_RUNTIME_LESSONS, buildCallerProfileBlock, OUTBOUND_ARCHETYPE_BY_ROLE, getArchetypeConfig, ROLE_SPECIFIC_PROTOCOLS, buildRoleToolDefs } from "./vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "./agent-runtime";
import { buildCustomerIntelBlock } from "./customer-intel";
import { DEFAULT_AGENT_ROLE } from "./agent-constants";

export type PlaceCallResult = {
  ok: boolean;
  status: number;
  error?: string;
  callId?: string;
};

function buildOutboundFirstMessage(role: string, agentName: string, customerName?: string | null): string {
  const name = agentName || "your representative";
  const firstName = customerName?.trim() ? customerName.trim().split(" ")[0] : null;
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

  const { data: ownedAgent } = await db
    .from('wireline_agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!ownedAgent) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  const { data: userSettings } = await db.from('wireline_settings').select('*').eq('user_id', userId).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  if (subscriptionStatus !== 'active') {
    return { ok: false, status: 403, error: "Access Denied: Please upgrade your billing plan to access outbound dialing." };
  }

  if (customerNumber && await isDncBlocked(userId, customerNumber)) {
    return { ok: false, status: 403, error: "DNC blocked: this number is on the Do Not Call list." };
  }

  const settings = userSettings;
  const vapiSecret = process.env.VAPI_PRIVATE_KEY;
  if (!vapiSecret || !settings?.vapi_phone_number_id) {
    return { ok: false, status: 400, error: "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets." };
  }

  const safeOutboundPhone = sanitizePhone(customerNumber);
  const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData, outboundCallerHistory, outboundCapturedProfile] = await Promise.all([
    db.from('wireline_agents').select('*').eq('id', agentId).single(),
    db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).order('priority', { ascending: false }).limit(500),
    db.from('wireline_knowledge').select('content').eq('agent_id', agentId).limit(500),
    db.from('wireline_personality').select('content').eq('agent_id', agentId).single(),
    db.from('wireline_agent_lessons').select('lesson').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(MAX_RUNTIME_LESSONS),
    safeOutboundPhone
      ? db.from('wireline_call_logs')
          .select('summary, intent_label, sentiment, created_at, direction')
          .eq('customer_number', safeOutboundPhone)
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    safeOutboundPhone
      ? db.from('wireline_fleet_tasks')
          .select('description, created_at')
          .eq('agent_id', agentId)
          .eq('task_type', 'customer_profile_captured')
          .ilike('description', `%${safeOutboundPhone}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!agentConfig?.data) {
    return { ok: false, status: 404, error: `Agent ${agentId} not found.` };
  }

  const lessons = (lessonsData?.data || [])
    .filter((l: any) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
    .map((l: any) => l.lesson)
    .join('\n');

  const outboundPastCalls: any[] = (outboundCallerHistory as any)?.data || [];
  const outboundCallerProfile = buildCallerProfileBlock(outboundPastCalls, true);

  const outboundRawProfileDesc = (outboundCapturedProfile as any)?.data?.description || "";
  const outboundCustomerIntelBlock = buildCustomerIntelBlock(outboundRawProfileDesc, true);

  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const outboundAgentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
  const archetype = OUTBOUND_ARCHETYPE_BY_ROLE[outboundAgentRole] || agentConfig?.data?.archetype || 'The Closer';
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);
  const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';
  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[outboundAgentRole] || "";
  const voiceLlmProvider = settings?.voice_llm_provider || 'google';
  const voiceLlmModel = settings?.voice_llm_model || 'gemini-1.5-flash';

  const systemPrompt = `
## IDENTITY & OUTBOUND MISSION
You are ${agentConfig?.data?.name || "a scheduling agent"}, a ${outboundAgentRole.replace(/_/g, ' ')} specialist making an outbound call.
${ambientNoiseActive ? "You are operating from a professional office environment. Speak with focused, professional energy." : ""}

${outboundCallerProfile}

${outboundCustomerIntelBlock}

## YOUR PROFESSIONAL CHARACTER & METHOD
${personalityData?.data?.content || "You are a highly professional, empathetic, and effective representative who puts the caller's outcome first."}

## YOUR TACTICAL APPROACH FOR THIS ROLE
${archetypeRules}

## ⚡ OUTBOUND CALL OBJECTIVE — EXECUTE THIS
You are calling ${customerName || "a customer"}.
Objective: ${context || "Check in and offer assistance."}
Execute this objective naturally — integrate it into the conversation, don't read it like a script.

${agentConfig?.data?.website_url ? `## COMPANY WEBSITE\nYour company's official website: ${agentConfig.data.website_url}. For detailed specs, pricing pages, or information not in your knowledge base, direct the contact here or offer to send the link by email.` : ""}

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
- If the contact is warm and engaged: reciprocate the energy. Build rapport before going to the objective.
- If the contact says it's a bad time: "Of course — when would be a better time? I can call back at [specific time]."
- Never push through emotional resistance. Read the room and adapt.

## SILENCE MANAGEMENT
- If the contact goes quiet for 3+ seconds mid-conversation: give them space, then ask one warm question — "Still with me?" 
- If silence extends to 15+ seconds: "Take your time — I'm here." Never assume silence means disinterest.
- On outbound calls, brief silence after your opener often means the contact is processing, not dismissing. Be patient.

## OUTBOUND CONVERSATION DISCIPLINE
Today is ${currentDateTime} (Eastern Time). Calculate specific dates for "tomorrow," "next week," etc.
- Response target: 15–20 words. Outbound callers are often interrupted — be concise and high-value from the first word.
- Opener discipline: No "How are you today?" No filler. Get to the reason for the call within the first 20 words.
- One question per turn. Always.
- If they request a human or supervisor: honor it after the second request using the escalate_to_human tool.
- Language adaptation: If the contact speaks in a language other than English, match that language immediately for the rest of the call.
- Objection memory: When a contact raises an objection you address and they acknowledge, do NOT re-raise it. Each objection is resolved once, then set aside.

## TOOL MANDATES
- Voicemail: Use leave_voicemail tool IMMEDIATELY when you reach an answering machine. Do not start speaking first.
- Escalation: If the contact asks for a human/supervisor (second request) or uses legal/liability language, use escalate_to_human tool with a clear "reason" describing why. Never escalate without stating the reason.
- Callback scheduling: If the contact asks to be called back at a specific time, use schedule_callback tool immediately. Calculate the exact ISO datetime from what they say and confirm it back to them. "Perfect — I have you down for [exact time]. You'll hear from me then."
- Email follow-up: If the contact wants information sent: use send_email tool. "I'll send that to you right now — what email?"
- Lead outcome: Use update_lead_status at the END of every live call — never leave the outcome unlogged.
- Tasks: Use create_fleet_task for any promised follow-up that requires human action.
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

## ABSOLUTE OPERATOR RULES
${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n') || "Follow all standard professional and ethical guidelines."}

## KNOWLEDGE BASE
${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n') || "No specific knowledge base entries loaded."}
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
  if (!runtime.inHours) {
    return {
      ok: false,
      status: 409,
      error:
        runtime.outOfHoursMessage
        || "Outbound dialing is suspended outside this agent's configured business hours.",
    };
  }
  const finalSystemPrompt = runtime.prompt;

  const outboundServerUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/vapi-webhook?agentId=${agentId}`
    : undefined;

  const vapiPayload = {
    phoneNumberId: settings.vapi_phone_number_id,
    customer: { number: customerNumber },
    assistant: {
      name: agentConfig?.data?.name || "Wireline Outbound Agent",
      firstMessage: agentConfig?.data?.first_message || buildOutboundFirstMessage(outboundAgentRole, agentConfig?.data?.name || "your representative", customerName),
      backgroundSound: agentConfig?.data?.ambient_noise || 'off',
      ...(outboundServerUrl && { serverUrl: outboundServerUrl }),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      serverMessages: ["tool-calls", "status-update", "conversation-update", "end-of-call-report"],
      model: {
        provider: voiceLlmProvider,
        model: voiceLlmModel,
        systemPrompt: finalSystemPrompt,
        temperature: llmTemp,
        functions: buildRoleToolDefs(outboundAgentRole),
      },
      recordingEnabled: true,
      voice: {
        provider: agentConfig?.data?.voice_provider_outbound || agentConfig?.data?.voice_provider || "11labs",
        voiceId: agentConfig?.data?.voice_id_outbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o",
      },
    },
  };

  const vapiResponse = await fetchWithTimeout("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${vapiSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vapiPayload),
  }, 20_000);

  if (!vapiResponse.ok) {
    const errBody = await vapiResponse.text();
    return { ok: false, status: 502, error: `Vapi API Error: ${errBody}` };
  }
  const vapiData = await vapiResponse.json();
  return { ok: true, callId: vapiData.id };
}
