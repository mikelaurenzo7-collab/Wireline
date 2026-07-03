/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { invalidateDashboard } from "./dashboard-cache";
import * as claudeBrain from "./ai-brains";
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
  detectRecordingDisclosure,
  CONSENT_RULE_VERSION,
} from "./tcpa-consent";
import { reportError } from "./error-reporter";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { isHardSpendCapExceeded } from "./spend-guards";
import { getDefaultChannel, postMessage as slackPostMessage } from "./slack-service";
import { trackVoiceMinutes } from "./voice-usage";
import { runPostCallDigest } from "./post-call-digest";
import { findCallLogByVapiCallId, isOutboundCallPlaceholder } from "./outbound-call-tracking";
import { takeStagedReliabilityMetrics } from "./call-reliability-capture";
import { notifyCallRecap } from "./mobile-push";

export interface CallReportPayload {
  message: {
    call: any;
    analysis: any;
    transcript?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    durationSeconds?: number;
    endedReason?: string;
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
  } else if (typeof message.durationSeconds === "number" && message.durationSeconds > 0) {
    duration = Math.floor(message.durationSeconds);
  }
  const endedReason =
    typeof message.endedReason === "string"
      ? message.endedReason
      : typeof call?.endedReason === "string"
        ? call.endedReason
        : null;

  // 1. Persist base call log. The unique constraint on vapi_call_id is the
  //    idempotency boundary for the whole handler — duplicate Vapi retries
  //    fail-fast here, and the rest of the pipeline (usage tracking, Stripe
  //    overage, webhooks) is gated on `insertedFresh` to avoid double-counting.
  // Concurrency note: callLogs.vapiCallId has a UNIQUE index. Postgres
  // serializes concurrent INSERTs to the same key via that index — one
  // succeeds, the other throws 23505 unique_violation. So the duplicate-
  // protection here is atomic even when the async-queue path AND the
  // sync-fallback path (vapi/index.ts) both fire `handleEndOfCallReport`
  // for the same call (e.g., Vapi retried before the first handler returned
  // success). No row-level SELECT FOR UPDATE needed — the unique index is
  // the lock. `insertedFresh` only flips true when this INSERT genuinely
  // wrote a new row, so post-call LLM analysis (line 84+) runs exactly once.
  let insertedFresh = false;
  let insertedCallLogId: bigint | null = null;
  const vapiCallId = call?.id || "unknown";
  const stagedReliability = await takeStagedReliabilityMetrics(vapiCallId);
  try {
    const inserted = await drizzle
      .insert(schema.callLogs)
      .values({
        userId,
        vapiCallId,
        agentId: webhookAgentId,
        direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
        customerNumber: call?.customer?.number || "",
        durationSeconds: duration,
        cost: String(call?.cost || 0.0),
        summary: analysis?.summary || "No summary provided.",
        transcript: message.transcript || "",
        recordingUrl: message.recordingUrl || message.stereoRecordingUrl || null,
        endedReason,
        toolCallsTotal: stagedReliability?.toolCallsTotal ?? 0,
        toolCallsFailed: stagedReliability?.toolCallsFailed ?? 0,
        escalationAttempted: stagedReliability?.escalationAttempted ?? false,
        escalationSucceeded: stagedReliability?.escalationSucceeded ?? false,
      })
      .returning({ id: schema.callLogs.id });
    insertedFresh = true;
    insertedCallLogId = inserted[0]?.id ?? null;
  } catch (logErr: any) {
    if (logErr?.code === "23505" || /duplicate key/i.test(logErr?.message || "")) {
      const vapiCallId = call?.id;
      if (vapiCallId) {
        const existing = await findCallLogByVapiCallId(vapiCallId);
        if (existing && isOutboundCallPlaceholder(existing)) {
          await drizzle
            .update(schema.callLogs)
            .set({
              durationSeconds: duration,
              cost: String(call?.cost || 0.0),
              summary: analysis?.summary || "No summary provided.",
              transcript: message.transcript || "",
              recordingUrl: message.recordingUrl || message.stereoRecordingUrl || null,
              endedReason,
              toolCallsTotal: stagedReliability?.toolCallsTotal ?? 0,
              toolCallsFailed: stagedReliability?.toolCallsFailed ?? 0,
              escalationAttempted: stagedReliability?.escalationAttempted ?? false,
              escalationSucceeded: stagedReliability?.escalationSucceeded ?? false,
            })
            .where(eq(schema.callLogs.vapiCallId, vapiCallId));
          insertedFresh = true;
          insertedCallLogId = existing.id;
          log.info("Outbound placeholder call log finalized from end-of-call-report", {
            callId: vapiCallId,
          });
        } else {
          log.info("Duplicate end-of-call-report ignored (idempotent retry)", {
            callId: vapiCallId,
          });
        }
      }
    } else {
      log.error("Failed to insert call log", { callId: call?.id, error: getErrorMessage(logErr) });
    }
  }

  // Fire-and-forget monthly voice-minute tracking + Stripe overage emission.
  // Gated on a successful fresh insert so Vapi retries don't double-bill.
  if (insertedFresh) {
    void trackVoiceMinutes({
      userId,
      durationSeconds: duration,
      vapiCallId: call?.id || "unknown",
    });

    // Ping the Account Holder's Wireline devices with a tap-to-open recap. Best-effort
    // and env-gated (no-op without APNs creds); never blocks the webhook.
    void notifyCallRecap(userId, {
      callId: vapiCallId,
      agentName: call?.assistant?.name || null,
      fromNumber: call?.customer?.number || null,
      summary: analysis?.summary || null,
    });

    // Post-call digest — classify outcome, log to CRM, email the Account Holder.
    // Fire-and-forget; never blocks the webhook response.
    if (insertedCallLogId !== null) {
      void runPostCallDigest({
        userId,
        callLogId: insertedCallLogId,
        dialedNumber: call?.phoneNumber?.number || call?.phoneNumber || null,
        customerNumber: call?.customer?.number || null,
        customerName: call?.customer?.name || null,
        agentName: call?.assistant?.name || null,
        direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
        durationSeconds: duration,
        summary: analysis?.summary || null,
        transcript: message.transcript || null,
        sentiment: null,
        intentLabel: null,
        endedReason,
        vapiCallType: call?.type || null,
        demo: false,
        vapiCallId: vapiCallId,
      }).catch((err: any) =>
        log.warn("runPostCallDigest unhandled rejection", { error: err?.message }),
      );
    }
  }

  SentryEvents.callCompleted({
    duration_ms: duration * 1000,
    agent_id: webhookAgentId,
    direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
  });

  const direction =
    call?.type === "outboundPhoneCall" ? ("outbound" as const) : ("inbound" as const);
  let enrichment: WirelineCallCompletedOutcome["enrichment"] = null;

  // 2. AI Enrichment (Claude Opus or Gemini Flash when hard-capped / Claude offline)
  if (message.transcript) {
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

      const hardCapped = await isHardSpendCapExceeded(userId);
      const useGeminiFlash = hardCapped || !claudeBrain.isBrainAvailable();

      const cap = await claudeBrain.withAuditCapture(async () => {
        if (useGeminiFlash) {
          return geminiPostCallAnalysis({
            transcript: message.transcript || "",
            summary: analysis?.summary || "",
          });
        }
        return claudeBrain.postCallAnalysis({
          agentName: agentDetail?.name || "Wireline Agent",
          archetype: agentDetail?.archetype || "Receptionist",
          role: agentDetail?.role || undefined,
          customerNumber: call?.customer?.number,
          durationSeconds: duration,
          summary: analysis?.summary || "",
          transcript: message.transcript || "",
        });
      });
      const result = cap.result;

      // QA score: agent-quality assessment (vs leadScore which is
      // customer-intent). Derived from the analysis output so we don't
      // burn another LLM round-trip per call. Surfaced on CallLogs as
      // a colored score badge so account holders see at a glance which calls
      // need coaching review.
      //
      //   baseScore = 60 (neutral)
      //   +20 if positive sentiment, -20 if negative
      //   +10 if intent was high (agent moved the customer forward)
      //   -10 if coaching_note flags a miss
      //   clamp 0..100
      const baseScore = 60;
      const sentimentDelta =
        result.sentiment === "positive" ? 20 : result.sentiment === "negative" ? -20 : 0;
      const intentDelta = result.intent_label === "high" ? 10 : 0;
      const coachingHint = (result.coaching_note || "").toLowerCase();
      const missDelta = /\bmiss(ed|ing)?\b|\bshould have\b|\bdid not\b|\bfailed to\b/.test(
        coachingHint,
      )
        ? -10
        : 0;
      const qaScore = Math.max(
        0,
        Math.min(100, baseScore + sentimentDelta + intentDelta + missDelta),
      );
      const qaBreakdown = {
        base: baseScore,
        sentiment_delta: sentimentDelta,
        intent_delta: intentDelta,
        miss_delta: missDelta,
        rationale: result.coaching_note || "Routine call — no specific coaching note.",
        scored_at: new Date().toISOString(),
      };

      await drizzle
        .update(schema.callLogs)
        .set({
          leadScore: result.lead_score,
          intentLabel: result.intent_label,
          sentiment: result.sentiment,
          coachingNote: result.coaching_note,
          qaScore,
          qaBreakdown,
        })
        .where(eq(schema.callLogs.vapiCallId, call?.id));

      await persistRuntimeAuditRecords({
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
    // Account Holder SMS alert — hot lead detected. Same opt-in plumbing
    // as the escalation alerts. We only alert ≥80 (vs the webhook
    // ≥70 threshold) so the SMS pager doesn't fire on borderline
    // warm leads; the webhook is fine-grained, the SMS should be
    // can't-miss only.
    if (score >= 80) {
      try {
        const { NotificationService } = await import("./notifications");
        const notif = new NotificationService(userId);
        void notif.sendUrgentAlert({
          title: "🔥 Hot lead",
          message: `Score ${score} · ${baseOutcome.customer_number || "unknown caller"} · ${enrichment?.intent_label || "lead detected"}`,
          callId: call?.id,
        });
      } catch {
        /* best-effort */
      }
    }
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

    // Evidence-based disclosure logging. We do NOT blindly assert
    // "disclosure_played" for every call — a ledger row claiming a
    // disclosure the transcript contradicts is a falsified business record
    // and worse than no record in TCPA litigation. Instead we verify the
    // disclosure language is present in the transcript:
    //   - found            → disclosure_played, with the matched line as evidence
    //   - transcript, none → disclosure_not_detected (a real compliance signal)
    //   - no transcript    → disclosure_played, delivery "unverifiable"
    const transcript = message.transcript || "";
    const disclosure = detectRecordingDisclosure(transcript);
    const hasTranscript = transcript.trim().length > 0;

    const disclosureEvent =
      disclosure.found || !hasTranscript ? "disclosure_played" : "disclosure_not_detected";
    const delivery = disclosure.found
      ? "verified"
      : hasTranscript
        ? "not_detected"
        : "unverifiable";

    const ledgerRow = buildConsentLedgerRow({
      user_id: userId,
      call_id: call?.id,
      customer_number: call?.customer?.number || "unknown",
      event: disclosureEvent,
      rule_version: CONSENT_RULE_VERSION,
      rule,
      state,
      metadata: {
        delivery,
        ...(disclosure.found ? { evidence: disclosure.excerpt } : {}),
      },
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

    // A two-party-state call that completed without a detectable disclosure
    // is a genuine compliance exposure ($500–$5,000/call). Surface it loudly
    // so the Account Holder can act, rather than burying it as a silent ledger row.
    if (disclosureEvent === "disclosure_not_detected" && rule === "two_party") {
      log.warn("TCPA: recording disclosure not detected on two-party-state call", {
        userId,
        callId: call?.id,
        state,
      });
      reportError(new Error("TCPA recording disclosure not detected on two-party call"), {
        userId,
        callId: call?.id,
        state,
        rule,
        tags: { compliance: "tcpa_disclosure_missing" },
      });
    }

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
          lessonStatus: "pending",
        });
      }
    } catch (gemErr) {
      log.warn("Gemini fallback post-call analysis failed", { error: getErrorMessage(gemErr) });
    }
  }

  // Invalidate cache so dashboard immediately reflects the new call log and enrichment.
  invalidateDashboard(userId);
}
