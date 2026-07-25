/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { validateBody, emailThreadsReadStateSchema } from "../lib/api-validation";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { touchNavCounts } from "../lib/nav-counts-invalidate";

const router = Router();

const emailAccountRateLimiter = createIpRateLimiter({
  bucket: "api:email-accounts",
  windowMs: 15 * 60 * 1000,
  max: 100,
});

router.get(
  "/api/emails/accounts",
  emailAccountRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const accounts = await drizzle
        .select({
          id: schema.emailAccounts.id,
          emailAddress: schema.emailAccounts.emailAddress,
          provider: schema.emailAccounts.provider,
          agentId: schema.emailAccounts.agentId,
          createdAt: schema.emailAccounts.createdAt,
        })
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, req.user.id))
        .orderBy(desc(schema.emailAccounts.createdAt));

      res.json({ accounts: accounts || [] });
    } catch (err: any) {
      log.error("GET /api/emails/accounts failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to fetch accounts");
    }
  },
);

router.patch(
  "/api/emails/accounts/:id",
  emailAccountRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_id } = req.body;

      if (agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      await drizzle
        .update(schema.emailAccounts)
        .set({ agentId: agent_id })
        .where(
          and(
            eq(schema.emailAccounts.id, req.params.id),
            eq(schema.emailAccounts.userId, req.user.id),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Failed to update email account assignment", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update email account assignment");
    }
  },
);

router.get(
  "/api/emails/threads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threads = await drizzle
        .select()
        .from(schema.emailThreads)
        .where(eq(schema.emailThreads.userId, req.user.id))
        .orderBy(desc(schema.emailThreads.lastMessageAt))
        .limit(100);

      res.json({ threads: mapObjectToSnake(threads || []) });
    } catch (e: any) {
      log.error("Failed to load email threads", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load email threads");
    }
  },
);

router.get(
  "/api/emails/threads/:id/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const messages = await drizzle
        .select()
        .from(schema.emailMessages)
        .where(
          and(
            eq(schema.emailMessages.threadId, threadId as any), // threadId is uuid in schema, but req.params.id is string. drizzle handles conversion usually.
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(asc(schema.emailMessages.createdAt));

      // Mark the thread as read once its messages have been fetched. Failures
      // here must never break the read path, so we swallow errors quietly.
      void drizzle
        .update(schema.emailThreads)
        .set({ read: true })
        .where(
          and(eq(schema.emailThreads.id, threadId), eq(schema.emailThreads.userId, req.user.id)),
        )
        .then(() => touchNavCounts(req.user.id))
        .catch((err) =>
          log.warn("Failed to mark email thread as read", {
            error: getErrorMessage(err),
            threadId,
          }),
        );

      res.json({ messages: mapObjectToSnake(messages || []) });
    } catch (e: any) {
      log.error("Failed to load email messages", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load email messages");
    }
  },
);

/**
 * Bulk mark threads as read / unread. Body: { ids: string[], read: boolean }.
 * Used by the inbox UI when the user explicitly toggles read state.
 */
router.post(
  "/api/emails/threads/read-state",
  authenticateUser,
  validateBody(emailThreadsReadStateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ids, read } = req.body;
      const { inArray } = await import("drizzle-orm");
      await drizzle
        .update(schema.emailThreads)
        .set({ read })
        .where(
          and(inArray(schema.emailThreads.id, ids), eq(schema.emailThreads.userId, req.user.id)),
        );

      touchNavCounts(req.user.id);
      res.json({ success: true, count: ids.length });
    } catch (e: any) {
      log.error("Failed to update thread read state", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update thread read state");
    }
  },
);

router.delete(
  "/api/emails/accounts/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.emailAccounts)
        .where(
          and(
            eq(schema.emailAccounts.id, req.params.id),
            eq(schema.emailAccounts.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (err: any) {
      log.error("DELETE /api/emails/accounts/:id failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect account");
    }
  },
);

export default router;
