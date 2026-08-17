import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { validateBody, agentmailConnectSchema } from "../lib/api-validation";
import {
  AgentMailConnectError,
  agentmailGrantedScopes,
  resolveAgentMailInbox,
  verifyAgentMailCredentials,
} from "../lib/agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "../lib/owned-email-account";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { encryptSecret, isVaultConfigured } from "../lib/secret-vault";
import { authenticateUser } from "../middleware/auth";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import * as schema from "../db/schema";

const router = Router();

const agentmailConnectRateLimiter = createIpRateLimiter({
  bucket: "api:agentmail-connect",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

/**
 * POST /api/integrations/agentmail/connect
 *
 * AgentMail is a tenant-owned API-key mailbox, not a platform env var.
 * Account Holders paste their org key in Connections. We resolve or create
 * the inbox, prove IMAP login, then store the encrypted key on
 * wireline_email_accounts with provider='agentmail'.
 */
router.post(
  "/api/integrations/agentmail/connect",
  agentmailConnectRateLimiter,
  authenticateUser,
  validateBody(agentmailConnectSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(
        503,
        "Credential storage is not configured. Contact support to enable mailbox connections.",
      );
    }

    const userId = req.user.id;
    const requestedEmail = req.body.email_address.trim().toLowerCase();
    const apiKey = req.body.api_key.replace(/\s+/g, "");

    let emailAddress = requestedEmail;
    try {
      const inbox = await resolveAgentMailInbox(apiKey, requestedEmail);
      emailAddress = inbox.email;
      await verifyAgentMailCredentials(emailAddress, apiKey);
    } catch (err) {
      log.warn("AgentMail mailbox connection failed", {
        userId,
        email: requestedEmail,
        error: getErrorMessage(err),
      });
      if (err instanceof AgentMailConnectError) {
        throw AppError.fromHttpStatus(400, err.message);
      }
      throw AppError.fromHttpStatus(
        400,
        "Could not sign in to that AgentMail inbox. Check the address and API key.",
      );
    }

    const emailAccountConnected = await upsertOwnedEmailAccount({
      userId,
      emailAddress,
      provider: "agentmail",
      accessToken: encryptSecret(apiKey),
      refreshToken: null,
      expiresAt: null,
      oauthGrantedScopes: agentmailGrantedScopes(),
    });
    if (!emailAccountConnected) {
      throw new AppError(409, "EMAIL_ACCOUNT_IN_USE", EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
    }

    res.json({ ok: true, email: emailAddress, provider: "agentmail" });
  },
);

router.post(
  "/api/integrations/agentmail/disconnect",
  agentmailConnectRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    try {
      await drizzle
        .delete(schema.emailAccounts)
        .where(
          and(
            eq(schema.emailAccounts.userId, userId),
            eq(schema.emailAccounts.provider, "agentmail"),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      log.error("AgentMail disconnect failed", { userId, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect AgentMail");
    }
  },
);

export default router;
