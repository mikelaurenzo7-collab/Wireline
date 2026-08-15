/* eslint-disable @typescript-eslint/no-explicit-any -- Twilio API responses are vendor-defined. */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { dncPhoneCandidates } from "./compliance";

import * as schema from "../db/schema";
import { resolveAgentSmsFromNumber } from "./agent-phone-lines";
import { refundRuntimeUsage, reserveRuntimeUsage } from "./runtime-usage-billing";
import { SMS_COST_PER_SEGMENT_USD } from "./sms-billing";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { isLaunchHardBlocked } from "./launch-readiness";
import { assertLiveWorkEntitlementForUser } from "./trial-gate";
import { finalizeAcceptedTwilioMessage } from "./twilio-message-reconciliation";
import {
  createTwilioMessageWithRateLimitRetry,
  withTwilioMessageReliability,
} from "./twilio-message-reliability";
import {
  getTwilioClient,
  isTwilioConfigured,
  lookupTenantPhoneNumber,
  SMS_PROVIDER_OUTCOME_AMBIGUOUS,
  type TwilioMessageChannel,
  type TwilioSendResult,
} from "./twilio-service-base";

export * from "./twilio-service-base";

const GSM_BASIC = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const GSM_EXTENSION = new Set(Array.from("^{}\\[~]|€"));

interface MessagingSettings {
  enabled: boolean;
  lookupEnabled: boolean;
  messagingServiceSid: string | null;
  smsFromNumber: string | null;
  whatsappFromNumber: string | null;
}

function cleanPhone(raw: string | null | undefined): string {
  const input = String(raw || "").replace(/^whatsapp:/i, "");
  const cleaned = input.replace(/[^0-9+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned;
}

function address(phone: string, channel: TwilioMessageChannel): string {
  return channel === "whatsapp" ? `whatsapp:${phone}` : phone;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function twilioMessageReservationReference(input: {
  channel: TwilioMessageChannel;
  idempotencyKey?: string;
  reservationAttempt?: number;
}): string {
  const operationKey = String(input.idempotencyKey || "").trim() || randomUUID();
  const parsedAttempt = Number(input.reservationAttempt);
  const attemptSuffix =
    Number.isFinite(parsedAttempt) && parsedAttempt > 0
      ? `:attempt:${Math.floor(parsedAttempt)}`
      : "";
  return `twilio_message:${input.channel}:${operationKey}${attemptSuffix}`;
}

/** Conservative pre-send segment estimate. Smart Encoding can lower the final Twilio count. */
export function estimateSmsSegments(body: string): number {
  let gsmUnits = 0;
  let gsm = true;
  for (const character of Array.from(body)) {
    if (GSM_BASIC.has(character)) gsmUnits += 1;
    else if (GSM_EXTENSION.has(character)) gsmUnits += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153);
  const unicodeUnits = body.length;
  return unicodeUnits <= 70 ? 1 : Math.ceil(unicodeUnits / 67);
}

/**
 * Repair a reserve left by a failed pre-provider latch before a later durable
 * attempt creates a new reserve. The burn lookup prevents a speculative refund
 * from crediting money that was never debited; refundRuntimeUsage makes the
 * matching credit idempotent when the first cleanup actually succeeded.
 */
export async function refundReservedTenantMessageAttempt(input: {
  userId: string;
  idempotencyKey: string;
  reservationAttempt: number;
  channel?: TwilioMessageChannel;
}): Promise<boolean> {
  const channel = input.channel || "sms";
  const referenceId = twilioMessageReservationReference({
    channel,
    idempotencyKey: input.idempotencyKey,
    reservationAttempt: input.reservationAttempt,
  });
  const [burn] = await drizzle
    .select({
      id: schema.creditLedger.id,
      deltaUsd: schema.creditLedger.deltaUsd,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.idempotencyKey, `runtime_usage:${referenceId}`),
        eq(schema.creditLedger.entryKind, "burn"),
        eq(schema.creditLedger.refId, referenceId),
      ),
    )
    .limit(1);
  if (!burn) return false;

  // Use the persisted debit as the refund source of truth. Recomputing from
  // today's segment/pricing configuration could under- or over-refund a prior
  // attempt after a deploy or rate change (and WhatsApp may now be disabled).
  const amountUsd = Math.abs(Number(burn.deltaUsd));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error("Cannot reconcile a Twilio reservation with an invalid ledger debit.");
  }
  await refundRuntimeUsage({
    userId: input.userId,
    amountUsd,
    referenceId,
    reason: "Twilio provider attempt did not start",
    provider: "twilio",
    source: "twilio",
    metadata: { channel, pre_provider_reconciliation: true, original_burn_id: String(burn.id) },
  });
  return true;
}

/**
 * Durable proof that a claimed message attempt was definitely not accepted by
 * Twilio. Both a pre-provider failure and an explicit provider 4xx write this
 * refund; ambiguous network/5xx outcomes deliberately retain the debit and do
 * not produce one. A caller may open a new provider attempt only when this
 * exact attempt-scoped proof exists.
 */
export async function hasDurableTenantMessageAttemptRefund(input: {
  userId: string;
  idempotencyKey: string;
  reservationAttempt: number;
  channel?: TwilioMessageChannel;
}): Promise<boolean> {
  const channel = input.channel || "sms";
  const referenceId = twilioMessageReservationReference({
    channel,
    idempotencyKey: input.idempotencyKey,
    reservationAttempt: input.reservationAttempt,
  });
  const [refund] = await drizzle
    .select({ id: schema.creditLedger.id, entryKind: schema.creditLedger.entryKind })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.entryKind, "refund"),
        eq(schema.creditLedger.refType, "runtime_usage_refund"),
        eq(schema.creditLedger.refId, referenceId),
        eq(schema.creditLedger.idempotencyKey, `runtime_usage_refund:${referenceId}`),
        eq(schema.creditLedger.provider, "twilio"),
      ),
    )
    .limit(1);
  return Boolean(refund);
}

async function settingsFor(userId: string): Promise<MessagingSettings> {
  const [row] = await drizzle
    .select({
      enabled: schema.settings.twilioMessagingEnabled,
      lookupEnabled: schema.settings.twilioLookupEnabled,
      messagingServiceSid: schema.settings.twilioMessagingServiceSid,
      smsFromNumber: schema.settings.twilioSmsFromNumber,
      whatsappFromNumber: schema.settings.twilioWhatsappFromNumber,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  return {
    enabled: !!row?.enabled,
    lookupEnabled: !!row?.lookupEnabled,
    messagingServiceSid: row?.messagingServiceSid || null,
    smsFromNumber: row?.smsFromNumber || null,
    whatsappFromNumber: row?.whatsappFromNumber || null,
  };
}

async function existingThread(userId: string, customerNumber: string) {
  const [thread] = await drizzle
    .select({ id: schema.smsThreads.id, agentId: schema.smsThreads.agentId })
    .from(schema.smsThreads)
    .where(
      and(
        eq(schema.smsThreads.userId, userId),
        eq(schema.smsThreads.customerNumber, customerNumber),
      ),
    )
    .limit(1);
  return thread || null;
}

async function blockedByDnc(userId: string, phone: string): Promise<boolean> {
  // Match every stored variant (digits-only, "+"-prefixed, 10/11-digit) so a
  // number a tenant added to DNC digits-only still suppresses outbound SMS.
  const candidates = dncPhoneCandidates(phone);
  if (candidates.length === 0) return false;
  const [row] = await drizzle
    .select({ phone: schema.dncList.phone })
    .from(schema.dncList)
    .where(and(eq(schema.dncList.userId, userId), inArray(schema.dncList.phone, candidates)))
    .limit(1);
  return !!row;
}

function whatsappCustomerRate(): number | null {
  if (process.env.WIRELINE_WHATSAPP_PRIVATE_BETA !== "true") return null;
  const rate = Number(process.env.WIRELINE_WHATSAPP_CUSTOMER_RATE_USD || "");
  return Number.isFinite(rate) && rate > 0 ? money(rate) : null;
}

async function persistAmbiguousTwilioProviderOutcome(input: {
  userId: string;
  reservationReference: string;
  destinationSuffix: string;
  providerStatus: number | null;
}): Promise<void> {
  // Exit a possibly failed request transaction so the incident gets an
  // independent durable write. Message content and the full destination are
  // deliberately excluded from both the row and its metadata.
  await tenantStore.exit(() =>
    drizzle.insert(schema.auditLog).values({
      userId: input.userId,
      action: "twilio.message_provider_outcome_ambiguous",
      eventType: "provider.reconciliation",
      severity: "critical",
      provider: "twilio",
      resourceType: "twilio_message_reservation",
      resourceId: input.reservationReference,
      metadata: {
        reservation_reference: input.reservationReference,
        destination_suffix: input.destinationSuffix,
        provider_status: input.providerStatus,
      },
    }),
  );
}

/**
 * Profit-safe outbound SMS/WhatsApp boundary.
 * - honors DNC for both channels
 * - estimates and atomically reserves the complete customer charge before Twilio
 * - keeps a chosen agent sender associated with its Messaging Service controls
 * - validates new SMS contacts once instead of paying Lookup on every reply
 * - attaches a signed delivery-status callback and stale-message validity period
 * - keeps WhatsApp private-beta until a configured customer rate covers variable fees
 */
export async function sendTenantMessage(
  userId: string,
  params: {
    to: string;
    body: string;
    channel?: TwilioMessageChannel;
    agentId?: string;
    /** Stable internal operation identity for retry-safe Runtime Balance reservation. */
    idempotencyKey?: string;
    /** Attempt-scoped reserve; pre-provider failures are refunded before the next attempt. */
    reservationAttempt?: number;
    /**
     * Durable at-most-once latch invoked immediately before the first carrier
     * request. If it rejects, no Twilio request is made.
     */
    beforeProviderAttempt?: () => Promise<void>;
    /** Optional MMS / rich-media URL (Twilio mediaUrl). */
    mediaUrl?: string | string[];
  },
): Promise<TwilioSendResult> {
  const channel = params.channel || "sms";
  const phone = cleanPhone(params.to);
  const body = String(params.body || "").trim();
  if (!phone || !body) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "A destination and message body are required.",
      channel,
    };
  }

  // sendTenantMessage is shared by the inbox, agent tools, cadences, CSAT,
  // and action workflows. Guard the common carrier-spend boundary as well as
  // the interactive route so background callers cannot bypass the kill switch.
  if (isLaunchHardBlocked()) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "Messaging is temporarily paused while launch readiness is restored.",
      code: "LAUNCH_NOT_READY",
      channel,
    };
  }

  // Live SMS/WhatsApp spends carrier money and Runtime Balance. Free Builder
  // and pending-activation tenants must not burn prepaid balance (or leftover
  // grants) without a paid live plan — same commercial boundary as voice.
  const entitlement = await assertLiveWorkEntitlementForUser(userId);
  if (!entitlement.ok) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: entitlement.error,
      channel,
      code: entitlement.code,
      recovery_path: entitlement.recovery_path,
    };
  }

  const [settings, thread, dncBlocked] = await Promise.all([
    settingsFor(userId),
    existingThread(userId, phone),
    blockedByDnc(userId, phone),
  ]);
  if (!settings.enabled) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "Twilio messaging is disabled for this workspace.",
      channel,
    };
  }
  if (dncBlocked) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: true,
      reason: "This contact has opted out of messaging.",
      channel,
    };
  }

  const client = getTwilioClient();
  if (!client) {
    return {
      ok: false,
      configured: false,
      enabled: true,
      reason: "Twilio credentials are not configured on this deployment.",
      channel,
    };
  }

  if (channel === "sms" && settings.lookupEnabled && !thread) {
    const lookup = await lookupTenantPhoneNumber(userId, phone);
    if (!lookup.ok || lookup.valid === false) {
      return {
        ok: false,
        configured: lookup.configured,
        enabled: true,
        reason: lookup.reason || "The destination number did not pass phone validation.",
        channel,
      };
    }
    if ((lookup.lineType || "").toLowerCase() === "landline") {
      return {
        ok: false,
        configured: true,
        enabled: true,
        reason: "The destination is a landline, so SMS was not sent.",
        channel,
      };
    }
  }

  const segments = channel === "sms" ? estimateSmsSegments(body) : 1;
  const whatsappRate = channel === "whatsapp" ? whatsappCustomerRate() : null;
  if (channel === "whatsapp" && whatsappRate == null) {
    return {
      ok: false,
      configured: true,
      enabled: false,
      reason:
        "WhatsApp is available only through the priced private beta after a sender and approved templates are configured.",
      channel,
    };
  }
  const requiredBalance =
    channel === "sms" ? money(SMS_COST_PER_SEGMENT_USD * segments) : whatsappRate || 0;

  let sender = channel === "whatsapp" ? settings.whatsappFromNumber : settings.smsFromNumber;
  let agentSender: string | null = null;
  if (channel === "sms" && params.agentId) {
    agentSender = await resolveAgentSmsFromNumber(userId, params.agentId);
    sender = agentSender || sender;
  }
  if (!sender && !settings.messagingServiceSid) {
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Configure a Twilio sender or Messaging Service before sending.",
      channel,
    };
  }
  if (channel === "whatsapp" && !sender) {
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Configure a WhatsApp-enabled sender before sending.",
      channel,
    };
  }

  const payload: Record<string, any> = withTwilioMessageReliability({
    to: address(phone, channel),
    body,
  });
  const mediaUrls = Array.isArray(params.mediaUrl)
    ? params.mediaUrl.filter((url) => typeof url === "string" && url.trim())
    : typeof params.mediaUrl === "string" && params.mediaUrl.trim()
      ? [params.mediaUrl.trim()]
      : [];
  if (mediaUrls.length > 0) {
    payload.mediaUrl = mediaUrls;
  }
  if (channel === "whatsapp") {
    payload.from = address(cleanPhone(sender), channel);
  } else if (settings.messagingServiceSid) {
    payload.messagingServiceSid = settings.messagingServiceSid;
    if (agentSender) payload.from = cleanPhone(agentSender);
  } else if (sender) {
    payload.from = cleanPhone(sender);
  }

  const reservationReference = twilioMessageReservationReference({
    channel,
    idempotencyKey: params.idempotencyKey,
    reservationAttempt: params.reservationAttempt,
  });
  const reservation = await reserveRuntimeUsage({
    userId,
    amountUsd: requiredBalance,
    referenceId: reservationReference,
    reason: channel === "sms" ? "Outbound SMS" : "Outbound WhatsApp message",
    provider: "twilio",
    source: "twilio",
    metadata: {
      channel,
      estimated_segments: segments,
      estimated_usd: requiredBalance,
      destination_suffix: phone.slice(-4),
    },
  });
  if (!reservation.reserved) {
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: `Add Runtime Balance before sending. This message requires at least $${requiredBalance.toFixed(2)}.`,
      channel,
    };
  }

  // The callback is deliberately after every entitlement/configuration/
  // balance gate and immediately before the provider boundary. It is outside
  // the provider catch: a failed durable claim proves Twilio was never called,
  // so refund this attempt's reserve and reject for a safe queue retry.
  try {
    await params.beforeProviderAttempt?.();
  } catch (error) {
    try {
      await refundRuntimeUsage({
        userId,
        amountUsd: requiredBalance,
        referenceId: reservationReference,
        reason: "Twilio provider attempt did not start",
        provider: "twilio",
        source: "twilio",
        metadata: { channel, estimated_segments: segments, pre_provider_failure: true },
      });
    } catch (refundError) {
      log.error("Twilio pre-provider reservation refund failed", {
        userId,
        channel,
        reservationReference,
        preProviderError: getErrorMessage(error),
        refundError: getErrorMessage(refundError),
      });
      const accountingError = new Error(
        "Twilio was not called, but its pre-provider Runtime Balance refund could not be recorded.",
      );
      (accountingError as Error & { cause?: unknown }).cause = refundError;
      throw accountingError;
    }
    throw error;
  }

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await createTwilioMessageWithRateLimitRetry(
      () => client.messages.create(payload as any),
      {
        onRetry: ({ retryNumber, delayMs }) =>
          log.warn("Twilio message rate limited; retrying accepted-safe request", {
            userId,
            channel,
            retryNumber,
            delayMs,
          }),
      },
    );
  } catch (error) {
    const status = Number((error as { status?: number } | null)?.status || 0);
    // A Twilio 4xx means the provider definitively rejected the request. Network
    // and 5xx errors are ambiguous: the message may have been accepted before the
    // response was lost, so retain the reservation for reconciliation instead of
    // refunding and potentially funding duplicate carrier spend.
    const definitiveRejection = status >= 400 && status < 500;
    if (definitiveRejection) {
      try {
        // Refund is idempotent on reservationReference, including redelivered
        // or already-reserved attempts. Never hide a failed accounting write
        // behind the ordinary provider-rejection response.
        await refundRuntimeUsage({
          userId,
          amountUsd: requiredBalance,
          referenceId: reservationReference,
          reason: "Twilio rejected the outbound message",
          provider: "twilio",
          source: "twilio",
          metadata: { channel, status, estimated_segments: segments },
        });
      } catch (refundError) {
        log.error("Twilio rejection refund failed", {
          userId,
          channel,
          status,
          reservationReference,
          providerError: getErrorMessage(error),
          refundError: getErrorMessage(refundError),
        });
        const accountingError = new Error(
          "Twilio rejected the message, but its Runtime Balance refund could not be recorded.",
        );
        (accountingError as Error & { cause?: unknown }).cause = refundError;
        throw accountingError;
      }
    }
    if (!definitiveRejection) {
      let incidentRecorded = false;
      try {
        await persistAmbiguousTwilioProviderOutcome({
          userId,
          reservationReference,
          destinationSuffix: phone.slice(-4),
          providerStatus: status || null,
        });
        incidentRecorded = true;
      } catch (auditError) {
        log.error("Twilio ambiguous provider outcome audit persistence failed", {
          userId,
          reservationReference,
          destinationSuffix: phone.slice(-4),
          status: status || undefined,
          auditError: getErrorMessage(auditError),
        });
      }
      log.error("Twilio message provider outcome is ambiguous", {
        userId,
        channel,
        reservationReference,
        destinationSuffix: phone.slice(-4),
        status: status || undefined,
        incidentRecorded,
        reservationRetained: true,
        doNotResend: true,
        error: getErrorMessage(error),
      });
      return {
        ok: false,
        configured: true,
        enabled: true,
        reason:
          "Delivery status is unknown because the carrier response was interrupted. The message may have been accepted. Do not resend it; contact support with the time and recipient.",
        code: SMS_PROVIDER_OUTCOME_AMBIGUOUS,
        channel,
        providerOutcomeAmbiguous: true,
        doNotResend: true,
      };
    }

    log.warn("Twilio message send failed", {
      userId,
      channel,
      segments,
      status: status || undefined,
      reservationRetained: false,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio rejected the message send request.",
      channel,
    };
  }

  // Twilio accepted the provider request. From this point onward, reporting a
  // send failure would invite a duplicate customer retry. Local history and
  // segment true-up failures therefore move to idempotent durable recovery.
  const actualSegments =
    channel === "sms" ? Math.max(1, Number(message.numSegments) || segments) : 1;
  const actualCost =
    channel === "sms" ? money(SMS_COST_PER_SEGMENT_USD * actualSegments) : requiredBalance;
  const local = await finalizeAcceptedTwilioMessage({
    userId,
    customerNumber: phone,
    body,
    sid: message.sid,
    channel,
    agentId: params.agentId,
    reservationReference,
    estimatedUsd: requiredBalance,
    actualUsd: actualCost,
    actualSegments,
  });

  return {
    ok: true,
    configured: true,
    enabled: true,
    sid: message.sid,
    status: message.status ?? null,
    to: message.to || payload.to,
    channel,
    reconciliationPending: local.reconciliationPending,
  };
}
