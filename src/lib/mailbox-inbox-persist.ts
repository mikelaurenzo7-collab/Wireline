import { and, eq, inArray, sql } from "drizzle-orm";

import { mailboxScopedExternalId } from "./mailbox-identity";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export type PersistableInboxMessage = {
  accountId: string;
  provider: string;
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
  provider: string;
  scopedThreadId: string;
  scopedMessageId: string;
};

/**
 * Upsert provider inbox threads/messages for the current tenant transaction.
 * Callers must already be inside `tenantStore.run(userId)`.
 *
 * Provider ids are mailbox/provider-scoped. The existing database indexes are
 * tenant-wide, so every persisted external id is first converted to a stable,
 * opaque namespace. The source account row is locked and its current provider
 * re-verified in the same transaction before any row is written. Legacy rows
 * with no account/provider provenance remain untouched rather than guessed.
 */
export async function persistMailboxInboxMessages(
  userId: string,
  messages: PersistableInboxMessage[],
): Promise<PersistMailboxInboxResult> {
  const preparedMessages = messages.flatMap<PreparedInboxMessage>((message) => {
    const accountId = message.accountId.trim().toLowerCase();
    const provider = message.provider.trim().toLowerCase();
    const rawThreadId = message.threadId || message.messageId;
    if (!rawThreadId || !message.messageId) return [];
    return [
      {
        ...message,
        accountId,
        provider,
        scopedThreadId: mailboxScopedExternalId(accountId, provider, rawThreadId),
        scopedMessageId: mailboxScopedExternalId(accountId, provider, message.messageId),
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

  const requestedSourceByAccountId = new Map<string, string>();
  for (const message of preparedMessages) {
    const priorProvider = requestedSourceByAccountId.get(message.accountId);
    if (priorProvider && priorProvider !== message.provider) {
      throw new Error("Mailbox persistence received conflicting providers for one account.");
    }
    requestedSourceByAccountId.set(message.accountId, message.provider);
  }
  const requestedAccountIds = Array.from(requestedSourceByAccountId.keys());

  let threadsUpserted = 0;
  const messagesSaved = await drizzle.transaction(async (tx) => {
    // Lock each source mailbox so a reconnect/provider switch or disconnect
    // cannot race between validation and persistence. A stale in-flight fetch
    // then either commits before the account mutation or observes the new
    // provider/missing row and fails closed.
    const ownedAccounts = await tx
      .select({
        id: schema.emailAccounts.id,
        provider: schema.emailAccounts.provider,
      })
      .from(schema.emailAccounts)
      .where(
        and(
          eq(schema.emailAccounts.userId, userId),
          inArray(schema.emailAccounts.id, requestedAccountIds),
        ),
      )
      .for("update");
    const ownedSourceByAccountId = new Map(
      ownedAccounts.map((account) => [
        account.id.toLowerCase(),
        String(account.provider || "")
          .trim()
          .toLowerCase(),
      ]),
    );

    for (const [accountId, provider] of requestedSourceByAccountId) {
      if (ownedSourceByAccountId.get(accountId) !== provider) {
        throw new Error("Mailbox persistence rejected a stale or unowned account source.");
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
