import { Router, type Request, type Response as ExpressResponse } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { ALL_SHOWCASE_CONTACT_AGENTS } from "../data/contact-agents";
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
  ensureFounderShowcaseBots,
  founderShowcaseAgentId,
} from "../lib/founder-showcase-seed";
import { resolveFounderUserId } from "../lib/founder-fleet-seed";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../lib/server-context";
import { verifyStandardWebhook } from "../lib/standard-webhook-auth";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { isOutboundCallPurpose, type OutboundCallPurpose } from "../lib/outbound-call-purpose";
import { LEAD_STATUS } from "../lib/outbound-status";
import { resolveNativeInboundAdmission } from "../lib/voice/native-inbound-admission";
import { buildOpenAIRealtimeAgentRuntime } from "../lib/voice/openai-phone-agent-runtime";
import {
  openAIOutboundPlacementMatches,
  verifyOpenAIOutboundToken,
} from "../lib/voice/openai-outbound-token";
import {
  OPENAI_CALLED_NUMBER_HEADER,
  OPENAI_CALLER_NUMBER_HEADER,
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER,
  OPENAI_REALTIME_CALLS_URL,
  normalizeOpenAIPhoneNumber,
} from "../lib/voice/openai-sip-config";
import {
  applyInboundAdmission,
  runOpenAISipCallSession,
  type OpenAISipIncomingCall,
} from "../lib/voice/openai-sip-session";

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
const OUTBOUND_ATTACHABLE_STATUSES: readonly string[] = [
  ...ACTIVE_OUTBOUND_STATUSES,
  LEAD_STATUS.ERROR,
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

function publicShowcaseByNumber(phoneNumber: string) {
  return ALL_SHOWCASE_CONTACT_AGENTS.find(
    (agent) => normalizeOpenAIPhoneNumber(agent.tel) === phoneNumber,
  );
}

async function resolveInboundContext(calledNumber: string, callerNumber: string | null) {
  const showcase = publicShowcaseByNumber(calledNumber);
  if (showcase) {
    const userId = await resolveFounderUserId();
    if (!userId) throw AppError.serviceUnavailable("The founder showcase workspace is unavailable.");
    await ensureFounderShowcaseBots(userId);
    return {
      call: {
        userId,
        agentId: founderShowcaseAgentId(userId, showcase.name),
        callerNumber,
        calledNumber,
        direction: "inbound" as const,
        businessName: "BotBound",
      },
      showcase: true,
    };
  }

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
        resolveNativeInboundAdmission(line.userId, line.agentId!),
      ),
    },
    showcase: false,
  };
}

async function resolveOutboundContext(
  token: string,
  callId: string,
): Promise<{ call: OpenAISipIncomingCall; showcase: false }> {
  const verification = verifyOpenAIOutboundToken(token);
  if (!verification.ok) {
    log.warn("OpenAI outbound SIP token rejected", { reason: verification.reason });
    throw AppError.unauthorized("Invalid outbound voice correlation token.");
  }
  const leadId = BigInt(verification.claims.leadId);

  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(leadId)}`}))`,
    );
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
    if (!calledNumber || !agentContext) {
      throw AppError.serviceUnavailable("The outbound Bot or Twilio line is not active.");
    }

    const now = new Date();
    const [attached] = await tx
      .update(schema.outboundLeads)
      .set({
        status: LEAD_STATUS.CONNECTED,
        lastCalledAt: lead.lastCalledAt || now,
        metadata: {
          ...metadata,
          native_voice: {
            ...nativeVoice,
            provider: "twilio_openai_realtime_sip",
            openai_call_id: `openai:${callId}`,
            state: "connected",
            openai_attached_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        },
      })
      .where(
        and(
          eq(schema.outboundLeads.id, lead.id),
          eq(schema.outboundLeads.userId, lead.userId),
          inArray(schema.outboundLeads.status, OUTBOUND_ATTACHABLE_STATUSES),
        ),
      )
      .returning({ id: schema.outboundLeads.id });
    if (!attached) throw AppError.conflict("The outbound call attachment lost its lease.");

    return {
      call: {
        callId,
        userId: lead.userId,
        agentId: lead.agentId,
        callerNumber: customerNumber,
        calledNumber,
        direction: "outbound" as const,
        leadId: lead.id,
        customerName: lead.customerName,
        context: lead.context,
        callPurpose: outboundPurpose(nativeVoice.call_purpose),
        businessName: agentContext.businessName,
        complianceMode: agentContext.complianceMode,
      },
      showcase: false as const,
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

async function acceptCall(callId: string, session: Record<string, unknown>): Promise<void> {
  const response = await callControl(callId, "accept", session);
  if (!response.ok && response.status !== 409) {
    throw new Error(`OpenAI call acceptance returned HTTP ${response.status}.`);
  }
}

router.post(
  "/api/webhooks/openai/realtime",
  webhookLimiter,
  asyncHandler(async (req: Request, res: ExpressResponse) => {
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

    const callId = typeof payload.data?.call_id === "string" ? payload.data.call_id.trim() : "";
    const outboundToken = sipHeader(payload, OPENAI_OUTBOUND_SIP_TOKEN_HEADER);
    const calledNumber =
      normalizeOpenAIPhoneNumber(sipHeader(payload, OPENAI_CALLED_NUMBER_HEADER)) ||
      normalizeOpenAIPhoneNumber(sipHeader(payload, "To"));
    const callerNumber =
      normalizeOpenAIPhoneNumber(sipHeader(payload, OPENAI_CALLER_NUMBER_HEADER)) ||
      normalizeOpenAIPhoneNumber(sipHeader(payload, "From"));
    if (!callId || callId.length > 256 || (!outboundToken && !calledNumber)) {
      throw AppError.badRequest("The incoming call event is missing routing information.");
    }

    const context = outboundToken
      ? await resolveOutboundContext(outboundToken, callId)
      : await resolveInboundContext(calledNumber!, callerNumber);
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
      ttlMs: 10 * 60_000,
    });
    if (!lease) {
      await rejectCall(callId, 486);
      res.status(202).json({ received: true, handled: false });
      return;
    }

    let reservation: Awaited<ReturnType<typeof reserveRealtimeSessionSpend>>;
    try {
      reservation = await reserveRealtimeSessionSpend(req, sessionInput.userId, "openai_sip");
    } catch (error) {
      await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
      await rejectCall(callId, 603);
      if (error instanceof AppError && (error.status === 402 || error.status === 503)) {
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
      await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
      await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);
      await callControl(callId, "hangup").catch(() => undefined);
      throw error;
    }
    await commitRealtimeSessionSpend(reservation);

    runInBackground("openai-sip-call-session", async () => {
      try {
        await runOpenAISipCallSession(sessionInput, runtime);
      } finally {
        await releaseAccountOperationLease({ id: lease.id, userId: sessionInput.userId });
      }
    });
    res.status(202).json({ received: true, handled: true });
  }),
);

export default router;
