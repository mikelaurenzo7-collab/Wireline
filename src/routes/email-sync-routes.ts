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
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  assertLiveExternalActionAllowed,
} from "../lib/account-environment-policy";

const router = Router();

async function assertMailboxSyncAllowed(userId: string): Promise<void> {
  try {
    await assertLiveExternalActionAllowed(userId, "mailbox_inbox_sync");
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn("Mailbox sync account environment could not be verified", {
      userId,
      error: getErrorMessage(err),
    });
    throw new AppError(
      503,
      ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      "Inbox refresh is temporarily unavailable until this workspace can be verified.",
    );
  }
}

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
    await assertMailboxSyncAllowed(req.user.id);

    try {
      // Manual sync must use the same canonical mailbox source as
      // IntegrationService. A calendar-only OAuth row cannot provide the
      // mailbox account identity required for tenant-safe persistence.
      const mailAccounts = await drizzle
        .select({ id: schema.emailAccounts.id })
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, req.user.id))
        .limit(1);

      if (mailAccounts.length === 0) {
        return res.status(400).json({
          ok: false,
          code: "EMAIL_ACCOUNT_NOT_CONNECTED",
          error: "No mailbox is connected. Connect one in BotBound, then refresh your inbox.",
        });
      }

      const service = new IntegrationService(req.user.id);
      const { messages, failures, successfulAccounts } = await service.fetchInboxMessages({
        limit,
        sinceIso,
      });

      // A mailbox we could not reach is not an empty mailbox. When every
      // connected account failed there is nothing to sync and nothing true to
      // say except that the connection is broken — reporting "No new inbox
      // messages found." there left account holders watching a healthy-looking
      // inbox while mail piled up behind a revoked or expired OAuth grant.
      if (failures.length > 0 && successfulAccounts === 0) {
        return res.status(502).json({
          ok: false,
          code: "EMAIL_MAILBOX_UNREACHABLE",
          failed_providers: Array.from(new Set(failures.map((failure) => failure.provider))),
          error:
            "BotBound could not reach your connected mailbox. Reconnect it, then refresh again.",
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
          ? "Inbox partially refreshed. Reconnect your mailbox in BotBound to sync the rest."
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
