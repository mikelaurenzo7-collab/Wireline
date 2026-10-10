/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, asc, inArray, sql, getTableColumns } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import {
  validateBody,
  emailThreadReplySchema,
  emailThreadsReadStateSchema,
} from "../lib/api-validation";
import { sendEmailThreadReply } from "../lib/email-thread-reply";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import { createIpRateLimiter, emailReplyRateLimiter } from "../middleware/api-rate-limits";
import { touchNavCounts } from "../lib/nav-counts-invalidate";

const router = Router();

type EmailHistoryCursor = {
  v: 1;
  userId: string;
  agentId: string;
  accountId: string;
  asOf: string;
  maxMessageId: string;
  lastActivity: string;
  lastId: string;
};
const HISTORY_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const HISTORY_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function validHistoryTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    HISTORY_TIMESTAMP.test(value) &&
    !value.startsWith("0000-") &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === `${value.slice(0, 23)}Z`
  );
}

function readEmailHistoryCursor(
  value: unknown,
  scope: Pick<EmailHistoryCursor, "userId" | "agentId" | "accountId">,
): EmailHistoryCursor | null {
  if (value === undefined) return null;
  try {
    if (typeof value !== "string" || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const cursor = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as EmailHistoryCursor;
    if (
      cursor.v !== 1 ||
      cursor.userId !== scope.userId ||
      cursor.agentId !== scope.agentId ||
      cursor.accountId !== scope.accountId ||
      !validHistoryTimestamp(cursor.asOf) ||
      !validHistoryTimestamp(cursor.lastActivity) ||
      typeof cursor.lastId !== "string" ||
      !HISTORY_UUID.test(cursor.lastId) ||
      typeof cursor.maxMessageId !== "string" ||
      !/^\d{1,19}$/.test(cursor.maxMessageId) ||
      BigInt(cursor.maxMessageId) > 9_223_372_036_854_775_807n
    )
      throw new Error();
    return cursor;
  } catch {
    throw AppError.fromHttpStatus(400, "Email history cursor is invalid. Refresh the inbox.");
  }
}

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
      const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
      const scope = {
        userId: req.user.id,
        agentId: requestedAgentId,
        accountId: requestedAccountId,
      };
      const cursor = readEmailHistoryCursor(req.query.cursor, scope);
      const emptyPage = { threads: [], hasMore: false, nextCursor: null };
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

      // Freeze the message population as well as its event-time cutoff: mailbox
      // sync can insert old provider timestamps after this history traversal starts.
      // The watermark excludes those imports and new messages from page ordering.
      // This is a bounded event view, not an exported MVCC snapshot: a transaction
      // that allocated a lower message ID but commits later can still become visible.
      const snapshot =
        cursor ??
        (
          await drizzle
            .select({
              asOf: sql<string>`to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
              maxMessageId: sql<string>`coalesce(max(${schema.emailMessages.id}), 0)::text`,
            })
            .from(schema.emailMessages)
            .where(eq(schema.emailMessages.userId, req.user.id))
        )[0];
      if (!snapshot) throw new Error("Email history snapshot unavailable");
      const activity = sql`coalesce((
        select max(${schema.emailMessages.createdAt}) from ${schema.emailMessages}
        where ${schema.emailMessages.userId} = ${req.user.id}
          and ${schema.emailMessages.threadId} = ${schema.emailThreads.id}
          and ${schema.emailMessages.id} <= ${snapshot.maxMessageId}::bigint
          and ${schema.emailMessages.createdAt} <= ${snapshot.asOf}::timestamptz
      ), ${schema.emailThreads.createdAt}, 'epoch'::timestamptz)`;
      const threads = await drizzle
        .select({
          ...getTableColumns(schema.emailThreads),
          snapshotActivity: sql<string>`to_char((${activity}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(schema.emailThreads)
        .where(
          and(
            where,
            sql`coalesce(${schema.emailThreads.createdAt}, 'epoch'::timestamptz) <= ${snapshot.asOf}::timestamptz`,
            cursor
              ? sql`(${activity}, ${schema.emailThreads.id}) < (${cursor.lastActivity}::timestamptz, ${cursor.lastId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(activity), desc(schema.emailThreads.id))
        .limit(limit + 1);

      const page = (threads || []).slice(0, limit);
      const hasMore = threads.length > limit;
      const last = page.at(-1);
      const nextCursor =
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                ...scope,
                asOf: snapshot.asOf,
                maxMessageId: snapshot.maxMessageId,
                lastActivity: last.snapshotActivity,
                lastId: last.id,
              } satisfies EmailHistoryCursor),
            ).toString("base64url")
          : null;
      res.json({
        threads: mapObjectToSnake(
          page.map(({ snapshotActivity: _snapshotActivity, ...thread }) => thread),
        ),
        hasMore,
        nextCursor,
      });
    } catch (e: any) {
      rethrowIfAppError(e);
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

// Answer a conversation from the mailbox that received it. The operation key
// makes a retried or double-submitted reply send at most once.
router.post(
  "/api/emails/threads/:id/reply",
  authenticateUser,
  emailReplyRateLimiter,
  validateBody(emailThreadReplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const threadId = String(req.params.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) {
      throw AppError.notFound("Conversation not found.");
    }
    const result = await sendEmailThreadReply({
      userId: req.user.id,
      threadId,
      body: req.body.body,
      operationKey: req.body.operation_key,
    });
    touchNavCounts(req.user.id);
    res.json(result);
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
