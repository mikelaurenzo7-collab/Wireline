import express from "express";
import * as claudeBrain from "../lib/claude-brain";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  db, 
  log, 
  IS_PROD, 
  fetchWithTimeout,
  auditLogger
} from "../lib/server-context";
import { 
  timingSafeEq, 
  VAPI_WEBHOOK_SECRET, 
  sanitizePhone, 
  MAX_RUNTIME_LESSONS, 
  KNOWLEDGE_GAP_PREFIX, 
  buildCallerProfileBlock, 
  OUTBOUND_ARCHETYPE_BY_ROLE, 
  getArchetypeConfig, 
  ROLE_SPECIFIC_PROTOCOLS, 
  buildRoleToolDefs,
  MAX_CONTEXT_PREVIEW_LENGTH,
  PRESERVED_LEAD_STATUSES,
  SENTIMENT_ANGRY_SIGNALS,
  SENTIMENT_POSITIVE_SIGNALS
} from "../lib/vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "../lib/agent-runtime";
import { buildCustomerIntelBlock } from "../lib/customer-intel";
import { SentryEvents } from "../lib/sentry-events";
import { GeminiLeadScoreSchema, GeminiLessonSchema, GeminiFollowupTaskSchema } from "../lib/form-validators";
import { getConsentRuleForPhone, buildConsentLedgerRow, detectOptOut, CONSENT_RULE_VERSION } from "../lib/tcpa-consent";
import { getErrorMessage } from "../lib/server-utils";
import { dispatchWebhook } from "../lib/webhook-helpers";
import { analyzeLiveSentiment } from "../lib/gemini-brain";
import { IntegrationService } from "../lib/integrations";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
let _warnedAboutVapiSecret = false;
const DEFAULT_AGENT_ROLE = "customer_service";

// Helper for TCPA normalization
function normalizeDncPhone(p: string) {
  return p.replace(/^\+1/, '');
}

router.post("/api/vapi-webhook", async (req, res) => {
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (IS_PROD) {
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
      return res.status(503).json({ error: "Webhook auth not configured." });
    }
    if (!_warnedAboutVapiSecret) {
      log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
      _warnedAboutVapiSecret = true;
    }
  } else if (!timingSafeEq(provided, VAPI_WEBHOOK_SECRET)) {
    log.warn("Rejected Vapi webhook with bad/missing signature");
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  const payload = req.body;
  const { message } = payload;

  const webhookAgentId = req.query.agentId as string || "default-agent";
  
  const { data: agent } = await db.from('wireline_agents').select('user_id').eq('id', webhookAgentId).single();
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { data: userSettings } = await db.from('wireline_settings')
    .select('subscription_status, voice_llm_provider, voice_llm_model')
    .eq('user_id', agent.user_id).single();
    
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  const voiceLlmProvider = userSettings?.voice_llm_provider || 'google';
  const voiceLlmModel = userSettings?.voice_llm_model || 'gemini-1.5-flash';
  
  if (subscriptionStatus !== 'active') {
    if (message && message.type === "assistant-request") {
        return res.json({
            assistant: {
                firstMessage: "We're sorry, but the automated service for this line is currently suspended.",
                model: { provider: "google", model: "gemini-1.5-flash", systemPrompt: "Explain suspension and end call." }
            }
        });
    }
    return res.status(403).json({ error: "Access Denied" });
  }
  
  if (message && message.type === "assistant-request") {
    try {
      const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
      const customerNumber = message.call?.customer?.number;
      const safeCallerPhone = sanitizePhone(customerNumber);

      const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData, callerHistoryData, capturedProfileData, callerLeadData] = await Promise.all([
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
        safeCallerPhone && agent?.user_id
          ? db.from('wireline_fleet_tasks')
              .select('description, created_at')
              .eq('user_id', agent.user_id)
              .eq('task_type', 'customer_profile_captured')
              .ilike('description', `%${safeCallerPhone}%`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        safeCallerPhone && agent?.user_id
          ? db.from('wireline_outbound_leads')
              .select('customer_name, status, context')
              .eq('user_id', agent.user_id)
              .ilike('customer_number', `%${safeCallerPhone}%`)
              .not('status', 'in', ['Blocked-DNC'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const lessons = (lessonsData?.data || [])
        .filter((l: any) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
        .map((l: any) => l.lesson)
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

      const inboundRuntimeProfile: AgentRuntimeProfile = {
        timezone: agentConfig?.data?.timezone,
        business_hours: agentConfig?.data?.business_hours,
        compliance_mode: agentConfig?.data?.compliance_mode,
        disallowed_topics: agentConfig?.data?.disallowed_topics,
        escalation_keywords: agentConfig?.data?.escalation_keywords,
        business_variables: agentConfig?.data?.business_variables,
        out_of_hours_message: agentConfig?.data?.out_of_hours_message,
        kpi_focus: agentConfig?.data?.kpi_focus,
      };
      const inboundRuntime = buildAgentRuntimeContext(systemPrompt, inboundRuntimeProfile);
      const inboundFirstMessage =
        (!inboundRuntime.inHours && inboundRuntime.outOfHoursMessage)
          ? inboundRuntime.outOfHoursMessage
          : (agentConfig?.data?.first_message || "Hello!");

      return res.json({
        assistant: {
          name: agentConfig?.data?.name || "Wireline Agent",
          firstMessage: inboundFirstMessage,
          serverUrlSecret: VAPI_WEBHOOK_SECRET,
          model: {
            provider: voiceLlmProvider,
            model: voiceLlmModel,
            systemPrompt: inboundRuntime.prompt,
            temperature: llmTemp,
          },
          voice: {
            provider: "11labs",
            voiceId: "bIHbv24MWmeRgasZH58o" 
          },
          functions: buildRoleToolDefs(agentRole)
        }
      });
    } catch (e: any) {
      log.error("Vapi webhook config error", { agentId: webhookAgentId, error: e?.message });
      return res.json({
          assistant: {
            firstMessage: "I'm sorry, I'm having trouble connecting.",
            model: { provider: "google", model: "gemini-1.5-flash", systemPrompt: "Apologize and hang up." }
          }
      });
    }
  }

  if (message && message.type === "tool-calls") {
    const results = [];
    for (const toolCall of message.toolCalls) {
      if (toolCall.function.name === "create_fleet_task") {
        try {
            const { description, priority } = toolCall.function.arguments;
            const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
               user_id: agent?.user_id,
               agent_id: webhookAgentId,
               task_type: 'follow_up',
               description,
               priority: priority || 'medium',
               status: 'pending',
               source_type: 'phone_call',
               source_id: message.call?.id || payload.call?.id || "in-call",
               target_channel: 'manual',
            }).select('id').single();
            if (taskError) throw taskError;
            results.push({ toolCallId: toolCall.id, result: `Task ${task.id.split('-')[0]} created.` });
        } catch (e: any) {
            results.push({ toolCallId: toolCall.id, result: "Failed to create task." });
        }
      }
      
      if (toolCall.function.name === "search_leads") {
        try {
            const { query } = toolCall.function.arguments;
            const safeQuery = String(query || '').replace(/[^A-Za-z0-9 @.\-+]/g, '').slice(0, 80);
            const { data: leads } = await db.from('wireline_outbound_leads')
              .select('name, status, email, customer_number, last_contact_summary, context')
              .or(`name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,customer_number.ilike.%${safeQuery}%`)
              .eq('user_id', agent?.user_id)
              .limit(3);
            
            if (leads && leads.length > 0) {
               const summaries = leads.map(l => `${l.name} (${l.status}) | Phone: ${l.customer_number || 'N/A'}`);
               results.push({ toolCallId: toolCall.id, result: `Found records:\n${summaries.join('\n')}` });
            } else {
               results.push({ toolCallId: toolCall.id, result: "No matching records found." });
            }
        } catch (e) {
            results.push({ toolCallId: toolCall.id, result: "Search failed." });
        }
      }

      if (toolCall.function.name === "update_lead_status") {
        try {
          const { status, notes } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number;
          if (customerPhone) {
            const safePhone = sanitizePhone(customerPhone);
            await db.from('wireline_outbound_leads')
              .update({ status, last_contact_summary: notes || '', last_called_at: new Date() })
              .eq('user_id', agent?.user_id)
              .ilike('customer_number', `%${safePhone}%`)
              .not('status', 'in', PRESERVED_LEAD_STATUSES);
          }
          results.push({ toolCallId: toolCall.id, result: `Lead status updated to '${status}'.` });
        } catch (e: any) {
          results.push({ toolCallId: toolCall.id, result: "Update failed." });
        }
      }
      
      if (toolCall.function.name === "send_email") {
        try {
          const { to_email, subject, body } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const success = await service.sendEmail({ to: to_email, subject, body });
          results.push({ toolCallId: toolCall.id, result: success ? "Email sent." : "Failed to send email." });
        } catch (e: any) {
          results.push({ toolCallId: toolCall.id, result: "Email error." });
        }
      }

      if (toolCall.function.name === "check_calendar_availability") {
        try {
          const { date } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const result = await service.checkAvailability(date);
          results.push({ toolCallId: toolCall.id, result });
        } catch (e: any) {
          results.push({ toolCallId: toolCall.id, result: "Calendar check failed." });
        }
      }

      if (toolCall.function.name === "book_appointment") {
        try {
          const { date, time, customer_name, service_type } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          
          // Simple date/time parsing for now.
          const startTime = new Date(`${date} ${time}`).toISOString();
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          
          const success = await service.bookAppointment({
            title: `${service_type} for ${customer_name}`,
            description: `Booked via Wireline AI Agent`,
            startTime,
            endTime
          });
          results.push({ toolCallId: toolCall.id, result: success ? "Appointment booked." : "Booking failed." });
        } catch (e: any) {
          results.push({ toolCallId: toolCall.id, result: "Booking error." });
        }
      }
    }
    return res.json({ results });
  }

  if (message && message.type === "status-update") {
     const callId = payload.call?.id;
     const status = message.status || payload.call?.status;
     if (callId) {
        if (['in-progress', 'ringing', 'queued'].includes(status)) {
           await db.from('wireline_signal_presence').upsert({
              id: callId,
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              customer_number: payload.call?.customer?.number || "Unknown",
              status: status,
              started_at: new Date().toISOString()
           });
        } else if (status === 'ended' || status === 'completed') {
           await db.from('wireline_signal_presence').delete().eq('id', callId);
        }
     }
  }

  if (message && message.type === "conversation-update") {
    const callId = payload.call?.id || message.call?.id;
    if (callId) {
      const turns: any[] = message.conversation || message.messages || [];
      const userTurns = turns.filter((t: any) => t.role === "user").slice(-2);
      const combined = userTurns.map((t: any) => (t.content || t.message || "").toLowerCase()).join(" ");

      const negativeHits = SENTIMENT_ANGRY_SIGNALS.filter(w => combined.includes(w)).length;
      const positiveHits = SENTIMENT_POSITIVE_SIGNALS.filter(w => combined.includes(w)).length;

      let liveSentimentLabel = "Live · Active";
      if (negativeHits >= 2) liveSentimentLabel = "⚠ Frustrated";
      else if (positiveHits >= 2) liveSentimentLabel = "✓ Positive";

      // Circuit Breaker: Deep analysis if frustration is detected.
      if (negativeHits >= 1) {
        analyzeLiveSentiment(combined).then(async (result) => {
          if (result.escalate) {
             await db.from('wireline_signal_presence').update({ 
               label: `🚨 Escalation Risk: ${result.reason}`,
               urgency: result.urgency 
             }).eq('id', callId);
             
             // TODO: Trigger push notification / Omnichannel alert here.
             log.warn("Circuit Breaker Tripped", { callId, reason: result.reason, urgency: result.urgency });
          }
        }).catch(e => log.error("Circuit breaker analysis failed", { error: e.message }));
      }

      await db.from('wireline_signal_presence').update({ label: liveSentimentLabel }).eq('id', callId);
    }
  }

  if (message && message.type === "end-of-call-report") {
    try {
        const call = message.call;
        const analysis = message.analysis;
        let duration = 0;
        if (call?.endedAt && call?.startedAt) {
           duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
        }

        await db.from('wireline_call_logs').insert({
           user_id: agent?.user_id,
           vapi_call_id: call?.id || "unknown",
           agent_id: webhookAgentId,
           direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
           customer_number: call?.customer?.number || "",
           duration_seconds: duration,
           cost: call?.cost || 0.0,
           summary: analysis?.summary || "No summary provided.",
           transcript: message.transcript || "",
           recording_url: message.recordingUrl || message.stereoRecordingUrl || null
        });

        SentryEvents.callCompleted({
          duration_ms: duration * 1000,
          agent_id: webhookAgentId,
          direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
        });

        let claudeAnalysisDone = false;
        if (claudeBrain.isClaudeAvailable() && message.transcript) {
          try {
            const { data: agentDetail } = await db.from('wireline_agents').select('name, archetype, role').eq('id', webhookAgentId).single();
            const result = await claudeBrain.postCallAnalysis({
              agentName: agentDetail?.name || 'Wireline Agent',
              archetype: agentDetail?.archetype || 'Receptionist',
              role: agentDetail?.role || undefined,
              customerNumber: call?.customer?.number,
              durationSeconds: duration,
              summary: analysis?.summary || '',
              transcript: message.transcript || '',
            });

            await db.from('wireline_call_logs').update({
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              coaching_note: result.coaching_note,
            }).eq('vapi_call_id', call?.id);

            claudeAnalysisDone = true;
          } catch (err: any) {
            log.warn("Claude post-call analysis failed", { error: getErrorMessage(err) });
          }
        }

        // ... Legacy Gemini fallback and TCPA logging ...
        
        return res.json({ success: true });
    } catch(e: any) {
      log.error("Failed to process call completion", { error: getErrorMessage(e) });
      return res.json({ success: false });
    }
  }

  return res.json({ received: true });
});

export default router;
