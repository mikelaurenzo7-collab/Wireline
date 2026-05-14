/**
 * src/lib/vapi-client.ts
 *
 * Client logic for interacting with the Vapi API for outbound dialing.
 * Extracted from server.ts to avoid circular dependencies.
 */

import { drizzle, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
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

  const subscriptionStatus = userSettings?.subscriptionStatus || 'active';
  if (subscriptionStatus !== 'active') {
    return { ok: false, status: 403, error: "Access Denied: Please upgrade your billing plan to access outbound dialing." };
  }

  if (customerNumber && await isDncBlocked(userId, customerNumber)) {
    return { ok: false, status: 403, error: "DNC blocked: this number is on the Do Not Call list." };
  }

  const settings = userSettings;
  const vapiSecret = process.env.VAPI_PRIVATE_KEY;
  if (!vapiSecret || !settings?.vapiPhoneNumberId) {
    return { ok: false, status: 400, error: "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets." };
  }

  const safeOutboundPhone = sanitizePhone(customerNumber);
  const [
    agentRes,
    directivesRes,
    knowledgeRes,
    personalityRes,
    lessonsRes,
    outboundCallerHistoryRes,
    outboundCapturedProfileRes
  ] = await Promise.all([
    drizzle.select().from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1),
    drizzle.select().from(schema.directives).where(eq(schema.directives.agentId, agentId)).orderBy(desc(schema.directives.priority)).limit(500),
    drizzle.select().from(schema.knowledge).where(eq(schema.knowledge.agentId, agentId)).limit(500),
    drizzle.select().from(schema.personality).where(eq(schema.personality.agentId, agentId)).limit(1),
    drizzle.select().from(schema.agentLessons).where(eq(schema.agentLessons.agentId, agentId)).orderBy(desc(schema.agentLessons.createdAt)).limit(MAX_RUNTIME_LESSONS),
    safeOutboundPhone
      ? drizzle.select({ summary: schema.callLogs.summary, intentLabel: schema.callLogs.intentLabel, sentiment: schema.callLogs.sentiment, createdAt: schema.callLogs.createdAt, direction: schema.callLogs.direction })
          .from(schema.callLogs)
          .where(and(eq(schema.callLogs.customerNumber, safeOutboundPhone), eq(schema.callLogs.agentId, agentId)))
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(3)
      : Promise.resolve([]),
    safeOutboundPhone
      ? drizzle.select({ description: schema.fleetTasks.description, createdAt: schema.fleetTasks.createdAt })
          .from(schema.fleetTasks)
          .where(and(eq(schema.fleetTasks.agentId, agentId), eq(schema.fleetTasks.taskType, 'customer_profile_captured'), ilike(schema.fleetTasks.description, `%${safeOutboundPhone}%`)))
          .orderBy(desc(schema.fleetTasks.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const agentConfig = agentRes[0];
  if (!agentConfig) {
    return { ok: false, status: 404, error: `Agent ${agentId} not found.` };
  }

  const lessons = (lessonsRes || [])
    .filter((l: any) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
    .map((l: any) => l.lesson)
    .join('\n');

  const outboundPastCalls: any[] = outboundCallerHistoryRes || [];
  const outboundCallerProfile = buildCallerProfileBlock(outboundPastCalls, true);

  const outboundRawProfileDesc = outboundCapturedProfileRes[0]?.description || "";
  const outboundCustomerIntelBlock = buildCustomerIntelBlock(outboundRawProfileDesc, true);

  const currentDateTime = new Date().toLocaleString('en-US', { 
    timeZone: agentConfig.timezone || 'America/New_York', 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  const outboundAgentRole = agentConfig.role || DEFAULT_AGENT_ROLE;
  const archetype = OUTBOUND_ARCHETYPE_BY_ROLE[outboundAgentRole] || agentConfig.archetype || 'The Closer';
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);
  const ambientNoiseActive = agentConfig.ambientNoise && agentConfig.ambientNoise !== 'off';
  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[outboundAgentRole] || "";
  const voiceLlmProvider = settings?.voiceLlmProvider || 'google';
  const voiceLlmModel = settings?.voiceLlmModel || 'gemini-1.5-flash';

  const systemPrompt = `
## IDENTITY & OUTBOUND MISSION
You are ${agentConfig.name || "a scheduling agent"}, a ${outboundAgentRole.replace(/_/g, ' ')} specialist making an outbound call.
${ambientNoiseActive ? "You are operating from a professional office environment. Speak with focused, professional energy." : ""}

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
${(directivesRes || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n') || "Follow all standard professional and ethical guidelines."}

## KNOWLEDGE BASE
${(knowledgeRes || []).map((k: any) => `- ${k.content}`).join('\n') || "No specific knowledge base entries loaded."}
    `;

  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfig.timezone,
    business_hours: agentConfig.businessHours,
    compliance_mode: agentConfig.complianceMode,
    disallowed_topics: agentConfig.disallowedTopics,
    escalation_keywords: agentConfig.escalationKeywords,
    business_variables: agentConfig.businessVariables,
    out_of_hours_message: agentConfig.outOfHoursMessage,
    kpi_focus: agentConfig.kpiFocus,
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
    phoneNumberId: settings.vapiPhoneNumberId,
    customer: { number: customerNumber },
    assistant: {
      name: agentConfig.name || "Wireline Outbound Agent",
      firstMessage: agentConfig.firstMessage || buildOutboundFirstMessage(outboundAgentRole, agentConfig.name || "your representative", customerName),
      backgroundSound: agentConfig.ambientNoise || 'off',
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
        provider: agentConfig.voiceProviderOutbound || agentConfig.voiceProvider || "11labs",
        voiceId: agentConfig.voiceIdOutbound || agentConfig.voiceId || "bIHbv24MWmeRgasZH58o",
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
  return { ok: true, status: 200, callId: vapiData.id };
}
