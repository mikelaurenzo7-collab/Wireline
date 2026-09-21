/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
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

      if (agent_id === undefined) {
        throw AppError.fromHttpStatus(400, "agent_id is required, pass null to unassign.");
      }

      if (agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      const updated = (await drizzle
        .update(schema.emailAccounts)
        .set({ agentId: agent_id })
        .where(
          and(
            eq(schema.emailAccounts.id, req.params.id),
            eq(schema.emailAccounts.userId, req.user.id),
          ),
        )
        .returning()) as unknown[];

      if (!updated.length) throw AppError.fromHttpStatus(404, "Email account not found");

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
      const requestedAgentId =
        typeof req.query.agent_id === "string" ? req.query.agent_id.trim() : "";
      const requestedAccountId =
        typeof req.query.account_id === "string" ? req.query.account_id.trim() : "";
      const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
      const offsetRaw = Number.parseInt(String(req.query.offset ?? ""), 10);
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
      const offset = Number.isSafeInteger(offsetRaw)
        ? Math.min(2_147_483_647, Math.max(0, offsetRaw))
        : 0;
      const emptyPage = { threads: [], hasMore: false, nextOffset: offset };
      let accountIds: string[] | null = null;

      if (requestedAccountId) {
        const [account] = await drizzle
          .select({ id: schema.emailAccounts.id, agentId: schema.emailAccounts.agentId })
          .from(schema.emailAccounts)
          .where(
            and(
              eq(schema.emailAccounts.id, requestedAccountId),
              eq(schema.emailAccounts.userId, req.user.id),
            ),
          )
          .limit(1);
        if (!account) return res.json(emptyPage);
        if (requestedAgentId && account.agentId !== requestedAgentId) {
          return res.json(emptyPage);
        }
        accountIds = [account.id];
      } else if (requestedAgentId) {
        const accounts = await drizzle
          .select({ id: schema.emailAccounts.id })
          .from(schema.emailAccounts)
          .where(
            and(
              eq(schema.emailAccounts.userId, req.user.id),
              eq(schema.emailAccounts.agentId, requestedAgentId),
            ),
          );
        accountIds = accounts.map((account) => account.id);
        if (!accountIds.length) return res.json(emptyPage);
      }

      const where = accountIds
        ? and(
            eq(schema.emailThreads.userId, req.user.id),
            inArray(schema.emailThreads.accountId, accountIds),
          )
        : eq(schema.emailThreads.userId, req.user.id);

      const threads = await drizzle
        .select()
        .from(schema.emailThreads)
        .where(where)
        .orderBy(desc(schema.emailThreads.lastMessageAt), desc(schema.emailThreads.id))
        .limit(limit + 1)
        .offset(offset);

      const page = (threads || []).slice(0, limit);
      res.json({
        threads: mapObjectToSnake(page),
        hasMore: threads.length > limit,
        nextOffset: offset + page.length,
      });
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
            eq(schema.emailMessages.threadId, threadId as any),
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(asc(schema.emailMessages.createdAt));

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

router.post(
  "/api/emails/threads/read-state",
  authenticateUser,
  validateBody(emailThreadsReadStateSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ids, read } = req.body;
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
      const [account] = await drizzle
        .select({
          id: schema.emailAccounts.id,
          provider: schema.emailAccounts.provider,
          accessToken: schema.emailAccounts.accessToken,
          refreshToken: schema.emailAccounts.refreshToken,
          emailAddress: schema.emailAccounts.emailAddress,
        })
        .from(schema.emailAccounts)
        .where(
          and(
            eq(schema.emailAccounts.id, req.params.id),
            eq(schema.emailAccounts.userId, req.user.id),
          ),
        )
        .limit(1);

      if (account) {
        const { revokeMailboxAccountTokens } = await import("../lib/oauth-provider-revocation");
        await revokeMailboxAccountTokens(account);
        if (
          account.emailAddress &&
          (account.provider === "google" || account.provider === "microsoft")
        ) {
          await drizzle
            .delete(schema.calendarAccounts)
            .where(
              and(
                eq(schema.calendarAccounts.userId, req.user.id),
                eq(schema.calendarAccounts.emailAddress, account.emailAddress),
                eq(schema.calendarAccounts.provider, account.provider),
              ),
            );
        }
        await drizzle.delete(schema.emailAccounts).where(eq(schema.emailAccounts.id, account.id));
      }

      res.json({ success: true });
    } catch (err: any) {
      log.error("DELETE /api/emails/accounts/:id failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect account");
    }
  },
);

export default router;
