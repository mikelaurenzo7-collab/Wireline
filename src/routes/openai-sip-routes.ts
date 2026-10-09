import { Router, type Request, type Response as ExpressResponse } from "express";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { AppError, asyncHandler } from "../lib/api-error";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import {
  acquireAccountOperationLease,
  releaseAccountOperationLease,
} from "../lib/account-operation-lease";
import { runInBackground } from "../lib/background-work";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";
import {
  markRealtimeProviderCallOutcome,
  shouldRetainRealtimeReservation,
} from "../lib/realtime-provider-outcome";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../lib/server-context";
import { verifyStandardWebhook } from "../lib/standard-webhook-auth";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { isOutboundCallPurpose, type OutboundCallPurpose } from "../lib/outbound-call-purpose";
import { LEAD_STATUS } from "../lib/outbound-status";
import { resolveNativeInboundCallAdmission } from "../lib/voice/native-inbound-admission";
import { recordMissedCall, type MissedCallReason } from "../lib/voice/missed-calls";
import { enforceFundedCarrierCallLimit } from "../lib/voice/funded-carrier-call";
import { verifyOpenAIInboundToken } from "../lib/voice/openai-inbound-token";
import { buildOpenAIRealtimeAgentRuntime } from "../lib/voice/openai-phone-agent-runtime";
import {
  openAIAcceptFailureDiagnostics,
  safeVoiceAdmissionError,
} from "../lib/voice/voice-admission-diagnostics";
import {
  openAIOutboundPlacementMatches,
  verifyOpenAIOutboundToken,
} from "../lib/voice/openai-outbound-token";
import {
  OPENAI_INBOUND_SIP_TOKEN_HEADER,
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER,
  OPENAI_REALTIME_CALLS_URL,
  normalizeOpenAIPhoneNumber,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";
import { forwardOpenAISipWebhook } from "../lib/voice/openai-sip-worker-dispatch";
import {
  applyInboundAdmission,
  claimOpenAISipCall,
  markOpenAISipCallRunning,
  releaseOpenAISipClaimForRetry,
  runOpenAISipCallSession,
  settleOpenAISipPreSessionFailure,
  type OpenAISipCallClaim,
  type OpenAISipIncomingCall,
} from "../lib/voice/openai-sip-session";

/** A suspended admission's reason, as the missed-call History entry names it. */
function missedReason(reason: string | undefined): MissedCallReason {
  return reason === "concurrency" ||
    reason === "coverage" ||
    reason === "completion_grace" ||
    reason === "daily_minutes" ||
    reason === "subscription"
    ? reason
    : "unavailable";
}

const router = Router();
const webhookLimiter = createIpRateLimiter({
  bucket: "provider:openai-realtime-webhook",
  windowMs: 60_000,
  max: 300,
  failClosedOnError: false,
});

type IncomingWebhook = {
  type?: unknown;
  data?: { call_id?: unknown; sip_headers?: unknown };
};

const ACTIVE_OUTBOUND_STATUSES: readonly string[] = [
  LEAD_STATUS.PENDING,
  LEAD_STATUS.QUEUED,
  LEAD_STATUS.RETRYING,
  LEAD_STATUS.DIALING,
  LEAD_STATUS.CONNECTED,
];
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function outboundPurpose(value: unknown): OutboundCallPurpose {
  return isOutboundCallPurpose(value) ? value : "marketing_or_sales";
}

function parseBody(req: Request): { raw: Buffer; payload: IncomingWebhook } {
  if (!Buffer.isBuffer(req.body)) throw AppError.badRequest("A raw webhook body is required.");
  try {
    const value = JSON.parse(req.body.toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return { raw: req.body, payload: value as IncomingWebhook };
  } catch {
    throw AppError.badRequest("The OpenAI webhook body is invalid JSON.");
  }
}

function sipHeader(payload: IncomingWebhook, name: string): string {
  const headers = Array.isArray(payload.data?.sip_headers) ? payload.data?.sip_headers : [];
  const row = headers.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return String((value as { name?: unknown }).name || "").toLowerCase() === name.toLowerCase();
  }) as { value?: unknown } | undefined;
  return typeof row?.value === "string" ? row.value.trim() : "";
}

async function resolveInboundContext(
  calledNumber: string,
  callerNumber: string | null,
  callId: string,
  twilioCallSid: string,
) {
  const [line] = await drizzle
    .select({
      userId: schema.phoneNumbers.userId,
      agentId: schema.phoneNumbers.agentId,
      businessName: schema.settings.businessName,
    })
    .from(schema.phoneNumbers)
    .leftJoin(schema.settings, eq(schema.settings.userId, schema.phoneNumbers.userId))
    .where(eq(schema.phoneNumbers.phoneNumber, calledNumber))
    .limit(1);
  if (!line?.userId || !line.agentId) return null;
  return {
    call: {
      userId: line.userId,
      agentId: line.agentId,
      callerNumber,
      calledNumber,
      direction: "inbound" as const,
      businessName: line.businessName,
      admission: await tenantStore.run(line.userId, () =>
        resolveNativeInboundCallAdmission({
          userId: line.userId,
          agentId: line.agentId!,
          callId,
          twilioCallSid,
          callerNumber,
        }),
      ),
    },
  };
}

async function resolveOutboundContext(
  token: string,
  callId: string,
): Promise<{ call: OpenAISipIncomingCall }> {
  const verification = verifyOpenAIOutboundToken(token);
  if (!verification.ok) {
    log.warn("OpenAI outbound SIP token rejected", { reason: verification.reason });
    throw AppError.unauthorized("Invalid outbound voice correlation token.");
  }
  const leadId = BigInt(verification.claims.leadId);

  return drizzle.transaction(async (tx) => {
    const [lead] = await tx
      .select()
      .from(schema.outboundLeads)
      .where(eq(schema.outboundLeads.id, leadId))
      .limit(1);
    if (!lead?.agentId) throw AppError.notFound("The correlated outbound call no longer exists.");

    const metadata = asRecord(lead.metadata);
    const nativeVoice = asRecord(metadata.native_voice);
    if (!openAIOutboundPlacementMatches(nativeVoice, verification.claims)) {
      throw AppError.conflict("This outbound voice token belongs to an earlier placement.");
    }
    const recoverableCarrierRace =
      lead.status === LEAD_STATUS.ERROR &&
      nativeVoice.state === "carrier_completed_without_openai_confirmation";
    if (!ACTIVE_OUTBOUND_STATUSES.includes(lead.status || "") && !recoverableCarrierRace) {
      throw AppError.conflict("This outbound call is no longer attachable.");
    }

    const customerNumber = normalizeOpenAIPhoneNumber(lead.customerNumber || lead.phoneNumber);
    if (!customerNumber) {
      throw AppError.conflict("The outbound contact no longer has a valid phone number.");
    }
    const outboundLineNumber = normalizeOpenAIPhoneNumber(nativeVoice.outbound_line_number);
    if (!outboundLineNumber) {
      throw AppError.conflict("This outbound placement is missing its originating line.");
    }
    // A node-postgres transaction owns one connection. Keep reads sequential;
    // Promise.all on the same transaction client can interleave protocol
    // messages and break the advisory-lock boundary under load.
    const [line] = await tx
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, lead.userId),
          eq(schema.phoneNumbers.agentId, lead.agentId),
          eq(schema.phoneNumbers.phoneNumber, outboundLineNumber),
        ),
      )
      .limit(1);
    const [agentContext] = await tx
      .select({
        businessName: schema.settings.businessName,
        complianceMode: schema.agents.complianceMode,
      })
      .from(schema.agents)
      .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
      .where(and(eq(schema.agents.id, lead.agentId), eq(schema.agents.userId, lead.userId)))
      .limit(1);
    const calledNumber = normalizeOpenAIPhoneNumber(line?.phoneNumber);
    if (!calledNumber || calledNumber !== outboundLineNumber || !agentContext) {
      throw AppError.serviceUnavailable("The outbound Bot or Twilio line is not active.");
    }

    return {
      call: {
        callId,
        userId: lead.userId,
        agentId: lead.agentId,
        callerNumber: customerNumber,
        calledNumber,
        direction: "outbound" as const,
        leadId: lead.id,
        outboundPlacementId: String(nativeVoice.placement_id),
        customerName: lead.customerName,
        context: lead.context,
        callPurpose: outboundPurpose(nativeVoice.call_purpose),
        businessName: agentContext.businessName,
        complianceMode: agentContext.complianceMode,
      },
    };
  });
}

async function callControl(
  callId: string,
  action: "accept" | "reject" | "hangup",
  body?: Record<string, unknown>,
): Promise<globalThis.Response> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw AppError.serviceUnavailable("OpenAI Realtime is not configured.");
  return fetchWithTimeout(
    `${OPENAI_REALTIME_CALLS_URL}/${encodeURIComponent(callId)}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    15_000,
  );
}

async function rejectCall(callId: string, statusCode = 603): Promise<void> {
  const response = await callControl(callId, "reject", { status_code: statusCode });
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`OpenAI call rejection returned HTTP ${response.status}.`);
  }
}

async function hangupCall(callId: string): Promise<void> {
  const response = await callControl(callId, "hangup");
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`OpenAI call hangup returned HTTP ${response.status}.`);
  }
}

async function runPreSessionCleanup(
  userId: string,
  steps: ReadonlyArray<{ name: string; operation: () => Promise<unknown> }>,
): Promise<void> {
  const results = await Promise.allSettled(steps.map((step) => step.operation()));
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    log.error("OpenAI SIP pre-session cleanup step failed", {
      userId,
      step: steps[index]?.name || "unknown",
      errorClass: result.reason instanceof Error ? result.reason.name : typeof result.reason,
    });
  });
}

async function settleOwnedPreSessionFailure(input: {
  call: OpenAISipIncomingCall;
  claim: OpenAISipCallClaim;
  reason: Parameters<typeof settleOpenAISipPreSessionFailure>[0]["reason"];
}): Promise<boolean> {
  try {
    return await settleOpenAISipPreSessionFailure(input);
  } catch (error) {
    log.error("OpenAI SIP durable pre-session settlement failed", {
      userId: input.call.userId,
      reason: input.reason,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

async function acceptCall(callId: string, session: Record<string, unknown>): Promise<void> {
  let response: globalThis.Response;
  try {
    response = await callControl(callId, "accept", session);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("OpenAI call acceptance failed.");
    throw markRealtimeProviderCallOutcome(error, true);
  }
  if (!response.ok && response.status !== 409) {
    log.error(
      "OpenAI SIP provider acceptance rejected",
      await openAIAcceptFailureDiagnostics(response),
    );
    const error = Object.assign(
      new Error(`OpenAI call acceptance returned HTTP ${response.status}.`),
      { status: response.status },
    );
    throw markRealtimeProviderCallOutcome(error, response.status >= 500);
  }
}

router.post(
  "/api/webhooks/openai/realtime",
  webhookLimiter,
  asyncHandler(async (req: Request, res: ExpressResponse) => {
    res.locals.voiceWorkerHandlerActive = true;
    try {
      const { raw, payload } = parseBody(req);
      const verification = verifyStandardWebhook({
        rawBody: raw,
        headers: {
          webhookId: String(req.get("webhook-id") || ""),
          webhookTimestamp: String(req.get("webhook-timestamp") || ""),
          webhookSignature: String(req.get("webhook-signature") || ""),
        },
        signingSecret: String(process.env.OPENAI_WEBHOOK_SECRET || ""),
      });
      if (!verification.ok) {
        log.warn("OpenAI Realtime webhook signature rejected", { reason: verification.reason });
        throw AppError.unauthorized("Invalid OpenAI webhook signature.");
      }
      if (payload.type !== "realtime.call.incoming") {
        res.status(202).json({ received: true, handled: false });
        return;
      }

      if (await forwardOpenAISipWebhook(req, res, raw)) return;

      const callId = typeof payload.data?.call_id === "string" ? payload.data.call_id.trim() : "";
      const outboundToken = sipHeader(payload, OPENAI_OUTBOUND_SIP_TOKEN_HEADER);
      const inboundToken = sipHeader(payload, OPENAI_INBOUND_SIP_TOKEN_HEADER);
      if (!callId || callId.length > 256 || Boolean(outboundToken) === Boolean(inboundToken)) {
        throw AppError.badRequest("The incoming call event is missing routing information.");
      }

      const inboundVerification = inboundToken ? verifyOpenAIInboundToken(inboundToken) : null;
      if (inboundVerification && !inboundVerification.ok) {
        log.warn("OpenAI inbound SIP token rejected", { reason: inboundVerification.reason });
        await rejectCall(callId, 403);
        res.status(202).json({ received: true, handled: false });
        return;
      }
      const calledNumber = inboundVerification?.ok ? inboundVerification.claims.calledNumber : null;
      const callerNumber = inboundVerification?.ok ? inboundVerification.claims.callerNumber : null;

      const context = outboundToken
        ? await resolveOutboundContext(outboundToken, callId)
        : await resolveInboundContext(
            calledNumber!,
            callerNumber,
            callId,
            inboundVerification?.ok ? inboundVerification.claims.twilioCallSid : "",
          );
      if (!context) {
        log.warn("OpenAI incoming call rejected: no active BotBound line", {
          calledSuffix: phoneSuffixForLog(calledNumber ?? ""),
        });
        await rejectCall(callId, 404);
        res.status(202).json({ received: true, handled: false });
        return;
      }

      const environment = await liveExternalActionPolicyForUser(context.call.userId);
      if (!environment.allowed) {
        await rejectCall(callId, 603);
        res.status(202).json({ received: true, handled: false });
        return;
      }

      const sessionInput: OpenAISipIncomingCall = { callId, ...context.call };
      if (inboundVerification?.ok) {
        sessionInput.inboundTwilioCallSid = inboundVerification.claims.twilioCallSid;
      }
      if (sessionInput.direction === "inbound" && sessionInput.admission?.mode === "suspended") {
        // Coverage and capacity refusals are terminal for this new call. Do not
        // accept a paid AI session merely to explain that paid AI is unavailable.
        // History says why; the carrier fallback then offers voicemail.
        await recordMissedCall({
          userId: sessionInput.userId,
          agentId: sessionInput.agentId,
          twilioCallSid: sessionInput.inboundTwilioCallSid ?? "",
          callerNumber: sessionInput.callerNumber,
          reason: missedReason(sessionInput.admission.reason),
        });
        await rejectCall(callId, 603);
        res.status(202).json({
          received: true,
          handled: false,
          reason: sessionInput.admission.reason ?? "subscription",
        });
        return;
      }
      let runtime: Awaited<ReturnType<typeof buildOpenAIRealtimeAgentRuntime>>;
      try {
        runtime = applyInboundAdmission(
          await buildOpenAIRealtimeAgentRuntime({
            userId: sessionInput.userId,
            agentId: sessionInput.agentId,
            surface: "phone",
          }),
          sessionInput,
        );
      } catch (error) {
        await rejectCall(callId, 603);
        throw error;
      }

      const lease = await acquireAccountOperationLease({
        userId: sessionInput.userId,
        kind: "provider",
        operation: "openai_sip_call_session",
        ttlMs: (resolveOpenAISipSessionMaxSeconds() + 5 * 60) * 1_000,
      });
      if (!lease) {
        await rejectCall(callId, 486);
        res.status(202).json({ received: true, handled: false });
        return;
      }

      let callClaim: OpenAISipCallClaim | "retry" | null;
      try {
        callClaim = await claimOpenAISipCall(sessionInput);
      } catch (error) {
        await runPreSessionCleanup(sessionInput.userId, [
          {
            name: "account_lease_release",
            operation: () =>
              releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId }),
          },
          { name: "provider_reject", operation: () => rejectCall(callId, 603) },
        ]);
        if (
          error instanceof AppError &&
          [
            "VOICE_CONCURRENCY_EXCEEDED",
            "VOICE_FUNDING_IN_USE",
            "VOICE_FUNDING_REQUIRED",
            "VOICE_PLAN_REQUIRED",
            "VOICE_FUNDING_SETTLED",
          ].includes(error.code)
        ) {
          res.status(202).json({
            received: true,
            handled: false,
            reason: error.code === "VOICE_CONCURRENCY_EXCEEDED" ? "concurrency" : "call_coverage",
          });
          return;
        }
        throw error;
      }
      if (callClaim === "retry") {
        await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
        res.setHeader("Retry-After", "2");
        res.status(503).json({ received: true, handled: false, retry: true });
        return;
      }
      if (callClaim === null) {
        await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
        log.info("Duplicate OpenAI incoming-call webhook suppressed before spend or acceptance", {
          calledSuffix: phoneSuffixForLog(calledNumber ?? ""),
        });
        res.status(202).json({ received: true, handled: true, duplicate: true });
        return;
      }
      const claimedCallLogId = callClaim.callLogId;
      if (callClaim.funding) sessionInput.funding = callClaim.funding;
      sessionInput.recoveredSession = callClaim.resumed;

      let reservation: Awaited<ReturnType<typeof reserveRealtimeSessionSpend>>;
      let spendAdmissionStage: "carrier_limit" | "realtime_spend_reservation" = "carrier_limit";
      try {
        if (sessionInput.funding)
          await tenantStore.run(sessionInput.userId, () =>
            enforceFundedCarrierCallLimit(
              sessionInput.userId,
              `openai:${callId}`,
              sessionInput.funding!,
            ),
          );
        spendAdmissionStage = "realtime_spend_reservation";
        reservation = await reserveRealtimeSessionSpend(
          req,
          sessionInput.userId,
          "openai_sip",
          `openai-sip:${callId}`,
          sessionInput.admission,
        );
      } catch (error) {
        log.error("OpenAI SIP funding admission failed", {
          stage: spendAdmissionStage,
          ...safeVoiceAdmissionError(error),
        });
        const owned = await settleOwnedPreSessionFailure({
          call: sessionInput,
          claim: callClaim,
          reason: "spend_reservation_failed",
        });
        await runPreSessionCleanup(sessionInput.userId, [
          {
            name: "account_lease_release",
            operation: () =>
              releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId }),
          },
          ...(owned ? [{ name: "provider_reject", operation: () => rejectCall(callId, 603) }] : []),
        ]);
        if (
          error instanceof AppError &&
          (error.status === 402 ||
            error.status === 503 ||
            ["VOICE_ALREADY_ENDED", "VOICE_FUNDING_EXPIRED"].includes(error.code))
        ) {
          log.warn("OpenAI incoming call rejected: spend reservation failed", {
            code: error.code,
          });
          res.status(202).json({ received: true, handled: false });
          return;
        }
        throw error;
      }

      try {
        await acceptCall(callId, runtime.session as Record<string, unknown>);
      } catch (error) {
        const ambiguous = shouldRetainRealtimeReservation(error);
        let owned = false;
        if (ambiguous) {
          try {
            await releaseOpenAISipClaimForRetry({ call: sessionInput, claim: callClaim });
            owned = true;
          } catch (releaseError) {
            log.error("OpenAI SIP ambiguous accept could not release its claim for retry", {
              userId: sessionInput.userId,
              errorClass: releaseError instanceof Error ? releaseError.name : typeof releaseError,
            });
          }
        } else {
          owned = await settleOwnedPreSessionFailure({
            call: sessionInput,
            claim: callClaim,
            reason: "provider_accept_failed",
          });
        }
        await runPreSessionCleanup(sessionInput.userId, [
          {
            name: "account_lease_release",
            operation: () =>
              releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId }),
          },
          ...(owned
            ? [
                {
                  name: "spend_reservation_release",
                  operation: () => releaseRealtimeSessionSpendAfterFailure(req, reservation, error),
                },
              ]
            : []),
          ...(!ambiguous && owned
            ? [{ name: "provider_hangup", operation: () => hangupCall(callId) }]
            : []),
        ]);
        throw error;
      }
      try {
        await commitRealtimeSessionSpend(reservation);
      } catch (error) {
        const owned = await settleOwnedPreSessionFailure({
          call: sessionInput,
          claim: callClaim,
          reason: "spend_commit_failed",
        });
        await runPreSessionCleanup(sessionInput.userId, [
          {
            name: "account_lease_release",
            operation: () =>
              releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId }),
          },
          ...(owned ? [{ name: "provider_hangup", operation: () => hangupCall(callId) }] : []),
        ]);
        throw error;
      }

      // Register the durable runtime with Vercel before advancing the claim to
      // running, but hold all session/provider work behind this startup gate.
      // This closes the freeze/crash window between the durable transition and
      // waitUntil ownership without letting a worker run on an unconfirmed claim.
      let releaseSessionStartup!: (start: boolean) => void;
      const sessionStartup = new Promise<boolean>((resolve) => {
        releaseSessionStartup = resolve;
      });
      runInBackground("openai-sip-call-session", async () => {
        const shouldStart = await sessionStartup;
        if (!shouldStart) return;
        try {
          await runOpenAISipCallSession(
            sessionInput,
            runtime,
            claimedCallLogId,
            callClaim,
            reservation,
          );
        } finally {
          await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
        }
      });

      try {
        await markOpenAISipCallRunning({ call: sessionInput, claim: callClaim });
      } catch (error) {
        releaseSessionStartup(false);
        const owned = await settleOwnedPreSessionFailure({
          call: sessionInput,
          claim: callClaim,
          reason: "session_start_failed",
        });
        await runPreSessionCleanup(sessionInput.userId, [
          {
            name: "account_lease_release",
            operation: () =>
              releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId }),
          },
          ...(owned ? [{ name: "provider_hangup", operation: () => hangupCall(callId) }] : []),
        ]);
        throw error;
      }
      releaseSessionStartup(true);
      res.status(202).json({ received: true, handled: true });
    } finally {
      res.locals.voiceWorkerHandlerActive = false;
      res.locals.voiceWorkerAdmissionRelease?.();
    }
  }),
);

export default router;
