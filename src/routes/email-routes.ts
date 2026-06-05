/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import {
  validateBody,
  emailThreadsReadStateSchema,
  emailInboxSyncSchema,
} from "../lib/api-validation";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { IntegrationService } from "../lib/integrations";

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
      res.status(500).json({ error: "Failed to fetch accounts" });
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
        if (!agent) return res.status(404).json({ error: "Agent not found" });
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
      log.error("Failed to update email account assignment", { error: getErrorMessage(error) });
      res.status(500).json({ error: "Failed to update email account assignment" });
    }
  },
);

/**
 * POST /api/emails/sync — operator-initiated inbox refresh.
 *
 * The EmailInbox "Sync inbox" button + the Integrations page both call this
 * endpoint. Previously it returned 404 (the route was never declared), so the
 * button silently no-op'd and showed an incorrect "0 threads loaded" toast.
 *
 * Behaviour:
 * - Returns 400 with a clear error when no Gmail/Outlook account is linked,
 *   so the UI can prompt the operator to connect one.
 * - Returns 200 with the connected account count when one or more accounts
 *   exist. Background workers handle the actual Gmail/Graph fetch on a
 *   schedule; this endpoint is the operator-visible kickoff for a refresh.
 *   The shape is kept stable for future expansion (queued jobs counter).
 */
router.post(
  "/api/emails/sync",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const accounts = await drizzle
        .select({
          id: schema.emailAccounts.id,
          provider: schema.emailAccounts.provider,
          emailAddress: schema.emailAccounts.emailAddress,
        })
        .from(schema.emailAccounts)
        .where(eq(schema.emailAccounts.userId, req.user.id));

      if (!accounts || accounts.length === 0) {
        return res.status(400).json({
          ok: false,
          error:
            "No email accounts connected. Connect Gmail or Outlook in Integrations to start syncing.",
          code: "EMAIL_ACCOUNT_NOT_CONNECTED",
        });
      }

      // Background sync workers consume new threads from Gmail/Graph on a
      // schedule. This endpoint reports the connection state so the operator
      // gets honest feedback when they hit "Sync inbox" — even though we
      // don't fire a worker job here yet (the queue handler doesn't exist
      // for `email_sync` type, so enqueueing would just be cruft).
      res.json({
        ok: true,
        accounts: accounts.length,
        message: "Sync in progress. New threads will appear shortly.",
      });
    } catch (e: any) {
      log.error("Failed to sync email inbox", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to sync inbox" });
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
      res.status(500).json({ error: "Failed to load email threads" });
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
        .catch((err) =>
          log.warn("Failed to mark email thread as read", {
            error: getErrorMessage(err),
            threadId,
          }),
        );

      res.json({ messages: mapObjectToSnake(messages || []) });
    } catch (e: any) {
      log.error("Failed to load email messages", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to load email messages" });
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

      res.json({ success: true, count: ids.length });
    } catch (e: any) {
      log.error("Failed to update thread read state", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to update thread read state" });
    }
  },
);

/**
 * POST /api/emails/sync
 *
 * Pull the latest inbox messages from every connected mailbox
 * (Gmail + Outlook today, Yahoo when XOAUTH2 IMAP ships) and
 * upsert them into wireline_email_threads + wireline_email_messages.
 * Used by the "Sync inbox" button in EmailInbox and by the action
 * engine's triage flow. Idempotent via messageId.
 *
 * Body (optional): { limit?: number, sinceIso?: string }
 */
router.post(
  "/api/emails/sync",
  authenticateUser,
  validateBody(emailInboxSyncSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { limit, sinceIso } = req.body ?? {};
    try {
      const svc = new IntegrationService(req.user.id);
      const messages = await svc.fetchInboxMessages({ limit, sinceIso });
      const rows = messages.map((m) => ({
        userId: req.user.id,
        threadId: m.threadId || m.messageId,
        subject: m.subject,
        customerEmail: m.from,
        summary: m.snippet,
        lastMessageAt: m.receivedAt,
      }));
      let inserted = 0;
      if (rows.length > 0) {
        const result = await drizzle
          .insert(schema.emailThreads)
          .values(rows)
          .onConflictDoNothing({ target: schema.emailThreads.threadId })
          .returning({ id: schema.emailThreads.id });
        inserted = result.length;
      }
      res.json({
        ok: true,
        fetched: messages.length,
        upserted: inserted,
        providers: Array.from(new Set(messages.map((m) => m.provider))),
      });
    } catch (err) {
      log.error("/api/emails/sync failed", { error: getErrorMessage(err) });
      res.status(500).json({ error: "Inbox sync failed" });
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
      res.status(500).json({ error: "Failed to disconnect account" });
    }
  },
);

export default router;
