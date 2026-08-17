import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { mailboxScopedExternalId } from "./mailbox-identity";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export type PersistableInboxMessage = {
  accountId: string;
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

type PreparedInboxMessage = PersistableInboxMessage & {
  accountId: string;
  rawThreadId: string;
  scopedThreadId: string;
  scopedMessageId: string;
};

/**
 * Upsert provider inbox threads/messages for the current tenant transaction.
 * Callers must already be inside `tenantStore.run(userId)`.
 *
 * Provider ids are mailbox-scoped. The existing database indexes are
 * tenant-wide, so every persisted external id is first converted to a stable,
 * opaque account namespace. Ownership is then re-verified inside the same
 * transaction before any row is adopted or written.
 */
export async function persistMailboxInboxMessages(
  userId: string,
  messages: PersistableInboxMessage[],
): Promise<PersistMailboxInboxResult> {
  const preparedMessages = messages.flatMap<PreparedInboxMessage>((message) => {
    const accountId = message.accountId.trim().toLowerCase();
    const rawThreadId = message.threadId || message.messageId;
    if (!rawThreadId || !message.messageId) return [];
    return [
      {
        ...message,
        accountId,
        rawThreadId,
        scopedThreadId: mailboxScopedExternalId(accountId, rawThreadId),
        scopedMessageId: mailboxScopedExternalId(accountId, message.messageId),
      },
    ];
  });

  const latestThreadMessage = new Map<string, PreparedInboxMessage>();
  for (const message of preparedMessages) {
    const prior = latestThreadMessage.get(message.scopedThreadId);
    if (!prior || message.receivedAt.getTime() > prior.receivedAt.getTime()) {
      latestThreadMessage.set(message.scopedThreadId, message);
    }
  }

  const threadRows = Array.from(latestThreadMessage.entries()).map(([threadId, message]) => ({
    userId,
    accountId: message.accountId,
    threadId,
    subject: message.subject,
    customerEmail: message.from,
    summary: message.snippet,
    lastMessageAt: message.receivedAt,
  }));

  const messageRows = preparedMessages.map((message) => ({
    externalThreadId: message.scopedThreadId,
    userId,
    googleMessageId: message.scopedMessageId,
    role: "user" as const,
    content: message.snippet || "No preview was supplied by the connected mailbox.",
    createdAt: message.receivedAt,
  }));

  if (threadRows.length === 0 && messageRows.length === 0) {
    return { messagesSaved: 0, threadsUpserted: 0 };
  }

  let threadsUpserted = 0;
  const messagesSaved = await drizzle.transaction(async (tx) => {
    const ownedAccounts = await tx
      .select({ id: schema.emailAccounts.id })
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.userId, userId));
    const ownedAccountIds = new Set(ownedAccounts.map((account) => account.id.toLowerCase()));
    const requestedAccountIds = new Set(preparedMessages.map((message) => message.accountId));

    for (const accountId of requestedAccountIds) {
      if (!ownedAccountIds.has(accountId)) {
        throw new Error("Mailbox persistence rejected an account outside the tenant.");
      }
    }

    // Adopt a pre-account-identity row only when the tenant has exactly one
    // connected mailbox and that exact raw provider thread appears again. This
    // preserves single-mailbox history without guessing for zero/multi-mailbox
    // tenants. Any existing scoped counterpart or message collision leaves the
    // legacy row untouched for explicit reconciliation.
    if (
      ownedAccounts.length === 1 &&
      requestedAccountIds.size === 1 &&
      requestedAccountIds.has(ownedAccounts[0].id.toLowerCase())
    ) {
      const accountId = ownedAccounts[0].id.toLowerCase();
      const rawThreadIds = Array.from(
        new Set(preparedMessages.map((message) => message.rawThreadId)),
      );
      if (rawThreadIds.length > 0) {
        const legacyThreads = await tx
          .select({ id: schema.emailThreads.id, threadId: schema.emailThreads.threadId })
          .from(schema.emailThreads)
          .where(
            and(
              eq(schema.emailThreads.userId, userId),
              isNull(schema.emailThreads.accountId),
              inArray(schema.emailThreads.threadId, rawThreadIds),
            ),
          );
        const scopedThreadIds = rawThreadIds.map((rawThreadId) =>
          mailboxScopedExternalId(accountId, rawThreadId),
        );
        const existingScopedThreads = await tx
          .select({ threadId: schema.emailThreads.threadId })
          .from(schema.emailThreads)
          .where(
            and(
              eq(schema.emailThreads.userId, userId),
              inArray(schema.emailThreads.threadId, scopedThreadIds),
            ),
          );
        const existingScopedThreadIds = new Set(
          existingScopedThreads.flatMap((thread) => (thread.threadId ? [thread.threadId] : [])),
        );

        for (const legacyThread of legacyThreads) {
          if (!legacyThread.threadId) continue;
          const scopedThreadId = mailboxScopedExternalId(accountId, legacyThread.threadId);
          if (existingScopedThreadIds.has(scopedThreadId)) continue;

          const legacyMessages = await tx
            .select({
              id: schema.emailMessages.id,
              googleMessageId: schema.emailMessages.googleMessageId,
            })
            .from(schema.emailMessages)
            .where(
              and(
                eq(schema.emailMessages.userId, userId),
                eq(schema.emailMessages.threadId, legacyThread.id),
              ),
            );
          const messageRekeys = legacyMessages.flatMap((message) =>
            message.googleMessageId
              ? [
                  {
                    id: message.id,
                    scopedMessageId: mailboxScopedExternalId(accountId, message.googleMessageId),
                  },
                ]
              : [],
          );
          const scopedMessageIds = messageRekeys.map((message) => message.scopedMessageId);
          if (scopedMessageIds.length > 0) {
            const [messageConflict] = await tx
              .select({ id: schema.emailMessages.id })
              .from(schema.emailMessages)
              .where(
                and(
                  eq(schema.emailMessages.userId, userId),
                  inArray(schema.emailMessages.googleMessageId, scopedMessageIds),
                ),
              )
              .limit(1);
            if (messageConflict) continue;
          }

          const adopted = await tx
            .update(schema.emailThreads)
            .set({ accountId, threadId: scopedThreadId })
            .where(
              and(
                eq(schema.emailThreads.id, legacyThread.id),
                eq(schema.emailThreads.userId, userId),
                isNull(schema.emailThreads.accountId),
                eq(schema.emailThreads.threadId, legacyThread.threadId),
              ),
            )
            .returning({ id: schema.emailThreads.id });
          if (adopted.length !== 1) continue;

          for (const message of messageRekeys) {
            await tx
              .update(schema.emailMessages)
              .set({ googleMessageId: message.scopedMessageId })
              .where(
                and(
                  eq(schema.emailMessages.id, message.id),
                  eq(schema.emailMessages.userId, userId),
                  eq(schema.emailMessages.threadId, legacyThread.id),
                ),
              );
          }
          existingScopedThreadIds.add(scopedThreadId);
        }
      }
    }

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
          setWhere: sql`
            ${schema.emailThreads.userId} = ${userId}
            and ${schema.emailThreads.accountId} = excluded.account_id
          `,
        })
        .returning({ id: schema.emailThreads.id, threadId: schema.emailThreads.threadId });

      if (threads.length !== threadRows.length) {
        throw new Error("Mailbox thread identity conflict blocked persistence.");
      }
      threadsUpserted = threads.length;
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

  return { messagesSaved, threadsUpserted };
}
