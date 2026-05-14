import { db, log } from "./server-context";
import * as claudeBrain from "./claude-brain";
import { getErrorMessage } from "./server-utils";
import { SentryEvents } from "./sentry-events";
import { buildCallCompletedOutcome, dispatchWebhook, type WirelineCallCompletedOutcome } from "./webhook-helpers";
import { postCallAnalysis as geminiPostCallAnalysis } from "./gemini-brain";
import { 
  getConsentRuleForPhone, 
  buildConsentLedgerRow, 
  detectOptOut, 
  CONSENT_RULE_VERSION 
} from "./tcpa-consent";
import { persistClaudeAuditRecords } from "../middleware/audit-middleware";
import { getDefaultChannel, postMessage as slackPostMessage } from "./slack-service";

export interface CallReportPayload {
  message: {
    call: any;
    analysis: any;
    transcript?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
  };
  agent: {
    id: string;
    user_id: string;
  };
}

export async function handleEndOfCallReport({ message, agent }: CallReportPayload) {
  const { call, analysis } = message;
  const webhookAgentId = agent.id;
  const userId = agent.user_id;
  
  let duration = 0;
  if (call?.endedAt && call?.startedAt) {
    duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
  }

  // 1. Persist base call log
  const { error: logError } = await db.from('wireline_call_logs').insert({
    user_id: userId,
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

  if (logError) {
    log.error("Failed to insert call log", { callId: call?.id, error: logError.message });
  }

  SentryEvents.callCompleted({
    duration_ms: duration * 1000,
    agent_id: webhookAgentId,
    direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
  });

  const direction = call?.type === "outboundPhoneCall" ? "outbound" as const : "inbound" as const;
  let enrichment: WirelineCallCompletedOutcome["enrichment"] = null;

  // 2. AI Enrichment (Claude)
  if (claudeBrain.isClaudeAvailable() && message.transcript) {
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

    } catch (err: any) {
      log.warn("Claude post-call analysis failed", { error: getErrorMessage(err) });
    }
  }

  // 3. Webhook Dispatch & Notifications
  const baseOutcome = buildCallCompletedOutcome({
    vapi_call_id: call?.id || "unknown",
    agent_id: webhookAgentId,
    customer_number: call?.customer?.number || null,
    direction,
    duration_seconds: duration,
    enrichment_source: "sync_vapi_webhook",
    enrichment,
  });

  void dispatchWebhook(userId, "call.completed", baseOutcome);
  
  const score = enrichment?.lead_score;
  if (typeof score === "number" && score >= 70) {
    void dispatchWebhook(userId, "lead.hot", { vapi_call_id: call?.id, lead_score: score, customer_number: baseOutcome.customer_number });
  }

  const intent = (enrichment?.intent_label || "").toLowerCase();
  if (intent === "escalation" || intent === "escalate") {
    void dispatchWebhook(userId, "call.escalated", { vapi_call_id: call?.id, intent_label: enrichment?.intent_label, customer_number: baseOutcome.customer_number });
    void (async () => {
      const ch = await getDefaultChannel(userId);
      if (ch) {
        await slackPostMessage(
          userId,
          ch,
          `🚨 *Call escalation*\nCaller: ${baseOutcome.customer_number || "unknown"}\nIntent: ${enrichment?.intent_label || "escalation"}\nCall: ${call?.id || ""}`,
        );
      }
    })();
  }

  // 4. Compliance Ledger (TCPA)
  try {
    const { rule, state } = getConsentRuleForPhone(call?.customer?.number);
    const ledgerRow = buildConsentLedgerRow({
      user_id: userId,
      call_id: call?.id,
      customer_number: call?.customer?.number || "unknown",
      event: "disclosure_played",
      rule_version: CONSENT_RULE_VERSION,
      rule,
      state,
    });
    await db.from("wireline_consent_log").insert(ledgerRow);

    const optOut = detectOptOut(message.transcript || "");
    if (optOut.found) {
      const optOutRow = buildConsentLedgerRow({
        user_id: userId,
        call_id: call?.id,
        customer_number: call?.customer?.number || "unknown",
        event: "opt_out_requested",
        rule_version: CONSENT_RULE_VERSION,
        rule,
        state,
        metadata: { matched_pattern: optOut.matched_pattern }
      });
      await db.from("wireline_consent_log").insert(optOutRow);
    }
  } catch (compErr) {
    log.error("Compliance ledger writer failed", { error: getErrorMessage(compErr) });
  }

  // 5. Gemini Fallback
  if (!enrichment && message.transcript) {
    try {
      const geminiResult = await geminiPostCallAnalysis({
        transcript: message.transcript,
        summary: analysis?.summary || ""
      });
      
      await db.from('wireline_call_logs').update({
        lead_score: geminiResult.lead_score,
        intent_label: geminiResult.intent_label,
        sentiment: geminiResult.sentiment,
        coaching_note: geminiResult.coaching_note,
      }).eq('vapi_call_id', call?.id);

      if (geminiResult.lesson && geminiResult.lesson.trim()) {
        await db.from('wireline_agent_lessons').insert({
          agent_id: webhookAgentId,
          lesson: geminiResult.lesson,
          source_call_id: call?.id
        });
      }
    } catch (gErr) {
      log.warn("Gemini post-call fallback failed", { error: getErrorMessage(gErr) });
    }
  }
}
