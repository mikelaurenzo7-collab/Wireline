import { recordTenantEmailSuppression } from "./email-compliance";
import { persistMailboxInboxMessages } from "./mailbox-inbox-persist";
import { dispatchWebhook } from "./webhook-helpers";
import { runInBackground } from "./background-work";
import { touchNavCounts } from "./nav-counts-invalidate";
import { log } from "./server-context";

const MAX_EVENT_TYPE_LENGTH = 96;
const MAX_TEXT_LENGTH = 8_000;
const MAX_HTML_INPUT_LENGTH = 1_000_000;

export type AgentMailWebhookProcessResult = {
  eventType: string;
  messagesSaved: number;
  suppressed: boolean;
  ignored: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseDate(value: unknown): Date {
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return new Date();
}

function allAddresses(value: unknown): string[] {
  const candidates: string[] = [];
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      const address = boundedText(candidate, 320);
      if (address) candidates.push(address);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    const record = asRecord(candidate);
    if (!record) return;
    const address = boundedText(record.address ?? record.email ?? record.email_address, 320);
    if (address) candidates.push(address);
  };
  visit(value);

  const seen = new Set<string>();
  return candidates.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstAddress(value: unknown): string | null {
  return allAddresses(value)[0] ?? null;
}

function plainTextFromHtml(value: unknown): string | null {
  const html = boundedText(value, MAX_HTML_INPUT_LENGTH);
  if (!html) return null;
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
}

export function agentMailSuppressionReason(
  eventType: string,
): "agentmail_bounced" | "agentmail_complained" | null {
  if (eventType === "message.bounced") return "agentmail_bounced";
  if (eventType === "message.complained") return "agentmail_complained";
  return null;
}

export function parseAgentMailWebhookEvent(raw: unknown): {
  eventType: string;
  eventId: string | null;
  messageId: string | null;
  threadId: string | null;
  from: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  suppressionRecipients: string[];
  bounceRecipient: string | null;
  rejectionReason: string | null;
} {
  const payload = asRecord(raw);
  if (!payload) throw new Error("AgentMail webhook body is not valid JSON");
  const eventType = boundedText(payload.event_type ?? payload.eventType, MAX_EVENT_TYPE_LENGTH);
  if (!eventType) throw new Error("event type is missing");

  const message = asRecord(payload.message) ?? {};
  const bounce = asRecord(payload.bounce) ?? {};
  const complaint = asRecord(payload.complaint) ?? {};
  const reject = asRecord(payload.reject) ?? {};
  const send = asRecord(payload.send) ?? {};
  const delivery = asRecord(payload.delivery) ?? {};
  const eventData =
    eventType === "message.bounced"
      ? bounce
      : eventType === "message.complained"
        ? complaint
        : eventType === "message.rejected"
          ? reject
          : eventType === "message.sent"
            ? send
            : eventType === "message.delivered"
              ? delivery
              : message;

  const snippet =
    boundedText(message.extracted_text ?? message.extractedText, MAX_TEXT_LENGTH) ||
    boundedText(message.preview, MAX_TEXT_LENGTH) ||
    boundedText(message.text, MAX_TEXT_LENGTH) ||
    plainTextFromHtml(message.html) ||
    boundedText(message.subject, 500) ||
    "";

  const eventRecipients =
    eventType === "message.bounced"
      ? allAddresses(bounce.recipients)
      : eventType === "message.complained"
        ? allAddresses(complaint.recipients)
        : [];
  const suppressionRecipients =
    eventRecipients.length > 0
      ? eventRecipients
      : agentMailSuppressionReason(eventType)
        ? allAddresses(message.to ?? payload.to)
        : [];

  return {
    eventType,
    eventId: boundedText(payload.event_id ?? payload.eventId, 256),
    messageId: boundedText(
      message.message_id ?? message.messageId ?? eventData.message_id ?? eventData.messageId,
      256,
    ),
    threadId: boundedText(
      message.thread_id ?? message.threadId ?? eventData.thread_id ?? eventData.threadId,
      256,
    ),
    from: firstAddress(message.from_) ?? firstAddress(message.from),
    subject: boundedText(message.subject, 500) || "",
    snippet,
    receivedAt: parseDate(
      message.timestamp ??
        message.created_at ??
        message.createdAt ??
        eventData.timestamp ??
        payload.created_at,
    ),
    suppressionRecipients,
    bounceRecipient: suppressionRecipients[0] ?? null,
    rejectionReason: boundedText(reject.reason, 1_000),
  };
}

export async function processVerifiedAgentMailWebhook(
  userId: string,
  rawBody: Buffer,
): Promise<AgentMailWebhookProcessResult> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    throw new Error("not valid JSON");
  }

  const event = parseAgentMailWebhookEvent(parsedJson);
  if (event.eventType === "message.received") {
    if (!event.messageId || !event.from) {
      throw new Error("message.received is missing message id or sender");
    }
    const persisted = await persistMailboxInboxMessages(userId, [
      {
        messageId: event.messageId,
        threadId: event.threadId || event.messageId,
        from: event.from,
        subject: event.subject,
        snippet: event.snippet || event.subject || "Inbound AgentMail message",
        receivedAt: event.receivedAt,
      },
    ]);
    if (persisted.threadsUpserted > 0 || persisted.messagesSaved > 0) {
      touchNavCounts(userId);
    }
    if (persisted.messagesSaved > 0) {
      runInBackground("email.received webhook dispatch", () =>
        dispatchWebhook(userId, "email.received", {
          messages_saved: persisted.messagesSaved,
          threads_upserted: persisted.threadsUpserted,
          providers: ["agentmail"],
          at: new Date().toISOString(),
        }),
      );
    }
    return {
      eventType: event.eventType,
      messagesSaved: persisted.messagesSaved,
      suppressed: false,
      ignored: false,
    };
  }

  const suppressionReason = agentMailSuppressionReason(event.eventType);
  if (suppressionReason) {
    const recipients = event.suppressionRecipients.filter((recipient) => recipient.includes("@"));
    if (recipients.length === 0) {
      throw new Error(`${event.eventType} has no valid recipient`);
    }
    await Promise.all(
      recipients.map((recipient) =>
        recordTenantEmailSuppression(userId, recipient, suppressionReason),
      ),
    );
    log.warn("[agentmail-webhook] tenant recipients suppressed", {
      eventType: event.eventType,
      reason: suppressionReason,
      count: recipients.length,
    });
    return {
      eventType: event.eventType,
      messagesSaved: 0,
      suppressed: true,
      ignored: false,
    };
  }

  if (event.eventType === "message.rejected") {
    log.warn("[agentmail-webhook] outbound message rejected", {
      reason: event.rejectionReason || "unknown",
    });
  }

  return {
    eventType: event.eventType,
    messagesSaved: 0,
    suppressed: false,
    ignored: true,
  };
}
