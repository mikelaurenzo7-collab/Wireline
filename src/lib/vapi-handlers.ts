/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { drizzle, log, auditLogger } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { normalizeDncPhone } from "./compliance";
import { reportError } from "./error-reporter";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { isHardSpendCapExceeded } from "./spend-guards";
import { getDefaultChannel, postMessage as slackPostMessage } from "./slack-service";
import { trackVoiceMinutes } from "./voice-usage";
import { runPostCallDigest } from "./post-call-digest";
import {
  findCallLogByVapiCallId,
  isOutboundCallPlaceholder,
  OUTBOUND_CALL_DIALING_MARKER,
  OUTBOUND_CALL_PLACEHOLDER_SUMMARY,
} from "./outbound-call-tracking";
import { takeStagedReliabilityMetrics } from "./call-reliability-capture";
import { notifyCallRecap } from "./mobile-push";
import { emitServerProductEventOnce } from "./product-event-server";
import {
  resolveVapiCallCostUsd,
  resolveVapiCallDurationSeconds,
  resolveVapiRecordingUrl,
  resolveVapiTranscript,
} from "./vapi-report-normalization";

export interface CallReportPayload {
  message: {
    call: any;
    analysis: any;
    artifact?: unknown;
    cost?: number | string;
    costs?: unknown[];
    startedAt?: string;
    endedAt?: string;
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

async function persistTranscriptDncSuppression(input: {
  userId: string;
  callId: string | null;
  rawCallerNumber: string;
  matchedPattern: string | undefined;
}): Promise<void> {
  const normalizedCallerNumber = normalizeDncPhone(input.rawCallerNumber);
  if (!normalizedCallerNumber) {
    const error = new Error(
      "Transcript contained a DNC request without a suppressible caller number",
    );
    log.error("transcript DNC suppression missing caller number", {
      userId: input.userId,
      callId: input.callId,
    });
    reportError(error, {
      userId: input.userId,
      callId: input.callId,
      tags: { compliance: "dnc_suppression_missing_number" },
    });
    return;
  }

  try {
    const inserted = await drizzle
      .insert(schema.dncList)
      .values({
        userId: input.userId,
        phone: normalizedCallerNumber,
        phoneRaw: input.rawCallerNumber,
        reason: "spoken opt-out on call",
        source: "call_transcript",
      })
      .onConflictDoNothing({
        target: [schema.dncList.userId, schema.dncList.phone],
      })
      .returning({ id: schema.dncList.id });

    if (inserted.length === 0) return;

    void auditLogger
      .logDnc("added", {
        userId: input.userId,
        count: 1,
        metadata: {
          phone: input.rawCallerNumber,
          source: "call_transcript",
          matched_pattern: input.matchedPattern || null,
        },
      })
      .catch((err) =>
        log.warn("audit logDnc(call_transcript) failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    const { SentinelService } = await import("../services/sentinel");
    const sentinel = new SentinelService();
    void sentinel.terminateActiveCallsForNumber(normalizedCallerNumber).catch((err) =>
      log.error("sentinel terminate-on-transcript-DNC failed", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } catch (dncErr) {
    log.error("transcript DNC suppression failed", {
      userId: input.userId,
      callId: input.callId,
      error: getErrorMessage(dncErr),
    });
    reportError(dncErr instanceof Error ? dncErr : new Error("transcript DNC suppression failed"), {
      userId: input.userId,
      callId: input.callId,
      tags: { compliance: "dnc_suppression_failed" },
    });
    // This runs before both the retry-safe metering boundary and the duplicate
    // call-log early return. Throwing makes Vapi redeliver so the legal
    // suppression is retried first; once it succeeds the same redelivery can
    // safely resume per-call-idempotent voice accounting.
    throw dncErr;
  }
}

const DISCLOSURE_EVENTS = [
  "disclosure_played",
  "disclosure_not_detected",
  "disclosure_unverifiable",
];

/**
 * Idempotent TCPA evidence writer: one recording-disclosure row and, when the
 * transcript requested it, one opt-out row per call. Runs on every delivery so
 * a redelivery can restore evidence that a failed first delivery never wrote —
 * the call-log insert alone used to consume the one-time claim, which lost
 * these rows permanently whenever the handler threw after the insert. Stays
 * best-effort: DNC suppression before it is the legal boundary, and a
 * consent-ledger outage must not block voice accounting after it.
 */
async function persistComplianceEvidence(input: {
  userId: string;
  call: any;
  transcript: string;
  duration: number;
  optOut: ReturnType<typeof detectOptOut>;
  insertedFresh: boolean;
}): Promise<void> {
  const { userId, call, transcript, duration, optOut, insertedFresh } = input;
  try {
    const callId: string | null = call?.id || null;
    // Without a call id the rows cannot be deduplicated across deliveries, so
    // only the first (fresh) delivery may write them.
    if (!callId && !insertedFresh) return;

    const { rule, state } = getConsentRuleForPhone(call?.customer?.number);
    const disclosure = detectRecordingDisclosure(transcript);
    const hasTranscript = transcript.trim().length > 0;

    const disclosureEvent = disclosure.found
      ? "disclosure_played"
      : hasTranscript
        ? "disclosure_not_detected"
        : "disclosure_unverifiable";
    const delivery = disclosure.found
      ? "verified"
      : hasTranscript
        ? "not_detected"
        : "unverifiable";

    let disclosureAlreadyRecorded = false;
    if (callId) {
      const [existing] = await drizzle
        .select({ id: schema.consentLog.id })
        .from(schema.consentLog)
        .where(
          and(
            eq(schema.consentLog.userId, userId),
            eq(schema.consentLog.callId, callId),
            inArray(schema.consentLog.event, DISCLOSURE_EVENTS),
          ),
        )
        .limit(1);
      disclosureAlreadyRecorded = Boolean(existing);
    }

    if (!disclosureAlreadyRecorded) {
      const ledgerRow = buildConsentLedgerRow({
        user_id: userId,
        call_id: callId,
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

      // onConflictDoNothing + the 0136 partial unique indexes are the race
      // backstop the pre-SELECT cannot provide: two workers claiming two
      // redelivery jobs for the same call both pass the check above, so only
      // the row that actually lands may fire the unverified-disclosure alert.
      const insertedDisclosure = await drizzle
        .insert(schema.consentLog)
        .values({
          userId: ledgerRow.user_id,
          callId: ledgerRow.call_id,
          customerNumber: ledgerRow.customer_number,
          event: ledgerRow.event,
          ruleVersion: ledgerRow.rule_version,
          rule: ledgerRow.rule,
          state: ledgerRow.state,
          metadata: ledgerRow.metadata,
        })
        .onConflictDoNothing()
        .returning({ id: schema.consentLog.id });

      const carriedConversation = hasTranscript || duration > 0;
      if (
        insertedDisclosure.length > 0 &&
        disclosureEvent !== "disclosure_played" &&
        rule === "two_party" &&
        carriedConversation
      ) {
        log.warn("TCPA: recording disclosure could not be verified on two-party-state call", {
          userId,
          callId,
          state,
          delivery,
        });
        reportError(new Error("TCPA recording disclosure unverified on two-party call"), {
          userId,
          callId,
          state,
          rule,
          delivery,
          tags: { compliance: "tcpa_disclosure_unverified" },
        });
      }
    }

    if (optOut.found) {
      let optOutAlreadyRecorded = false;
      if (callId) {
        const [existing] = await drizzle
          .select({ id: schema.consentLog.id })
          .from(schema.consentLog)
          .where(
            and(
              eq(schema.consentLog.userId, userId),
              eq(schema.consentLog.callId, callId),
              eq(schema.consentLog.event, "opt_out_requested"),
            ),
          )
          .limit(1);
        optOutAlreadyRecorded = Boolean(existing);
      }

      if (!optOutAlreadyRecorded) {
        const optOutRow = buildConsentLedgerRow({
          user_id: userId,
          call_id: callId,
          customer_number: call?.customer?.number || "unknown",
          event: "opt_out_requested",
          rule_version: CONSENT_RULE_VERSION,
          rule,
          state,
          metadata: { matched_pattern: optOut.matched_pattern, kind: optOut.kind },
        });

        await drizzle
          .insert(schema.consentLog)
          .values({
            userId: optOutRow.user_id,
            callId: optOutRow.call_id,
            customerNumber: optOutRow.customer_number,
            event: optOutRow.event,
            ruleVersion: optOutRow.rule_version,
            rule: optOutRow.rule,
            state: optOutRow.state,
            metadata: optOutRow.metadata,
          })
          .onConflictDoNothing();
      }
    }
  } catch (compErr) {
    // DNC suppression has already completed before this best-effort evidence
    // writer. A consent-ledger outage therefore cannot strand a legal opt-out.
    log.error("Compliance ledger writer failed", { error: getErrorMessage(compErr) });
  }
}

export async function handleEndOfCallReport({ message, agent }: CallReportPayload) {
  const { call, analysis } = message;
  const webhookAgentId = agent.id;
  const userId = agent.user_id;
  const duration = resolveVapiCallDurationSeconds(message, call);
  const callCostUsd = resolveVapiCallCostUsd(message, call);
  const transcript = resolveVapiTranscript(message);
  const recordingUrl = resolveVapiRecordingUrl(message);
  const endedReason =
    typeof message.endedReason === "string"
      ? message.endedReason
      : typeof call?.endedReason === "string"
        ? call.endedReason
        : null;

  // 1. Persist base call log. callLogs.vapiCallId is the idempotency boundary
  // for one-time post-call side effects (notifications, enrichment, webhooks,
  // compliance evidence). Voice accounting has its own durable per-provider-call
  // checkpoint and is intentionally re-driven on duplicate delivery below.
  // Concurrency note: callLogs.vapiCallId has a UNIQUE index. Postgres
  // serializes concurrent INSERTs to the same key via that index — one succeeds,
  // the other throws 23505 unique_violation. The winning/finalizing delivery is
  // the only one allowed past the post-metering duplicate return.
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
        cost: callCostUsd == null ? null : String(callCostUsd),
        summary: analysis?.summary || "No summary provided.",
        transcript,
        recordingUrl: recordingUrl,
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
      const duplicateCallId = call?.id;
      if (duplicateCallId) {
        const existing = await findCallLogByVapiCallId(duplicateCallId);
        if (existing && isOutboundCallPlaceholder(existing)) {
          // Atomic finalize-claim: the WHERE re-checks the placeholder markers
          // and the SET clears both (summary replaced, pipelineError nulled),
          // so when two workers process duplicate end-of-call jobs concurrently
          // exactly one RETURNING comes back non-empty. Only that winner fires
          // one-time downstream side effects after metering.
          const finalized = await drizzle
            .update(schema.callLogs)
            .set({
              durationSeconds: duration,
              cost: callCostUsd == null ? null : String(callCostUsd),
              summary: analysis?.summary || "No summary provided.",
              transcript,
              recordingUrl: recordingUrl,
              endedReason,
              toolCallsTotal: stagedReliability?.toolCallsTotal ?? 0,
              toolCallsFailed: stagedReliability?.toolCallsFailed ?? 0,
              escalationAttempted: stagedReliability?.escalationAttempted ?? false,
              escalationSucceeded: stagedReliability?.escalationSucceeded ?? false,
              pipelineError: null,
            })
            .where(
              sql`${schema.callLogs.vapiCallId} = ${duplicateCallId} AND (${schema.callLogs.pipelineError} = ${OUTBOUND_CALL_DIALING_MARKER} OR ${schema.callLogs.summary} = ${OUTBOUND_CALL_PLACEHOLDER_SUMMARY})`,
            )
            .returning({ id: schema.callLogs.id });
          if (finalized.length) {
            insertedFresh = true;
            insertedCallLogId = finalized[0].id;
            log.info("Outbound placeholder call log finalized from end-of-call-report", {
              callId: duplicateCallId,
            });
          } else {
            log.info("Outbound placeholder already finalized by a concurrent worker", {
              callId: duplicateCallId,
            });
          }
        } else {
          if (transcript.trim()) {
            await drizzle
              .update(schema.callLogs)
              .set({ transcript })
              .where(
                sql`${schema.callLogs.vapiCallId} = ${duplicateCallId} AND (${schema.callLogs.transcript} IS NULL OR ${schema.callLogs.transcript} = '')`,
              );
          }
          if (recordingUrl) {
            await drizzle
              .update(schema.callLogs)
              .set({ recordingUrl })
              .where(
                sql`${schema.callLogs.vapiCallId} = ${duplicateCallId} AND (${schema.callLogs.recordingUrl} IS NULL OR ${schema.callLogs.recordingUrl} = '')`,
              );
          }
          if (callCostUsd != null) {
            await drizzle
              .update(schema.callLogs)
              .set({ cost: String(callCostUsd) })
              .where(
                sql`${schema.callLogs.vapiCallId} = ${duplicateCallId} AND ${schema.callLogs.cost} IS NULL`,
              );
          }
          log.info("Duplicate end-of-call-report reached retry-safe evidence patch", {
            callId: duplicateCallId,
          });
        }
      }
    } else {
      log.error("Failed to insert call log", { callId: call?.id, error: getErrorMessage(logErr) });
      throw logErr;
    }
  }

  const optOut = detectOptOut(transcript || "");
  if (optOut.kind === "dnc") {
    await persistTranscriptDncSuppression({
      userId,
      callId: call?.id || null,
      rawCallerNumber: call?.customer?.number || "",
      matchedPattern: optOut.matched_pattern,
    });
  }

  // TCPA evidence (disclosure + opt-out ledger rows) is retry-safe and
  // idempotent per call, so a redelivery restores evidence a failed first
  // delivery never wrote. It runs after the legal DNC boundary and stays
  // best-effort so a ledger outage cannot block voice accounting below.
  await persistComplianceEvidence({
    userId,
    call,
    transcript: transcript || "",
    duration,
    optOut,
    insertedFresh,
  });

  // Voice metering is intentionally BEFORE the call-log duplicate return. Its
  // own tenant+provider-call checkpoint makes both the monthly increment and
  // balance debit retry-safe, so a redelivery can finish revenue accounting
  // after a DNC or provider failure without duplicating any one-time side effect.
  await trackVoiceMinutes({
    userId,
    durationSeconds: duration,
    vapiCallId,
  });

  if (!insertedFresh) {
    // Duplicate delivery has now repaired optional evidence, legal DNC state,
    // and any unfinished voice accounting. Everything below is one-time work.
    return;
  }

  emitServerProductEventOnce({
    event: "first_call_completed",
    userId,
    agentId: webhookAgentId,
    metadata: {
      call_log_id: insertedCallLogId?.toString() ?? null,
      direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
    },
  });
  emitServerProductEventOnce({
    event: "live_call_completed",
    userId,
    agentId: webhookAgentId,
    metadata: {
      call_log_id: insertedCallLogId?.toString() ?? null,
      direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
    },
  });

  // Ping the Account Holder's Wireline devices with a tap-to-open recap.
  // Best-effort and env-gated (no-op without APNs creds); never blocks webhook.
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
      agentId: webhookAgentId || null,
      dialedNumber: call?.phoneNumber?.number || call?.phoneNumber || null,
      customerNumber: call?.customer?.number || null,
      customerName: call?.customer?.name || null,
      agentName: call?.assistant?.name || null,
      direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
      durationSeconds: duration,
      summary: analysis?.summary || null,
      transcript: transcript || null,
      sentiment: null,
      intentLabel: null,
      endedReason,
      vapiCallType: call?.type || null,
      demo: false,
      vapiCallId,
    }).catch((err: any) =>
      log.warn("runPostCallDigest unhandled rejection", { error: err?.message }),
    );
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
  if (transcript) {
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
            transcript: transcript || "",
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
          transcript: transcript || "",
        });
      });
      const result = cap.result;

      // QA score: agent-quality assessment (vs leadScore which is
      // customer-intent). Derived from the analysis output so we don't
      // burn another LLM round-trip per call. Surfaced on CallLogs as
      // a colored score badge so account holders see at a glance which calls
      // need coaching review.
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

  // 4. Compliance evidence (TCPA disclosure + opt-out ledger rows) is written
  // in the retry-safe section above the duplicate return, so it survives a
  // failed first delivery. See persistComplianceEvidence.

  // 5. Gemini Fallback
  if (!enrichment && transcript) {
    try {
      const geminiResult = await geminiPostCallAnalysis({
        transcript,
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

  invalidateDashboard(userId);
}
