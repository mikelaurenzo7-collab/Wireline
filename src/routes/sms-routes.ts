/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * SMS Inbox API — list threads, fetch messages, send replies.
 *
 * Backs the SmsThreads UI in /inbox. Per-tenant scoped; every query
 * filters on req.user.id. Sending replies reuses sendTenantMessage so
 * the same Twilio config + opt-out compliance applies.
 */

import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { validateBody, smsReplySchema } from "../lib/api-validation";
import { smsRateLimit } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { evaluateSmsThreadReplyGate } from "../lib/sms-reply-compliance";
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../lib/account-environment-policy";
import { sendTenantMessage } from "../lib/twilio-service";
import { customerSafeSmsFailureReason } from "../lib/sms-customer-errors";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * Manual replies are authenticated, but authentication alone must never make
 * a demo/test workspace or inert showcase contact eligible for live carrier
 * work. Keep this admission check ahead of the shared compliance gate because
 * that gate may consult the Federal DNC service. Unknown classification
 * failures are mapped to the same stable, fail-closed response as a missing
 * account environment.
 */
async function assertSmsReplyExternalActionAllowed(userId: string, phone: string): Promise<void> {
  try {
    await assertLiveExternalActionAllowed(userId, "sms_thread_reply");
    await assertExternalEntityActionAllowed(userId, "sms_thread_reply", { phone });
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("SMS reply account environment or target could not be verified", {
      userId,
      error: getErrorMessage(error),
    });
    throw new AppError(
      503,
      ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      "SMS replies are temporarily unavailable until this workspace can be verified.",
    );
  }
}

router.get(
  "/api/sms/threads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedAgentId =
        typeof req.query.agent_id === "string" ? req.query.agent_id.trim() : "";
      const where = requestedAgentId
        ? and(
            eq(schema.smsThreads.userId, req.user.id),
            eq(schema.smsThreads.agentId, requestedAgentId),
          )
        : eq(schema.smsThreads.userId, req.user.id);
      const threads = await drizzle
        .select()
        .from(schema.smsThreads)
        .where(where)
        .orderBy(desc(schema.smsThreads.lastMessageAt))
        .limit(200);
      res.json({ threads: mapObjectToSnake(threads || []) });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("/api/sms/threads failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load SMS threads");
    }
  },
);

router.get(
  "/api/sms/threads/:id/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const [thread] = await drizzle
        .select({ id: schema.smsThreads.id })
        .from(schema.smsThreads)
        .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, req.user.id)))
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "Thread not found");

      const messages = await drizzle
        .select()
        .from(schema.smsMessages)
        .where(eq(schema.smsMessages.threadId, threadId))
        .orderBy(schema.smsMessages.createdAt);
      res.json({ messages: mapObjectToSnake(messages || []) });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("/api/sms/threads/:id/messages failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load SMS messages");
    }
  },
);

router.post(
  "/api/sms/threads/:id/reply",
  authenticateUser,
  smsRateLimit,
  enforceLaunchHardGate,
  validateBody(smsReplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const body = req.body.body.trim();

      const [thread] = await drizzle
        .select({
          id: schema.smsThreads.id,
          customerNumber: schema.smsThreads.customerNumber,
        })
        .from(schema.smsThreads)
        .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, req.user.id)))
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "Thread not found");

      await assertSmsReplyExternalActionAllowed(req.user.id, thread.customerNumber!);

      const gate = await evaluateSmsThreadReplyGate({
        userId: req.user.id,
        threadId,
        phone: thread.customerNumber!,
      });
      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          throw new AppError(
            503,
            gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
            gate.federalDncMessage || "Federal DNC is not configured for marketing sends.",
          );
        }
        throw new AppError(
          403,
          "FORBIDDEN",
          gate.federalDncMessage || "Outbound SMS blocked by compliance policy for this number.",
          { reason: gate.reason },
        );
      }

      const result = await sendTenantMessage(req.user.id, {
        to: thread.customerNumber!,
        body,
        channel: "sms",
      });
      if (!result.ok) {
        log.warn("SMS reply was not accepted", {
          userId: req.user.id,
          configured: result.configured,
          enabled: result.enabled,
          code: result.code,
          providerReason: result.reason,
        });
        res.json({
          ok: false,
          reason: customerSafeSmsFailureReason(result),
          code: result.code,
          recovery_path: result.recovery_path,
          provider_outcome_ambiguous: result.providerOutcomeAmbiguous ?? false,
          do_not_resend: result.doNotResend ?? false,
        });
        return;
      }
      res.json({
        ok: true,
        reason: null,
        status: result.status ?? null,
        reconciliation_pending: result.reconciliationPending ?? false,
      });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("SMS reply failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Reply failed");
    }
  },
);

router.post(
  "/api/sms/threads/:id/mark-read",
  authenticateUser,
  smsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .update(schema.smsThreads)
        .set({ unreadCount: 0 })
        .where(
          and(eq(schema.smsThreads.id, req.params.id), eq(schema.smsThreads.userId, req.user.id)),
        );
      res.json({ ok: true });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("SMS mark-read failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read");
    }
  },
);

export default router;
