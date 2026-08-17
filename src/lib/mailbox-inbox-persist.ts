import { sql } from "drizzle-orm";

import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export type PersistableInboxMessage = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
};

export type PersistMailboxInboxResult = {
  messagesSaved: number;
  threadsUpserted: number;
};

/**
 * Upsert provider inbox threads/messages for the current tenant transaction.
 * Callers must already be inside `tenantStore.run(userId)`.
 */
export async function persistMailboxInboxMessages(
  userId: string,
  messages: PersistableInboxMessage[],
): Promise<PersistMailboxInboxResult> {
  const latestThreadMessage = new Map<string, PersistableInboxMessage>();
  for (const message of messages) {
    const externalThreadId = message.threadId || message.messageId;
    if (!externalThreadId) continue;
    const prior = latestThreadMessage.get(externalThreadId);
    if (!prior || message.receivedAt.getTime() > prior.receivedAt.getTime()) {
      latestThreadMessage.set(externalThreadId, message);
    }
  }

  const threadRows = Array.from(latestThreadMessage.entries()).map(([threadId, message]) => ({
    userId,
    threadId,
    subject: message.subject,
    customerEmail: message.from,
    summary: message.snippet,
    lastMessageAt: message.receivedAt,
  }));

  const messageRows = messages.flatMap((message) => {
    const externalThreadId = message.threadId || message.messageId;
    if (!externalThreadId || !message.messageId) return [];
    return [
      {
        externalThreadId,
        userId,
        googleMessageId: message.messageId,
        role: "user" as const,
        content: message.snippet || "No preview was supplied by the connected mailbox.",
        createdAt: message.receivedAt,
      },
    ];
  });

  if (threadRows.length === 0 && messageRows.length === 0) {
    return { messagesSaved: 0, threadsUpserted: 0 };
  }

  const messagesSaved = await drizzle.transaction(async (tx) => {
    const threadDbIdByExternalId = new Map<string, string>();
    if (threadRows.length > 0) {
      // Provider retries and manual syncs can arrive out of order. Never let an
      // older message overwrite the latest subject, sender, summary, or clock.
      const incomingThreadIsNotOlder = sql<boolean>`
        ${schema.emailThreads.lastMessageAt} is null
        or excluded.last_message_at >= ${schema.emailThreads.lastMessageAt}
      `;
      const threads = await tx
        .insert(schema.emailThreads)
        .values(threadRows)
        .onConflictDoUpdate({
          target: [schema.emailThreads.userId, schema.emailThreads.threadId],
          set: {
            subject: sql`case when ${incomingThreadIsNotOlder} then excluded.subject else ${schema.emailThreads.subject} end`,
            customerEmail: sql`case when ${incomingThreadIsNotOlder} then excluded.customer_email else ${schema.emailThreads.customerEmail} end`,
            summary: sql`case when ${incomingThreadIsNotOlder} then excluded.summary else ${schema.emailThreads.summary} end`,
            lastMessageAt: sql`case when ${incomingThreadIsNotOlder} then excluded.last_message_at else ${schema.emailThreads.lastMessageAt} end`,
          },
          setWhere: sql`${schema.emailThreads.userId} = ${userId}`,
        })
        .returning({ id: schema.emailThreads.id, threadId: schema.emailThreads.threadId });

      for (const thread of threads) {
        if (thread.threadId) threadDbIdByExternalId.set(thread.threadId, thread.id);
      }
    }

    const persistedMessageRows = messageRows.flatMap((row) => {
      const threadDbId = threadDbIdByExternalId.get(row.externalThreadId);
      if (!threadDbId) return [];
      return [
        {
          userId: row.userId,
          threadId: threadDbId,
          googleMessageId: row.googleMessageId,
          role: row.role,
          content: row.content,
          createdAt: row.createdAt,
        },
      ];
    });

    if (persistedMessageRows.length === 0) return 0;

    const saved = await tx
      .insert(schema.emailMessages)
      .values(persistedMessageRows)
      .onConflictDoNothing({
        target: [schema.emailMessages.userId, schema.emailMessages.googleMessageId],
      })
      .returning({ id: schema.emailMessages.id });
    return saved.length;
  });

  return { messagesSaved, threadsUpserted: threadRows.length };
}
