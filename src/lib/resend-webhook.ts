import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import { normalizeEmail } from "./email-compliance";
import {
  recordProviderDeliverySuppression,
  type ProviderDeliverySuppressionReason,
} from "./email-delivery-suppression";
import { resendWebhookEvents } from "../db/resend-webhook-schema";

const RESEND_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const MAX_RECIPIENTS_PER_EVENT = 100;
const MAX_HEADER_LENGTH = 2048;
const MAX_EVENT_TYPE_LENGTH = 96;
const MAX_PROVIDER_ID_LENGTH = 256;

type HeaderValue = string | string[] | undefined;

export type ResendWebhookHeaders = {
  "svix-id"?: HeaderValue;
  "svix-timestamp"?: HeaderValue;
  "svix-signature"?: HeaderValue;
};

export type ResendWebhookVerification =
  | { ok: true; webhookId: string; timestamp: number }
  | {
      ok: false;
      code:
        | "missing_secret"
        | "missing_headers"
        | "malformed_headers"
        | "stale_timestamp"
        | "invalid_signature";
    };

function firstHeader(value: HeaderValue): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function decodeSigningSecret(secret: string): Buffer | null {
  const encoded = secret.trim().replace(/^whsec_/, "");
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64");
    return decoded.length >= 16 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Verify Resend's Standard Webhooks/Svix envelope against the untouched body.
 * No JSON parsing or external work is allowed before this returns `ok: true`.
 */
export function verifyResendWebhookSignature(
  rawBody: Buffer,
  headers: ResendWebhookHeaders,
  signingSecret = process.env.RESEND_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): ResendWebhookVerification {
  if (!signingSecret?.trim()) return { ok: false, code: "missing_secret" };

  const webhookId = firstHeader(headers["svix-id"]);
  const timestampRaw = firstHeader(headers["svix-timestamp"]);
  const signatureRaw = firstHeader(headers["svix-signature"]);
  if (!webhookId || !timestampRaw || !signatureRaw) {
    return { ok: false, code: "missing_headers" };
  }
  if (
    webhookId.length > MAX_HEADER_LENGTH ||
    timestampRaw.length > 32 ||
    signatureRaw.length > MAX_HEADER_LENGTH
  ) {
    return { ok: false, code: "malformed_headers" };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, code: "malformed_headers" };
  }
  if (Math.abs(nowSeconds - timestamp) > RESEND_WEBHOOK_MAX_AGE_SECONDS) {
    return { ok: false, code: "stale_timestamp" };
  }

  const key = decodeSigningSecret(signingSecret);
  if (!key) return { ok: false, code: "missing_secret" };

  const signed = Buffer.concat([
    Buffer.from(`${webhookId}.${timestamp}.`, "utf8"),
    rawBody,
  ]);
  const expected = createHmac("sha256", key).update(signed).digest();
  const candidates = signatureRaw
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [version, encoded] = entry.split(",", 2);
      return version === "v1" && encoded ? [encoded] : [];
    });

  for (const encoded of candidates) {
    let candidate: Buffer;
    try {
      candidate = Buffer.from(encoded, "base64");
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true, webhookId, timestamp };
    }
  }

  return { ok: false, code: "invalid_signature" };
}

type ResendEventEnvelope = {
  type?: unknown;
  created_at?: unknown;
  data?: unknown;
};

type ResendEventData = Record<string, unknown> & {
  email_id?: unknown;
  created_at?: unknown;
  to?: unknown;
  recipient?: unknown;
};

export type ResendWebhookProcessResult = {
  duplicate: boolean;
  eventType: string;
  suppressionCount: number;
  recipientCount: number;
};

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseRecipients(data: ResendEventData): string[] {
  const raw: unknown[] = [];
  if (Array.isArray(data.to)) raw.push(...data.to);
  else if (typeof data.to === "string") raw.push(data.to);
  if (typeof data.recipient === "string") raw.push(data.recipient);

  const unique = new Set<string>();
  for (const candidate of raw) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeEmail(candidate);
    if (!normalized || !normalized.includes("@") || normalized.length > 320) continue;
    unique.add(normalized);
    if (unique.size > MAX_RECIPIENTS_PER_EVENT) {
      throw new Error("Resend webhook recipient count exceeds safety limit");
    }
  }
  return [...unique];
}

function permanentReason(eventType: string): ProviderDeliverySuppressionReason | null {
  switch (eventType) {
    case "email.bounced":
      return "resend_bounced";
    case "email.complained":
      return "resend_complained";
    case "email.suppressed":
      return "resend_suppressed";
    default:
      return null;
  }
}

function detailCodeFor(eventType: string, permanent: boolean): string {
  if (permanent) return "permanent_recipient_risk";
  if (eventType === "email.delivery_delayed") return "temporary_delivery_delay";
  if (eventType === "email.failed") return "provider_delivery_failure";
  if (eventType.startsWith("email.")) return "observed_email_event";
  return "ignored_unknown_event";
}

function eventOccurredAt(event: ResendEventEnvelope, data: ResendEventData): Date | null {
  const raw = data.created_at ?? event.created_at;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = new Date(raw);
  return Number.isFinite(value.getTime()) ? value : null;
}

/**
 * Process one already-authenticated Resend event. Payload content is reduced to
 * operational metadata before persistence; subject/body/html/raw recipients are
 * never written to the webhook receipt ledger.
 */
export async function processVerifiedResendWebhook(
  rawBody: Buffer,
  webhookId: string,
): Promise<ResendWebhookProcessResult> {
  const [existing] = await drizzle
    .select({ eventType: resendWebhookEvents.eventType })
    .from(resendWebhookEvents)
    .where(eq(resendWebhookEvents.webhookId, webhookId))
    .limit(1);
  if (existing) {
    return {
      duplicate: true,
      eventType: existing.eventType,
      suppressionCount: 0,
      recipientCount: 0,
    };
  }

  let event: ResendEventEnvelope;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as ResendEventEnvelope;
  } catch {
    throw new Error("Resend webhook body is not valid JSON");
  }

  const eventType = boundedText(event.type, MAX_EVENT_TYPE_LENGTH);
  if (!eventType) throw new Error("Resend webhook event type is missing");
  const data = event.data && typeof event.data === "object" ? (event.data as ResendEventData) : {};
  const occurredAt = eventOccurredAt(event, data);
  if (!occurredAt) throw new Error("Resend webhook event timestamp is missing or invalid");

  const emailId = boundedText(data.email_id, MAX_PROVIDER_ID_LENGTH);
  const recipients = parseRecipients(data);
  const reason = permanentReason(eventType);
  let suppressionCount = 0;

  if (reason) {
    if (recipients.length === 0) {
      throw new Error(`Resend ${eventType} webhook has no valid recipient`);
    }
    for (const recipient of recipients) {
      await recordProviderDeliverySuppression(recipient, reason);
      suppressionCount += 1;
    }
  }

  await drizzle
    .insert(resendWebhookEvents)
    .values({
      webhookId,
      eventType,
      emailId,
      occurredAt,
      recipientCount: recipients.length,
      suppressionCount,
      detailCode: detailCodeFor(eventType, Boolean(reason)),
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: resendWebhookEvents.webhookId });

  log.info("[resend-webhook] delivery feedback processed", {
    eventType,
    emailId,
    recipientCount: recipients.length,
    suppressionCount,
    permanentRecipientRisk: Boolean(reason),
  });

  return {
    duplicate: false,
    eventType,
    suppressionCount,
    recipientCount: recipients.length,
  };
}
