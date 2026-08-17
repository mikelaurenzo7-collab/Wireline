import { recordTenantEmailSuppression } from "./email-compliance";
import { persistMailboxInboxMessages } from "./mailbox-inbox-persist";
import { dispatchWebhook } from "./webhook-helpers";
import { runInBackground } from "./background-work";
import { touchNavCounts } from "./nav-counts-invalidate";
import { log } from "./server-context";

const MAX_EVENT_TYPE_LENGTH = 96;
const MAX_TEXT_LENGTH = 8_000;

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

function firstAddress(value: unknown): string | null {
  if (typeof value === "string") return boundedText(value, 320);
  if (Array.isArray(value) && typeof value[0] === "string") return boundedText(value[0], 320);
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
  bounceRecipient: string | null;
} {
  const payload = asRecord(raw);
  if (!payload) throw new Error("AgentMail webhook body is not valid JSON");
  const eventType = boundedText(
    payload.event_type ?? payload.eventType ?? payload.type,
    MAX_EVENT_TYPE_LENGTH,
  );
  if (!eventType) throw new Error("event type is missing");
  const message = asRecord(payload.message) ?? {};
  const snippet =
    boundedText(message.extracted_text ?? message.extractedText, MAX_TEXT_LENGTH) ||
    boundedText(message.text, MAX_TEXT_LENGTH) ||
    boundedText(message.subject, 500) ||
    "";
  return {
    eventType,
    eventId: boundedText(payload.event_id ?? payload.eventId, 256),
    messageId: boundedText(message.message_id ?? message.messageId, 256),
    threadId: boundedText(message.thread_id ?? message.threadId, 256),
    from: firstAddress(message.from),
    subject: boundedText(message.subject, 500) || "",
    snippet,
    receivedAt: parseDate(message.created_at ?? message.createdAt ?? payload.created_at),
    bounceRecipient: firstAddress(message.to) ?? firstAddress(payload.to),
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

  if (
    event.eventType === "message.bounced" ||
    event.eventType === "message.complained" ||
    event.eventType === "message.rejected"
  ) {
    if (!event.bounceRecipient || !event.bounceRecipient.includes("@")) {
      throw new Error(`${event.eventType} has no valid recipient`);
    }
    const reason =
      event.eventType === "message.complained" ? "agentmail_complained" : "agentmail_bounced";
    await recordTenantEmailSuppression(userId, event.bounceRecipient, reason);
    log.warn("[agentmail-webhook] tenant recipient suppressed", {
      eventType: event.eventType,
      reason,
    });
    return {
      eventType: event.eventType,
      messagesSaved: 0,
      suppressed: true,
      ignored: false,
    };
  }

  return {
    eventType: event.eventType,
    messagesSaved: 0,
    suppressed: false,
    ignored: true,
  };
}
