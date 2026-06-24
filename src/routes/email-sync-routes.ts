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

const router = Router();

/**
 * The outcome center needs a truthful refresh: this route is mounted before the
 * legacy email router, whose historic connection-state endpoint shares the
 * same path. It fetches the mailbox now, updates each existing thread from its
 * own incoming value, and never overwrites the account holder's chosen outcome.
 */
router.post(
  "/api/emails/sync",
  authenticateUser,
  validateBody(emailInboxSyncSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { limit, sinceIso } = req.body ?? {};
    try {
      const accounts = await drizzle
        .select({ id: schema.emailAccounts.id })
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, req.user.id))
        .limit(1);

      if (accounts.length === 0) {
        return res.status(400).json({
          ok: false,
          code: "EMAIL_ACCOUNT_NOT_CONNECTED",
          error: "No email account is connected. Connect Gmail, Outlook, or iCloud in Connections to refresh this inbox.",
        });
      }

      const service = new IntegrationService(req.user.id);
      const messages = await service.fetchInboxMessages({ limit, sinceIso });
      const rows = messages
        .filter((message) => Boolean(message.threadId || message.messageId))
        .map((message) => ({
          userId: req.user.id,
          threadId: message.threadId || message.messageId,
          subject: message.subject,
          customerEmail: message.from,
          summary: message.snippet,
          lastMessageAt: message.receivedAt,
        }));

      let upserted = 0;
      if (rows.length > 0) {
        const result = await drizzle
          .insert(schema.emailThreads)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.emailThreads.threadId,
            set: {
              subject: sql`excluded.subject`,
              customerEmail: sql`excluded.customer_email`,
              summary: sql`excluded.summary`,
              lastMessageAt: sql`excluded.last_message_at`,
            },
          })
          .returning({ id: schema.emailThreads.id });
        upserted = result.length;
      }

      if (upserted > 0) touchNavCounts(req.user.id);
      res.json({
        ok: true,
        fetched: messages.length,
        upserted,
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
