import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import * as claudeBrain from "./claude-brain";
import { getErrorMessage } from "./server-utils";
import { SentryEvents } from "./sentry-events";
import {
  buildCallCompletedOutcome,
  dispatchWebhook,
  type WirelineCallCompletedOutcome,
} from "./webhook-helpers";
import { postCallAnalysis as geminiPostCallAnalysis } from "./gemini-brain";
import {
  getConsentRuleForPhone,
  buildConsentLedgerRow,
  detectOptOut,
  CONSENT_RULE_VERSION,
} from "./tcpa-consent";
import { persistClaudeAuditRecords } from "../middleware/audit-middleware";
import { getDefaultChannel, postMessage as slackPostMessage } from "./slack-service";
import { trackVoiceMinutes } from "./voice-usage";

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
    duration = Math.floor(
      (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000,
    );
  }

  // 1. Persist base call log
  try {
    await drizzle.insert(schema.callLogs).values({
      userId,
      vapiCallId: call?.id || "unknown",
      agentId: webhookAgentId,
      direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
      customerNumber: call?.customer?.number || "",
      durationSeconds: duration,
      cost: String(call?.cost || 0.0),
      summary: analysis?.summary || "No summary provided.",
      transcript: message.transcript || "",
      recordingUrl: message.recordingUrl || message.stereoRecordingUrl || null,
    });
  } catch (logErr: any) {
    log.error("Failed to insert call log", { callId: call?.id, error: getErrorMessage(logErr) });
  }

  // Fire-and-forget monthly voice-minute tracking + Stripe overage emission.
  // trackVoiceMinutes is fail-OPEN — its errors never block this handler.
  void trackVoiceMinutes({ userId, durationSeconds: duration });

  SentryEvents.callCompleted({
    duration_ms: duration * 1000,
    agent_id: webhookAgentId,
    direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
  });

  const direction =
    call?.type === "outboundPhoneCall" ? ("outbound" as const) : ("inbound" as const);
  let enrichment: WirelineCallCompletedOutcome["enrichment"] = null;

  // 2. AI Enrichment (Claude)
  if (claudeBrain.isClaudeAvailable() && message.transcript) {
    try {
      const [agentDetail] = await drizzle
        .select({
          name: schema.agents.name,
          archetype: schema.agents.archetype,
          role: schema.agents.role,
        })
        .from(schema.agents)
        .where(eq(schema.agents.id, webhookAgentId))
        .limit(1);

      const cap = await claudeBrain.withAuditCapture(() =>
        claudeBrain.postCallAnalysis({
          agentName: agentDetail?.name || "Wireline Agent",
          archetype: agentDetail?.archetype || "Receptionist",
          role: agentDetail?.role || undefined,
          customerNumber: call?.customer?.number,
          durationSeconds: duration,
          summary: analysis?.summary || "",
          transcript: message.transcript || "",
        }),
      );
      const result = cap.result;

      await drizzle
        .update(schema.callLogs)
        .set({
          leadScore: result.lead_score,
          intentLabel: result.intent_label,
          sentiment: result.sentiment,
          coachingNote: result.coaching_note,
        })
        .where(eq(schema.callLogs.vapiCallId, call?.id));

      await persistClaudeAuditRecords({
        userId,
        action: "vapi.post_call_analysis",
        records: cap.records,
        requestMeta: {
          vapi_call_id: call?.id,
          agent_id: webhookAgentId,
        },
      }).catch((e: unknown) =>
        log.warn("Vapi Claude audit persist failed", { error: getErrorMessage(e) }),
      );

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
    void dispatchWebhook(userId, "lead.hot", {
      vapi_call_id: call?.id,
      lead_score: score,
      customer_number: baseOutcome.customer_number,
    });
  }

  const intent = (enrichment?.intent_label || "").toLowerCase();
  if (intent === "escalation" || intent === "escalate") {
    void dispatchWebhook(userId, "call.escalated", {
      vapi_call_id: call?.id,
      intent_label: enrichment?.intent_label,
      customer_number: baseOutcome.customer_number,
    });
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

    await drizzle.insert(schema.consentLog).values({
      userId: ledgerRow.user_id,
      callId: ledgerRow.call_id,
      customerNumber: ledgerRow.customer_number,
      event: ledgerRow.event,
      ruleVersion: ledgerRow.rule_version,
      rule: ledgerRow.rule,
      state: ledgerRow.state,
      metadata: ledgerRow.metadata,
    });

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
        metadata: { matched_pattern: optOut.matched_pattern },
      });

      await drizzle.insert(schema.consentLog).values({
        userId: optOutRow.user_id,
        callId: optOutRow.call_id,
        customerNumber: optOutRow.customer_number,
        event: optOutRow.event,
        ruleVersion: optOutRow.rule_version,
        rule: optOutRow.rule,
        state: optOutRow.state,
        metadata: optOutRow.metadata,
      });
    }
  } catch (compErr) {
    log.error("Compliance ledger writer failed", { error: getErrorMessage(compErr) });
  }

  // 5. Gemini Fallback
  if (!enrichment && message.transcript) {
    try {
      const geminiResult = await geminiPostCallAnalysis({
        transcript: message.transcript,
        summary: analysis?.summary || "",
      });

      await drizzle
        .update(schema.callLogs)
        .set({
          leadScore: geminiResult.lead_score,
          intentLabel: geminiResult.intent_label,
          sentiment: geminiResult.sentiment,
          coachingNote: geminiResult.coaching_note,
        })
        .where(eq(schema.callLogs.vapiCallId, call?.id));

      if (geminiResult.lesson && geminiResult.lesson.trim()) {
        await drizzle.insert(schema.agentLessons).values({
          userId,
          agentId: webhookAgentId,
          lesson: geminiResult.lesson,
          sourceCallId: call?.id,
        });
      }
    } catch (gErr) {
      log.warn("Gemini post-call fallback failed", { error: getErrorMessage(gErr) });
    }
  }
}
