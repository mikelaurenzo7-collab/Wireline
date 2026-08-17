import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { xaiPhoneBindings } from "../db/xai-voice-schema";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { AppError, asyncHandler } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import { runInBackground } from "../lib/background-work";
import { decryptSecret } from "../lib/secret-vault";
import { drizzle, log } from "../lib/server-context";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { getNativeXAIPhoneStatus, provisionNativeXAIPhone } from "../lib/voice/xai-sip-provisioning";
import { normalizeXAIPhoneNumber } from "../lib/voice/xai-sip-config";
import { runXAISipCallSession } from "../lib/voice/xai-sip-session";
import { verifyXAIWebhook } from "../lib/voice/xai-webhook-auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const webhookLimiter = createRateLimiter({
  bucket: "provider:xai-voice-webhook",
  windowMs: 60_000,
  max: 300,
  failClosedOnError: true,
});
const provisioningLimiter = createRateLimiter({
  bucket: "api:xai-phone-provision",
  windowMs: 60 * 60 * 1_000,
  max: 8,
  failClosedOnError: true,
});
const statusLimiter = createRateLimiter({
  bucket: "api:xai-phone-status",
  windowMs: 60_000,
  max: 60,
});

const provisionSchema = z.object({
  agentId: z.string().min(1).max(200),
});

type XAIIncomingWebhook = {
  type?: unknown;
  data?: {
    call_id?: unknown;
    sip_headers?: unknown;
  };
};

function rawBody(req: Request): Buffer | null {
  return Buffer.isBuffer(req.body) ? req.body : null;
}

function parseWebhook(body: Buffer): XAIIncomingWebhook | null {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as XAIIncomingWebhook)
      : null;
  } catch {
    return null;
  }
}

function sipHeader(payload: XAIIncomingWebhook, name: string): string {
  const headers = Array.isArray(payload.data?.sip_headers) ? payload.data?.sip_headers : [];
  const row = headers.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return String((value as { name?: unknown }).name || "").toLowerCase() === name.toLowerCase();
  }) as { value?: unknown } | undefined;
  return typeof row?.value === "string" ? row.value.trim() : "";
}

function phoneFromSipValue(value: string): string | null {
  const direct = normalizeXAIPhoneNumber(value);
  if (direct) return direct;
  const match = value.match(/\+[1-9]\d{7,14}/);
  return match ? normalizeXAIPhoneNumber(match[0]) : null;
}

router.post(
  "/api/webhooks/xai/voice",
  webhookLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = rawBody(req);
    if (!body) throw AppError.badRequest("A raw xAI webhook body is required.");
    const payload = parseWebhook(body);
    if (!payload) throw AppError.badRequest("The xAI webhook body is invalid JSON.");

    // Unknown future event types are acknowledged without side effects. xAI
    // retries non-2xx deliveries, so rejecting an event Wireline does not own
    // would create a provider retry storm.
    if (payload.type !== "realtime.call.incoming") {
      res.status(202).json({ received: true, handled: false });
      return;
    }

    const callId = typeof payload.data?.call_id === "string" ? payload.data.call_id.trim() : "";
    const calledNumber = phoneFromSipValue(sipHeader(payload, "To"));
    const callerNumber = phoneFromSipValue(sipHeader(payload, "From"));
    if (!callId || callId.length > 200 || !calledNumber) {
      throw AppError.badRequest("The incoming call event is missing a valid call or dialed number.");
    }

    const [binding] = await drizzle
      .select()
      .from(xaiPhoneBindings)
      .where(
        and(
          eq(xaiPhoneBindings.phoneNumber, calledNumber),
          eq(xaiPhoneBindings.status, "active"),
        ),
      )
      .limit(1);
    if (!binding?.webhookSecretEncrypted || !binding.xaiWebhookId) {
      log.warn("xAI incoming call rejected: no active native phone binding", {
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.forbidden("This phone line is not active for native voice.");
    }

    let signingSecret: string;
    try {
      signingSecret = decryptSecret(binding.webhookSecretEncrypted);
    } catch {
      log.error("xAI incoming call rejected: binding secret could not be decrypted", {
        bindingId: binding.id,
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.serviceUnavailable("Native voice verification is unavailable.");
    }

    const verification = verifyXAIWebhook({
      rawBody: body,
      headers: {
        webhookId: String(req.get("webhook-id") || ""),
        webhookTimestamp: String(req.get("webhook-timestamp") || ""),
        webhookSignature: String(req.get("webhook-signature") || ""),
      },
      signingSecret,
    });
    if (!verification.ok || verification.webhookId !== binding.xaiWebhookId) {
      log.warn("xAI incoming call signature rejected", {
        bindingId: binding.id,
        reason: verification.ok ? "webhook_id_mismatch" : verification.reason,
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.unauthorized("Invalid xAI webhook signature.");
    }

    // Resolve the exact disclosure posture only after signature verification.
    // Inbound calls previously had no business/compliance context, so the first
    // spoken line could omit a required AI or recording disclosure even though
    // outbound calls carried the same fields explicitly.
    const [agentContext] = await drizzle
      .select({
        businessName: schema.settings.businessName,
        complianceMode: schema.agents.complianceMode,
      })
      .from(schema.agents)
      .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
      .where(
        and(
          eq(schema.agents.id, binding.agentId),
          eq(schema.agents.userId, binding.userId),
        ),
      )
      .limit(1);
    if (!agentContext) {
      log.error("xAI incoming call rejected: native binding points to a missing agent", {
        bindingId: binding.id,
        calledSuffix: phoneSuffixForLog(calledNumber),
      });
      throw AppError.serviceUnavailable("This phone line is not ready for native voice.");
    }

    runInBackground("xai-sip-call-session", () =>
      runXAISipCallSession({
        callId,
        userId: binding.userId,
        agentId: binding.agentId,
        callerNumber,
        calledNumber,
        businessName: agentContext.businessName,
        complianceMode: agentContext.complianceMode,
      }),
    );
    res.status(202).json({ received: true, handled: true });
  }),
);

router.get(
  "/api/voice/native/phone/status",
  authenticateUser,
  statusLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId.trim() : "";
    const status = await getNativeXAIPhoneStatus(req.user.id, agentId || undefined);
    res.setHeader("Cache-Control", "no-store");
    res.json(status);
  }),
);

router.post(
  "/api/voice/native/phone/provision",
  authenticateUser,
  provisioningLimiter,
  enforceLaunchHardGate,
  validateBody(provisionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await provisionNativeXAIPhone({
      userId: req.user.id,
      agentId: req.body.agentId,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  }),
);

export default router;