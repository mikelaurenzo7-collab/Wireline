/**
 * Delivery truth for inbox thread replies, reduced from the append-only
 * reply ledger written by src/lib/email-thread-reply.ts. Pure and dependency
 * free so the reduction can be unit tested without a database.
 *
 * The ledger is the only send record for replies composed in the Inbox:
 * a "sent" row means the mailbox provider accepted the reply. Nothing here
 * claims inbox delivery, which BotBound does not observe for these sends.
 */

export type EmailReplyDeliveryStatus = "sent" | "failed" | "unresolved" | "acknowledged";

export type EmailThreadDelivery = {
  /** emailMessages row ids (as strings) whose reply send the ledger confirms. */
  sentMessageIds: string[];
  /** State of the newest ledger row for the thread, across all reply keys. */
  latestStatus: EmailReplyDeliveryStatus | null;
  /** ISO timestamp recorded on that newest ledger row, when present. */
  latestAt: string | null;
};

export const EMPTY_EMAIL_THREAD_DELIVERY: EmailThreadDelivery = {
  sentMessageIds: [],
  latestStatus: null,
  latestAt: null,
};

type LedgerRow = {
  resourceId: string;
  metadata: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deliveryStatus(raw: unknown): EmailReplyDeliveryStatus | null {
  switch (raw) {
    case "sent":
      return "sent";
    case "failed":
      return "failed";
    case "processing":
      return "unresolved";
    case "owner_acknowledged":
      return "acknowledged";
    default:
      return null;
  }
}

function sentMessageId(metadata: Record<string, unknown>): string | null {
  const result = metadataRecord(metadata.result);
  const message = metadataRecord(result.message);
  return typeof message.id === "string" && message.id ? message.id : null;
}

/**
 * Reduce ledger rows for one thread. Rows must arrive newest first (by audit
 * id, descending): the first row seen for a reply key is that key's current
 * state, and the first row overall is the thread's latest send state. A key
 * whose send was superseded by a newer unresolved row contributes no sent
 * message, so a stale confirmation can never resurrect a "sent" label.
 */
export function summarizeEmailReplyLedger(rows: readonly LedgerRow[]): EmailThreadDelivery {
  const seenKeys = new Set<string>();
  const sentMessageIds: string[] = [];
  let latestStatus: EmailReplyDeliveryStatus | null = null;
  let latestAt: string | null = null;

  rows.forEach((row, index) => {
    const metadata = metadataRecord(row.metadata);
    const status = deliveryStatus(metadata.status);
    if (index === 0) {
      latestStatus = status;
      latestAt = typeof metadata.at === "string" ? metadata.at : null;
    }
    if (!row.resourceId || seenKeys.has(row.resourceId)) return;
    seenKeys.add(row.resourceId);
    if (status === "sent") {
      const messageId = sentMessageId(metadata);
      if (messageId) sentMessageIds.push(messageId);
    }
  });

  return { sentMessageIds, latestStatus, latestAt };
}
