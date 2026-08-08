import { Router, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { validateBody, emailInboxSyncSchema } from "../lib/api-validation";
import { IntegrationService } from "../lib/integrations";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { dispatchWebhook } from "../lib/webhook-helpers";
import { runInBackground } from "../lib/background-work";

const router = Router();

type InboxMessage = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  provider: "google" | "microsoft" | "yahoo" | "icloud";
};

/**
 * The outcome center needs a truthful refresh: this route is mounted before the
 * legacy email router, whose historic connection-state endpoint shares the
 * same path. It fetches the mailbox now, records the latest preview for every
 * message, and never overwrites the account holder's chosen outcome.
 */
router.post(
  "/api/emails/sync",
  authenticateUser,
  validateBody(emailInboxSyncSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { limit, sinceIso } = req.body ?? {};
    try {
      // Mirror IntegrationService's mail → calendar-account fallback so a
      // mailbox enabled through a broader Google or Microsoft connection is
      // not incorrectly reported as disconnected.
      const [mailAccounts, calendarAccounts] = await Promise.all([
        drizzle
          .select({ id: schema.emailAccounts.id })
          .from(schema.emailAccounts)
          .where(eq(schema.emailAccounts.userId, req.user.id))
          .limit(1),
        drizzle
          .select({ id: schema.calendarAccounts.id })
          .from(schema.calendarAccounts)
          .where(eq(schema.calendarAccounts.userId, req.user.id))
          .limit(1),
      ]);

      if (mailAccounts.length === 0 && calendarAccounts.length === 0) {
        return res.status(400).json({
          ok: false,
          code: "EMAIL_ACCOUNT_NOT_CONNECTED",
          error:
            "No email account is connected. Connect Gmail, Outlook, or iCloud in Integrations to refresh this inbox.",
        });
      }

      const service = new IntegrationService(req.user.id);
      const messages = await service.fetchInboxMessages({ limit, sinceIso });
      const latestThreadMessage = new Map<string, InboxMessage>();

      for (const message of messages) {
        const externalThreadId = message.threadId || message.messageId;
        if (!externalThreadId) continue;
        const prior = latestThreadMessage.get(externalThreadId);
        if (!prior || message.receivedAt.getTime() > prior.receivedAt.getTime()) {
          latestThreadMessage.set(externalThreadId, message);
        }
      }

      // A mailbox result can contain multiple messages in the same provider
      // thread. Dedupe before the multi-row upsert: Postgres will reject an
      // ON CONFLICT DO UPDATE statement that targets the same row twice.
      const threadRows = Array.from(latestThreadMessage.entries()).map(([threadId, message]) => ({
        userId: req.user.id,
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
            userId: req.user.id,
            googleMessageId: message.messageId,
            role: "user" as const,
            content: message.snippet || "No preview was supplied by the connected mailbox.",
            createdAt: message.receivedAt,
          },
        ];
      });

      let messagesSaved = 0;
      if (threadRows.length > 0 || messageRows.length > 0) {
        messagesSaved = await drizzle.transaction(async (tx) => {
          const threadDbIdByExternalId = new Map<string, string>();
          if (threadRows.length > 0) {
            const threads = await tx
              .insert(schema.emailThreads)
              .values(threadRows)
              .onConflictDoUpdate({
                // Composite per-tenant key: provider/sender-chosen thread ids
                // repeat across tenants' mailboxes, so a global thread_id
                // target collided with another tenant's row and failed the
                // whole sync. setWhere is belt-and-suspenders alongside RLS.
                target: [schema.emailThreads.userId, schema.emailThreads.threadId],
                set: {
                  subject: sql`excluded.subject`,
                  customerEmail: sql`excluded.customer_email`,
                  summary: sql`excluded.summary`,
                  lastMessageAt: sql`excluded.last_message_at`,
                },
                setWhere: sql`${schema.emailThreads.userId} = ${req.user.id}`,
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
      }

      if (threadRows.length > 0 || messagesSaved > 0) touchNavCounts(req.user.id);
      if (messagesSaved > 0) {
        // The webhook catalog advertises email.received ("Inbound email synced
        // from a connected mailbox"); this sync is its natural producer.
        const savedCount = messagesSaved;
        runInBackground("email.received webhook dispatch", () =>
          dispatchWebhook(req.user.id, "email.received", {
            messages_saved: savedCount,
            threads_upserted: threadRows.length,
            providers: Array.from(new Set(messages.map((message) => message.provider))),
            at: new Date().toISOString(),
          }),
        );
      }
      res.json({
        ok: true,
        fetched: messages.length,
        threads_upserted: threadRows.length,
        messages_saved: messagesSaved,
        providers: Array.from(new Set(messages.map((message) => message.provider))),
        message: messages.length ? "Inbox refreshed." : "No new inbox messages found.",
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("email sync failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Inbox refresh failed.");
    }
  },
);

export default router;
