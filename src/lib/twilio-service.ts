/* eslint-disable @typescript-eslint/no-explicit-any -- Twilio API responses are vendor-defined. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { resolveAgentSmsFromNumber } from "./agent-phone-lines";
import {
  refundRuntimeUsage,
  reserveRuntimeUsage,
} from "./runtime-usage-billing";
import { SMS_COST_PER_SEGMENT_USD } from "./sms-billing";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import {
  getTwilioClient,
  isTwilioConfigured,
  lookupTenantPhoneNumber,
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

function appUrl(): string {
  return (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
}

function boundedValidityPeriod(): number {
  const configured = Number(process.env.TWILIO_MESSAGE_VALIDITY_SECONDS || 3600);
  if (!Number.isFinite(configured)) return 3600;
  return Math.max(60, Math.min(36_000, Math.floor(configured)));
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
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
  const [row] = await drizzle
    .select({ phone: schema.dncList.phone })
    .from(schema.dncList)
    .where(and(eq(schema.dncList.userId, userId), eq(schema.dncList.phone, phone)))
    .limit(1);
  return !!row;
}

function whatsappCustomerRate(): number | null {
  if (process.env.WIRELINE_WHATSAPP_PRIVATE_BETA !== "true") return null;
  const rate = Number(process.env.WIRELINE_WHATSAPP_CUSTOMER_RATE_USD || "");
  return Number.isFinite(rate) && rate > 0 ? money(rate) : null;
}

async function persistOutbound(input: {
  userId: string;
  customerNumber: string;
  body: string;
  sid: string;
  agentId?: string;
}) {
  try {
    const current = await existingThread(input.userId, input.customerNumber);
    let threadId = current?.id;
    if (current) {
      await drizzle
        .update(schema.smsThreads)
        .set({
          lastMessageAt: new Date(),
          status: "open",
          ...(input.agentId && !current.agentId ? { agentId: input.agentId } : {}),
        })
        .where(eq(schema.smsThreads.id, current.id));
    } else {
      const [created] = await drizzle
        .insert(schema.smsThreads)
        .values({
          userId: input.userId,
          customerNumber: input.customerNumber,
          agentId: input.agentId || null,
          unreadCount: 0,
        })
        .returning({ id: schema.smsThreads.id });
      threadId = created?.id;
    }
    if (threadId) {
      await drizzle.insert(schema.smsMessages).values({
        userId: input.userId,
        threadId,
        direction: "out",
        body: input.body,
        twilioSid: input.sid,
        agentId: input.agentId || null,
      });
    }
  } catch (error) {
    log.warn("Twilio outbound thread persistence failed", { error: getErrorMessage(error) });
  }
}

async function adjustMessagingReservation(input: {
  userId: string;
  referenceId: string;
  estimatedUsd: number;
  actualUsd: number;
  channel: TwilioMessageChannel;
  sid: string;
  actualSegments: number;
}): Promise<void> {
  const difference = money(input.actualUsd - input.estimatedUsd);
  if (difference === 0) return;
  const adjustmentReference = `${input.referenceId}:actual`;

  if (difference < 0) {
    await refundRuntimeUsage({
      userId: input.userId,
      amountUsd: Math.abs(difference),
      referenceId: adjustmentReference,
      reason: "Twilio segment estimate adjustment",
      provider: "twilio",
      source: "twilio",
      metadata: {
        channel: input.channel,
        message_sid: input.sid,
        actual_segments: input.actualSegments,
        estimated_usd: input.estimatedUsd,
        actual_usd: input.actualUsd,
      },
    });
    return;
  }

  const adjustment = await reserveRuntimeUsage({
    userId: input.userId,
    amountUsd: difference,
    referenceId: adjustmentReference,
    reason: "Twilio segment count adjustment",
    provider: "twilio",
    source: "twilio",
    metadata: {
      channel: input.channel,
      message_sid: input.sid,
      actual_segments: input.actualSegments,
      estimated_usd: input.estimatedUsd,
      actual_usd: input.actualUsd,
    },
  });
  if (!adjustment.reserved) {
    log.error("Twilio message exceeded its prepaid reservation", {
      userId: input.userId,
      sid: input.sid,
      channel: input.channel,
      estimatedUsd: input.estimatedUsd,
      actualUsd: input.actualUsd,
      missingUsd: difference,
    });
  }
}

/**
 * Profit-safe outbound SMS/WhatsApp boundary.
 * - honors DNC for both channels
 * - estimates and atomically reserves the complete customer charge before Twilio
 * - preserves agent-specific sender identity without sending both From and MessagingServiceSid
 * - validates new SMS contacts once instead of paying Lookup on every reply
 * - attaches a signed delivery-status callback and stale-message validity period
 * - keeps WhatsApp private-beta until a configured customer rate covers variable fees
 */
export async function sendTenantMessage(
  userId: string,
  params: { to: string; body: string; channel?: TwilioMessageChannel; agentId?: string },
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

  const payload: Record<string, any> = {
    to: address(phone, channel),
    body,
    statusCallback: `${appUrl()}/api/twilio-webhook/message-status`,
    validityPeriod: boundedValidityPeriod(),
  };
  if (channel === "whatsapp") {
    payload.from = address(cleanPhone(sender), channel);
  } else if (agentSender) {
    payload.from = cleanPhone(agentSender);
  } else if (settings.messagingServiceSid) {
    payload.messagingServiceSid = settings.messagingServiceSid;
  } else if (sender) {
    payload.from = cleanPhone(sender);
  }

  const reservationReference = `twilio_message:${channel}:${randomUUID()}`;
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

  try {
    const message = await client.messages.create(payload);
    if (channel === "sms") {
      const actualSegments = Math.max(1, Number(message.numSegments) || segments);
      const actualCost = money(SMS_COST_PER_SEGMENT_USD * actualSegments);
      await adjustMessagingReservation({
        userId,
        referenceId: reservationReference,
        estimatedUsd: requiredBalance,
        actualUsd: actualCost,
        channel,
        sid: message.sid,
        actualSegments,
      });
    }

    await persistOutbound({
      userId,
      customerNumber: phone,
      body,
      sid: message.sid,
      agentId: params.agentId,
    });

    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || payload.to,
      channel,
    };
  } catch (error) {
    const status = Number((error as { status?: number } | null)?.status || 0);
    // A Twilio 4xx means the provider definitively rejected the request. Network
    // and 5xx errors are ambiguous: the message may have been accepted before the
    // response was lost, so retain the reservation for reconciliation instead of
    // refunding and potentially funding duplicate carrier spend.
    if (status >= 400 && status < 500 && !reservation.alreadyReserved) {
      await refundRuntimeUsage({
        userId,
        amountUsd: requiredBalance,
        referenceId: reservationReference,
        reason: "Twilio rejected the outbound message",
        provider: "twilio",
        source: "twilio",
        metadata: { channel, status, estimated_segments: segments },
      }).catch((refundError) =>
        log.error("Twilio rejection refund failed", {
          userId,
          channel,
          error: getErrorMessage(refundError),
        }),
      );
    }
    log.warn("Twilio message send failed", {
      userId,
      channel,
      segments,
      status: status || undefined,
      reservationRetained: !(status >= 400 && status < 500),
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
}
