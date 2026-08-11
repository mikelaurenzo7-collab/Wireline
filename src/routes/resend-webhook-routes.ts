import express from "express";
import { getErrorMessage } from "../lib/server-utils";
import { log } from "../lib/server-context";
import {
  processVerifiedResendWebhook,
  verifyResendWebhookSignature,
} from "../lib/resend-webhook";

const router = express.Router();

/**
 * Resend provider feedback receiver.
 *
 * The raw parser is installed in `body-parsers.ts` before global JSON parsing.
 * Authenticity is established before JSON parsing, database work, or any other
 * side effect. Successfully processed duplicates intentionally return 200 so
 * Resend retries converge without multiplying suppression/observability rows.
 */
router.post("/api/webhooks/resend", async (req, res) => {
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json." });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: "Raw webhook body is required." });
  }

  const verification = verifyResendWebhookSignature(req.body, {
    "svix-id": req.headers["svix-id"],
    "svix-timestamp": req.headers["svix-timestamp"],
    "svix-signature": req.headers["svix-signature"],
  });
  if (!verification.ok) {
    if (verification.code === "missing_secret") {
      log.error("[resend-webhook] signing secret is not configured");
      return res.status(503).json({ error: "Resend webhook verification is unavailable." });
    }
    log.warn("[resend-webhook] signature rejected", { code: verification.code });
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  try {
    const result = await processVerifiedResendWebhook(req.body, verification.webhookId);
    return res.status(200).json({
      received: true,
      duplicate: result.duplicate,
      eventType: result.eventType,
      recipientCount: result.recipientCount,
      suppressionCount: result.suppressionCount,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      message.includes("not valid JSON") ||
      message.includes("event type is missing") ||
      message.includes("timestamp is missing or invalid") ||
      message.includes("has no valid recipient") ||
      message.includes("recipient count exceeds safety limit")
    ) {
      log.warn("[resend-webhook] authenticated payload rejected", { error: message });
      return res.status(400).json({ error: "Malformed Resend webhook payload." });
    }
    throw error;
  }
});

export default router;
