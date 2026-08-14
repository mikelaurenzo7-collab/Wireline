import { eq } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import { normalizeEmail } from "./email-compliance";
import { reportError } from "./error-reporter";
import {
  recordProviderDeliverySuppression,
  type ProviderDeliverySuppressionReason,
} from "./email-delivery-suppression";
import { resendOperationalSeverity } from "./resend-webhook-observability";
import { resendWebhookEvents } from "../db/resend-webhook-schema";
export {
  RESEND_WEBHOOK_MAX_AGE_SECONDS,
  verifyResendWebhookSignature,
  type ResendWebhookHeaders,
  type ResendWebhookVerification,
} from "./resend-webhook-signature";
export {
  resendOperationalSeverity,
  type ResendOperationalSeverity,
} from "./resend-webhook-observability";

const MAX_RECIPIENTS_PER_EVENT = 100;
const MAX_EVENT_TYPE_LENGTH = 96;
const MAX_PROVIDER_ID_LENGTH = 256;

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

export function resendPermanentSuppressionReason(
  eventType: string,
): ProviderDeliverySuppressionReason | null {
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

export function resendEventDetailCode(eventType: string, permanent: boolean): string {
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
  const recipientCount = recipients.length;
  const reason = resendPermanentSuppressionReason(eventType);
  const detailCode = resendEventDetailCode(eventType, Boolean(reason));
  let suppressionCount = 0;

  if (reason) {
    if (recipientCount === 0) {
      throw new Error(`Resend ${eventType} webhook has no valid recipient`);
    }
    for (const recipient of recipients) {
      await recordProviderDeliverySuppression(recipient, reason);
      suppressionCount += 1;
    }
  }

  const [inserted] = await drizzle
    .insert(resendWebhookEvents)
    .values({
      webhookId,
      eventType,
      emailId,
      occurredAt,
      recipientCount,
      suppressionCount,
      detailCode,
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: resendWebhookEvents.webhookId })
    .returning({ webhookId: resendWebhookEvents.webhookId });

  // A concurrent delivery can pass the optimistic read above. Only the
  // request that wins the durable receipt claim emits operational evidence;
  // suppression writes are idempotent and safe if both reached that stage.
  if (!inserted) {
    return {
      duplicate: true,
      eventType,
      suppressionCount: 0,
      recipientCount: 0,
    };
  }

  const observabilityContext = {
    eventType,
    emailId,
    recipientCount,
    suppressionCount,
    detailCode,
    permanentRecipientRisk: Boolean(reason),
  };
  const operationalSeverity = resendOperationalSeverity(eventType);

  if (operationalSeverity === "error") {
    log.error("[resend-webhook] provider delivery failed", observabilityContext);
    reportError(new Error("Resend email delivery failed after provider acceptance"), {
      tags: {
        surface: "resend_webhook",
        provider: "resend",
        outcome: "delivery_failed",
      },
      provider_email_id: emailId,
      recipient_count: recipientCount,
      detail_code: detailCode,
    });
  } else if (operationalSeverity === "warning") {
    log.warn("[resend-webhook] provider delivery delayed", observabilityContext);
  } else {
    log.info("[resend-webhook] delivery feedback processed", observabilityContext);
  }

  return {
    duplicate: false,
    eventType,
    suppressionCount,
    recipientCount,
  };
}
