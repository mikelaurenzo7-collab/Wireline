import express, { Request, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import * as claudeBrain from "../lib/claude-brain";
import {
  db,
  log,
  IS_PROD,
  auditLogger,
} from "../lib/server-context";
import {
  timingSafeEq,
  VAPI_WEBHOOK_SECRET,
  sanitizePhone,
  KNOWLEDGE_GAP_PREFIX,
  MAX_RUNTIME_LESSONS,
  ROLE_SPECIFIC_PROTOCOLS,
  buildCallerProfileBlock,
  OUTBOUND_ARCHETYPE_BY_ROLE,
  getArchetypeConfig,
  buildRoleToolDefs,
  PRESERVED_LEAD_STATUSES,
  SENTIMENT_ANGRY_SIGNALS,
  SENTIMENT_POSITIVE_SIGNALS
} from "../lib/vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "../lib/agent-runtime";
import { buildCustomerIntelBlock } from "../lib/customer-intel";
import { SentryEvents } from "../lib/sentry-events";
import { getErrorMessage } from "../lib/server-utils";
import { persistClaudeAuditRecords } from "../middleware/audit-middleware";
import { buildCallCompletedOutcome, dispatchWebhook, type WirelineCallCompletedOutcome } from "../lib/webhook-helpers";
import { analyzeLiveSentiment } from "../lib/gemini-brain";
import { IntegrationService } from "../lib/integrations";
import { NotificationService } from "../lib/notifications";
import { postMessage as slackPostMessage, getDefaultChannel } from "../lib/slack-service";
import { normalizeDncPhone } from "../lib/compliance";
import { lookupTenantPhoneNumber, sendTenantMessage } from "../lib/twilio-service";
import { resolveAgentTools } from "../lib/agent-capabilities";
import { resolveVapiWebhookAgent } from "../lib/vapi-webhook-agent";

// TODO: the imports below were carried over from server.ts when this router
// was extracted. The handlers that consume them — Gemini post-call lesson
// extraction (GeminiLeadScoreSchema / GeminiLessonSchema / GeminiFollowupTaskSchema,
// genAI), the TCPA consent ledger writer (getConsentRuleForPhone /
// buildConsentLedgerRow / detectOptOut / CONSENT_RULE_VERSION), the webhook
// dispatch on call.completed (dispatchWebhook), auditLogger, and the
// fetchWithTimeout helper — still live in server.ts under app.post/app.get
// callbacks that the vapi-routes.ts extraction has not yet absorbed. When
// those handlers move here, re-add the imports.

const router = express.Router();
let _warnedAboutVapiSecret = false;
const DEFAULT_AGENT_ROLE = "customer_service";

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

  const payload = req.body as Record<string, unknown>;
  const queryAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const routed = await resolveVapiWebhookAgent({ payload, queryAgentId });
  if (!routed.ok) {
    return res.status((routed as { status: number }).status)
      .json((routed as { body: Record<string, unknown> }).body);
  }

  const webhookAgentId = routed.webhookAgentId;
  const agent = { id: webhookAgentId, user_id: routed.agentUserId };
  const message = payload.message as Record<string, any> | undefined;

  const { data: userSettings } = await db.from('wireline_settings')
    .select('subscription_status, voice_llm_provider, voice_llm_model, twilio_messaging_enabled, twilio_lookup_enabled')
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
          functions: buildRoleToolDefs(agentRole, enabledToolNames)
        }
      });
    } catch (e: unknown) {
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
               source_id: (message.call as { id?: string } | undefined)?.id || (payload.call as { id?: string } | undefined)?.id || "in-call",
               target_channel: 'manual',
            }).select('id').single();
            if (taskError) throw taskError;
            results.push({ toolCallId: toolCall.id, result: `Task ${task.id.split('-')[0]} created.` });
        } catch {
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
        } catch {
            results.push({ toolCallId: toolCall.id, result: "Search failed." });
        }
      }

      if (toolCall.function.name === "update_lead_status") {
        try {
          const { status, notes } = toolCall.function.arguments;
          const customerPhone = (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number || (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          if (customerPhone) {
            const safePhone = sanitizePhone(customerPhone);
            await db.from('wireline_outbound_leads')
              .update({ status, last_contact_summary: notes || '', last_called_at: new Date() })
              .eq('user_id', agent?.user_id)
              .ilike('customer_number', `%${safePhone}%`)
              .not('status', 'in', PRESERVED_LEAD_STATUSES);
          }
          results.push({ toolCallId: toolCall.id, result: `Lead status updated to '${status}'.` });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Update failed." });
        }
      }
      
      if (toolCall.function.name === "send_email") {
        try {
          const { to_email, subject, body } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const success = await service.sendEmail({ to: to_email, subject, body });
          results.push({ toolCallId: toolCall.id, result: success ? "Email sent." : "Failed to send email." });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Email error." });
        }
      }

      if (toolCall.function.name === "send_text_message") {
        try {
          const { to_number, channel, message_body } = toolCall.function.arguments;
          const fallbackNumber = (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number || (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const targetNumber = sanitizePhone(to_number || fallbackNumber);

          if (!targetNumber) {
            results.push({ toolCallId: toolCall.id, result: "No destination number was available for that message." });
          } else {
            const outcome = await sendTenantMessage(agent?.user_id, {
              to: targetNumber,
              body: message_body,
              channel: channel === "whatsapp" ? "whatsapp" : "sms",
            });
            results.push({
              toolCallId: toolCall.id,
              result: outcome.ok
                ? `${outcome.channel === "whatsapp" ? "WhatsApp" : "SMS"} sent to ${targetNumber}.`
                : (outcome.reason || "Message send failed."),
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Text message error." });
        }
      }

      if (toolCall.function.name === "lookup_phone_number") {
        try {
          const fallbackNumber = (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number || (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const targetNumber = sanitizePhone(toolCall.function.arguments?.phone_number || fallbackNumber);

          if (!targetNumber) {
            results.push({ toolCallId: toolCall.id, result: "No phone number was available to validate." });
          } else {
            const lookup = await lookupTenantPhoneNumber(agent?.user_id, targetNumber);
            results.push({
              toolCallId: toolCall.id,
              result: lookup.ok
                ? `Lookup for ${lookup.phoneNumber || targetNumber}: valid=${lookup.valid ? "yes" : "no"}, line_type=${lookup.lineType || "unknown"}, carrier=${lookup.carrierName || "unknown"}.`
                : (lookup.reason || "Phone lookup failed."),
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Phone lookup error." });
        }
      }

      if (toolCall.function.name === "add_to_dnc") {
        try {
          const fallbackNumber = (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number || (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const rawPhone = String(toolCall.function.arguments?.phone_number || fallbackNumber || "");
          const normalizedPhone = normalizeDncPhone(rawPhone);

          if (!normalizedPhone) {
            results.push({ toolCallId: toolCall.id, result: "No valid phone number was available to suppress." });
          } else {
            await db.from("wireline_dnc_list").upsert({
              user_id: agent?.user_id,
              phone: normalizedPhone,
              phone_raw: rawPhone,
              reason: toolCall.function.arguments?.reason || "agent opt-out",
              source: "agent_tool",
            }, { onConflict: "user_id,phone", ignoreDuplicates: true });

            void auditLogger.logDnc("added", {
              userId: agent?.user_id,
              count: 1,
              metadata: {
                phone: rawPhone,
                source: "agent_tool",
                reason: toolCall.function.arguments?.reason || null,
              },
            }).catch(() => {});

            results.push({ toolCallId: toolCall.id, result: `${rawPhone || normalizedPhone} is now on the Do Not Call list.` });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "DNC update failed." });
        }
      }

      if (toolCall.function.name === "check_calendar_availability") {
        try {
          const { date } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const result = await service.checkAvailability(date);
          results.push({ toolCallId: toolCall.id, result });
        } catch {
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
          const title = `${service_type} for ${customer_name}`;
          
          const success = await service.bookAppointment({
            title,
            description: `Booked via Wireline AI Agent`,
            startTime,
            endTime,
            agentId: agent?.id,
          });
          if (success && agent?.user_id) {
            void dispatchWebhook(agent.user_id, "appointment.booked", {
              agent_id: agent.id,
              title,
              start_time: startTime,
              end_time: endTime,
              customer_name,
              service_type,
            });
            const slackCh = await getDefaultChannel(agent.user_id);
            if (slackCh) {
              void slackPostMessage(
                agent.user_id,
                slackCh,
                `📅 *Appointment booked*\n${title}\n${new Date(startTime).toLocaleString()} → ${new Date(endTime).toLocaleString()}`,
              );
            }
          }
          results.push({ toolCallId: toolCall.id, result: success ? "Appointment booked." : "Booking failed." });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Booking error." });
        }
      }

      if (toolCall.function.name === "send_contract") {
        try {
          const { recipient_name, recipient_email, template_id } = toolCall.function.arguments;
          const { sendContract } = await import("../lib/docusign-service");
          const result = await sendContract({ recipientName: recipient_name, recipientEmail: recipient_email, templateId: template_id });
          results.push({ toolCallId: toolCall.id, result: result ? `Contract sent. Envelope ID: ${result.envelopeId}` : "DocuSign not configured." });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Contract sending error." });
        }
      }

      if (toolCall.function.name === "enrich_lead") {
        try {
          const { phone_number } = toolCall.function.arguments;
          const { enrichLead } = await import("../lib/apollo-service");
          const profile = await enrichLead(phone_number);
          if (profile) {
            results.push({ toolCallId: toolCall.id, result: `Lead found: ${profile.first_name} ${profile.last_name}, ${profile.title} at ${profile.company}` });
          } else {
            results.push({ toolCallId: toolCall.id, result: "No matching lead profile found." });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Lead enrichment error." });
        }
      }
    }
    return res.json({ results });
  }

  if (message && message.type === "status-update") {
     const callId = (payload.call as { id?: string } | undefined)?.id;
     const status = (message as { status?: string }).status || (payload.call as { status?: string } | undefined)?.status;
     if (callId) {
        if (['in-progress', 'ringing', 'queued'].includes(status)) {
           await db.from('wireline_signal_presence').upsert({
              id: callId,
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              customer_number: (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number || "Unknown",
              status: status,
              started_at: new Date().toISOString()
           });
        } else if (status === 'ended' || status === 'completed') {
           await db.from('wireline_signal_presence').delete().eq('id', callId);
        }
     }
  }

  if (message && message.type === "conversation-update") {
    const callId = (payload.call as { id?: string } | undefined)?.id || (message.call as { id?: string } | undefined)?.id;
    if (callId) {
      const turns: any[] = message.conversation || message.messages || [];
      const userTurns = turns.filter((t: { role: string; content?: string; message?: string }) => t.role === "user").slice(-2);
      const combined = userTurns.map((t: { content?: string; message?: string }) => (t.content || t.message || "").toLowerCase()).join(" ");

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
             
             // Circuit Breaker Notification
             const notifier = new NotificationService(agent.user_id);
             await notifier.sendUrgentAlert({
               title: "High Escalation Risk Detected",
               message: `Live monitoring detected a high-stress situation: ${result.reason}`,
               callId: callId,
               metadata: { urgency: result.urgency }
             });
             
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

        const userId = agent?.user_id as string | undefined;
        const direction = call?.type === "outboundPhoneCall" ? "outbound" as const : "inbound" as const;
        let enrichment: WirelineCallCompletedOutcome["enrichment"] = null;

        if (userId && claudeBrain.isClaudeAvailable() && message.transcript) {
          try {
            const { data: agentDetail } = await db.from('wireline_agents').select('name, archetype, role').eq('id', webhookAgentId).single();
            const cap = await claudeBrain.withAuditCapture(() =>
              claudeBrain.postCallAnalysis({
                agentName: agentDetail?.name || 'Wireline Agent',
                archetype: agentDetail?.archetype || 'Receptionist',
                role: agentDetail?.role || undefined,
                customerNumber: call?.customer?.number,
                durationSeconds: duration,
                summary: analysis?.summary || '',
                transcript: message.transcript || '',
              }),
            );
            const result = cap.result;

            await db.from('wireline_call_logs').update({
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              coaching_note: result.coaching_note,
            }).eq('vapi_call_id', call?.id);

            await persistClaudeAuditRecords({
              userId,
              action: "vapi.post_call_analysis",
              records: cap.records,
              requestMeta: {
                vapi_call_id: call?.id,
                agent_id: webhookAgentId,
              },
            }).catch((e: unknown) => log.warn("Vapi Claude audit persist failed", { error: getErrorMessage(e) }));

            enrichment = {
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              coaching_note: result.coaching_note,
              lesson_extracted: !!(result.lesson && result.lesson.trim()),
            };

          } catch (err: unknown) {
            log.warn("Claude post-call analysis failed", { error: getErrorMessage(err) });
          }
        }

        if (userId) {
          const base = buildCallCompletedOutcome({
            vapi_call_id: call?.id || "unknown",
            agent_id: webhookAgentId,
            customer_number: call?.customer?.number || null,
            direction,
            duration_seconds: duration,
            enrichment_source: "sync_vapi_webhook",
            enrichment,
          });
          void dispatchWebhook(userId, "call.completed", base);
          const score = enrichment?.lead_score;
          if (typeof score === "number" && score >= 70) {
            void dispatchWebhook(userId, "lead.hot", { vapi_call_id: call?.id, lead_score: score, customer_number: base.customer_number });
          }
          const intent = (enrichment?.intent_label || "").toLowerCase();
          if (intent === "escalation" || intent === "escalate") {
            void dispatchWebhook(userId, "call.escalated", { vapi_call_id: call?.id, intent_label: enrichment?.intent_label, customer_number: base.customer_number });
            void (async () => {
              const ch = await getDefaultChannel(userId);
              if (ch) {
                await slackPostMessage(
                  userId,
                  ch,
                  `🚨 *Call escalation*\nCaller: ${base.customer_number || "unknown"}\nIntent: ${enrichment?.intent_label || "escalation"}\nCall: ${call?.id || ""}`,
                );
              }
            })();
          }
        }

        // ... Legacy Gemini fallback and TCPA logging ...
        
        return res.json({ success: true });
    } catch(e: unknown) {
      log.error("Failed to process call completion", { error: getErrorMessage(e) });
      return res.json({ success: false });
    }
  }

  return res.json({ received: true });
});

export default router;
