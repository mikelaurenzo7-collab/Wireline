/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
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
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { sendTenantMessage } from "../lib/twilio-service";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * GET /api/sms/threads — list threads sorted by recency.
 * Read-only. Empty result means no threads — never mask outages as [].
 */
router.get(
  "/api/sms/threads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threads = await drizzle
        .select()
        .from(schema.smsThreads)
        .where(eq(schema.smsThreads.userId, req.user.id))
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

/**
 * GET /api/sms/threads/:id/messages — chronological message history.
 */
router.get(
  "/api/sms/threads/:id/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      // Ownership check before exposing messages.
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

/**
 * POST /api/sms/threads/:id/reply — Account Holder manual reply.
 * Body: { body: string }
 */
router.post(
  "/api/sms/threads/:id/reply",
  authenticateUser,
  smsRateLimit,
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

      // Manual inbox replies are service/conversation SMS (not cold marketing),
      // but still must clear tenant DNC + TCPA quiet hours via the shared gate.
      const gate = await evaluateOutboundDialGate({
        userId: req.user.id,
        phone: thread.customerNumber!,
        isMarketingCall: false,
      });
      if (!gate.allowed) {
        throw AppError.fromHttpStatus(
          403,
          gate.federalDncMessage ||
            gate.reason ||
            "Outbound SMS blocked by compliance policy for this number.",
          { code: gate.federalDncCode || gate.reason },
        );
      }

      const result = await sendTenantMessage(req.user.id, {
        to: thread.customerNumber!,
        body,
        channel: "sms",
      });
      // sendTenantMessage already writes the outbound message row + bumps
      // last_message_at. Just need to clear unread count for this thread.
      await drizzle
        .update(schema.smsThreads)
        .set({ unreadCount: 0 })
        .where(eq(schema.smsThreads.id, thread.id));

      res.json({ ok: result.ok, reason: result.ok ? null : result.reason });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("SMS reply failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Reply failed");
    }
  },
);

/**
 * POST /api/sms/threads/:id/mark-read — clear the unread badge.
 */
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
