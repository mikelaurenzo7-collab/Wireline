import { Router, Response } from "express";
import { eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { validateBody, emailInboxSyncSchema } from "../lib/api-validation";
import { IntegrationService } from "../lib/integrations";
import { persistMailboxInboxMessages } from "../lib/mailbox-inbox-persist";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { dispatchWebhook } from "../lib/webhook-helpers";
import { runInBackground } from "../lib/background-work";

const router = Router();

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
            "No email account is connected. Connect Gmail, Outlook, iCloud, or AgentMail in Integrations to refresh this inbox.",
        });
      }

      const service = new IntegrationService(req.user.id);
      const { messages, failures } = await service.fetchInboxMessages({ limit, sinceIso });

      // A mailbox we could not reach is not an empty mailbox. When every
      // connected account failed there is nothing to sync and nothing true to
      // say except that the connection is broken — reporting "No new inbox
      // messages found." there left account holders watching a healthy-looking
      // inbox while mail piled up behind a revoked or expired OAuth grant.
      if (failures.length > 0 && messages.length === 0) {
        return res.status(502).json({
          ok: false,
          code: "EMAIL_MAILBOX_UNREACHABLE",
          failed_providers: Array.from(new Set(failures.map((failure) => failure.provider))),
          error:
            "Your connected mailbox could not be reached. Reconnect it in Integrations, then refresh again.",
        });
      }

      const persisted = await persistMailboxInboxMessages(req.user.id, messages);

      if (persisted.threadsUpserted > 0 || persisted.messagesSaved > 0) {
        touchNavCounts(req.user.id);
      }
      if (persisted.messagesSaved > 0) {
        // The webhook catalog advertises email.received ("Inbound email synced
        // from a connected mailbox"); this sync is its natural producer.
        const savedCount = persisted.messagesSaved;
        const threadsUpserted = persisted.threadsUpserted;
        runInBackground("email.received webhook dispatch", () =>
          dispatchWebhook(req.user.id, "email.received", {
            messages_saved: savedCount,
            threads_upserted: threadsUpserted,
            providers: Array.from(new Set(messages.map((message) => message.provider))),
            at: new Date().toISOString(),
          }),
        );
      }
      // Partial reach: at least one mailbox answered, at least one did not.
      // Say so — a silent partial sync reads as a complete one.
      const failedProviders = Array.from(new Set(failures.map((failure) => failure.provider)));
      res.json({
        ok: true,
        fetched: messages.length,
        threads_upserted: persisted.threadsUpserted,
        messages_saved: persisted.messagesSaved,
        providers: Array.from(new Set(messages.map((message) => message.provider))),
        ...(failedProviders.length > 0 ? { failed_providers: failedProviders } : {}),
        message: failedProviders.length
          ? `Inbox partially refreshed. Reconnect ${failedProviders.join(", ")} in Integrations to sync the rest.`
          : messages.length
            ? "Inbox refreshed."
            : "No new inbox messages found.",
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("email sync failed", { error: getErrorMessage(err) });
      // Rendered as the body of an "Inbox refresh failed" notice, so restating
      // the failure here just printed it twice. Carry the next step instead.
      throw AppError.fromHttpStatus(500, "Try again in a moment.");
    }
  },
);

export default router;
