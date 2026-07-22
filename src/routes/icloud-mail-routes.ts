import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { validateBody, icloudMailConnectSchema } from "../lib/api-validation";
import { verifyIcloudMailCredentials, icloudGrantedScopes } from "../lib/icloud-mail";
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

const icloudConnectRateLimiter = createIpRateLimiter({
  bucket: "api:icloud-mail-connect",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

/**
 * POST /api/integrations/icloud/connect
 *
 * iCloud Mail has no public OAuth API for third-party apps. Account Holders connect
 * with an Apple app-specific password (generated at appleid.apple.com). We
 * validate IMAP login, then store the encrypted credential in
 * wireline_email_accounts with provider='icloud'.
 */
router.post(
  "/api/integrations/icloud/connect",
  icloudConnectRateLimiter,
  authenticateUser,
  validateBody(icloudMailConnectSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(
        503,
        "Credential storage is not configured. Contact support to enable mailbox connections.",
      );
    }

    const userId = req.user.id;
    const emailAddress = req.body.email_address.trim().toLowerCase();
    const appPassword = req.body.app_password.replace(/\s+/g, "");

    try {
      await verifyIcloudMailCredentials(emailAddress, appPassword);
    } catch (err) {
      log.warn("iCloud Mail credential verification failed", {
        userId,
        email: emailAddress,
        error: getErrorMessage(err),
      });
      throw AppError.fromHttpStatus(
        400,
        "Could not sign in to iCloud Mail. Check your @icloud.com address and app-specific password.",
      );
    }

    const encryptedPassword = encryptSecret(appPassword);

    const emailAccountConnected = await upsertOwnedEmailAccount({
      userId,
      emailAddress,
      provider: "icloud",
      accessToken: encryptedPassword,
      refreshToken: null,
      expiresAt: null,
      oauthGrantedScopes: icloudGrantedScopes(),
    });
    if (!emailAccountConnected) {
      throw new AppError(
        409,
        "EMAIL_ACCOUNT_IN_USE",
        EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
      );
    }

    res.json({ ok: true, email: emailAddress, provider: "icloud" });
  },
);

router.post(
  "/api/integrations/icloud/disconnect",
  icloudConnectRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    try {
      await drizzle
        .delete(schema.emailAccounts)
        .where(
          and(eq(schema.emailAccounts.userId, userId), eq(schema.emailAccounts.provider, "icloud")),
        );
      res.json({ ok: true });
    } catch (err) {
      log.error("iCloud disconnect failed", { userId, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect iCloud Mail");
    }
  },
);

export default router;
