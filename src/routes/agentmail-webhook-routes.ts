import { Router } from "express";
import { eq } from "drizzle-orm";

import { processVerifiedAgentMailWebhook } from "../lib/agentmail-webhook";
import { verifyResendWebhookSignature } from "../lib/resend-webhook-signature";
import { decryptSecret } from "../lib/secret-vault";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import * as schema from "../db/schema";

const router = Router();
const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const agentmailWebhookRateLimiter = createIpRateLimiter({
  bucket: "api:agentmail-webhook",
  windowMs: 60 * 1000,
  max: 120,
});

/**
 * POST /api/webhooks/agentmail/:accountId
 *
 * Tenant-owned AgentMail Svix receiver. The signing secret is stored encrypted
 * on the mailbox row (refresh_token), never as a shared platform env var.
 */
router.post("/api/webhooks/agentmail/:accountId", agentmailWebhookRateLimiter, async (req, res) => {
  if (!req.is("application/json")) {
    return res.status(415).json({
      code: "INVALID_CONTENT_TYPE",
      error: "Content-Type must be application/json.",
    });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      code: "RAW_WEBHOOK_BODY_REQUIRED",
      error: "Raw webhook body is required.",
    });
  }

  const accountId = String(req.params.accountId || "").trim();
  if (!ACCOUNT_ID_RE.test(accountId)) {
    return res.status(404).json({
      code: "NOT_FOUND",
      error: "Unknown AgentMail webhook.",
    });
  }

  const [account] = await drizzle
    .select({
      id: schema.emailAccounts.id,
      userId: schema.emailAccounts.userId,
      provider: schema.emailAccounts.provider,
      refreshToken: schema.emailAccounts.refreshToken,
    })
    .from(schema.emailAccounts)
    .where(eq(schema.emailAccounts.id, accountId))
    .limit(1);

  if (!account || account.provider !== "agentmail" || !account.refreshToken) {
    return res.status(404).json({
      code: "NOT_FOUND",
      error: "Unknown AgentMail webhook.",
    });
  }

  let signingSecret: string;
  try {
    signingSecret = decryptSecret(account.refreshToken);
  } catch {
    log.error("[agentmail-webhook] stored signing secret could not be decrypted");
    return res.status(503).json({
      code: "WEBHOOK_VERIFICATION_UNAVAILABLE",
      error: "AgentMail webhook verification is unavailable.",
    });
  }

  const verification = verifyResendWebhookSignature(
    req.body,
    {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    },
    signingSecret,
  );
  if (!verification.ok) {
    if (verification.code === "missing_secret") {
      return res.status(503).json({
        code: "WEBHOOK_VERIFICATION_UNAVAILABLE",
        error: "AgentMail webhook verification is unavailable.",
      });
    }
    log.warn("[agentmail-webhook] signature rejected", { code: verification.code });
    return res.status(401).json({
      code: "INVALID_WEBHOOK_SIGNATURE",
      error: "Invalid webhook signature.",
    });
  }

  try {
    const result = await tenantStore.run(account.userId, () =>
      processVerifiedAgentMailWebhook(account.userId, account.id, req.body as Buffer),
    );
    return res.status(200).json({
      received: true,
      eventType: result.eventType,
      messagesSaved: result.messagesSaved,
      suppressed: result.suppressed,
      ignored: result.ignored,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      message.includes("not valid JSON") ||
      message.includes("event type is missing") ||
      message.includes("missing message id") ||
      message.includes("no valid recipient")
    ) {
      log.warn("[agentmail-webhook] authenticated payload rejected", { error: message });
      return res.status(400).json({
        code: "MALFORMED_WEBHOOK_PAYLOAD",
        error: "Malformed AgentMail webhook payload.",
      });
    }
    throw error;
  }
});

export default router;
