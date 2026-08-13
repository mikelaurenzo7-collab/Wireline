import { Router, type Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { ACTIVE_OPERATOR_TASK_STATUSES } from "../lib/operator-work-status";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const MAX_DAY_BOUNDARY_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const HIGH_INTENT_SCORE = 75;
const RECENT_CONVERSATION_LIMIT = 4;

/**
 * Exact, lightweight Home KPIs.
 *
 * Home is an operating surface, not an analytics sample. These counts therefore
 * come from aggregate queries rather than `/api/dashboard/stats`, whose recent
 * call rows are intentionally capped for payload and analysis work. A customer
 * conversation is a voice call or an email/SMS thread active during the user's
 * local day; the endpoint returns counts only, never conversation contents.
 */
router.get(
  "/api/overview/operating-metrics",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sinceRaw = String(req.query.since ?? "").trim();
      const since = new Date(sinceRaw);
      const sinceMs = since.getTime();
      const now = Date.now();
      if (
        !sinceRaw ||
        !Number.isFinite(sinceMs) ||
        sinceMs > now + MAX_CLOCK_SKEW_MS ||
        sinceMs < now - MAX_DAY_BOUNDARY_AGE_MS
      ) {
        throw AppError.fromHttpStatus(400, "A valid local day boundary is required");
      }

      const userId = req.user.id;
      const [
        [callResult],
        [emailResult],
        [smsResult],
        [appointmentResult],
        [workResult],
      ] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              conversationsToday: sql`count(*)`,
              highIntentToday: sql`count(*) filter (where ${schema.callLogs.leadScore} >= ${HIGH_INTENT_SCORE})`,
            })
            .from(schema.callLogs)
            .where(and(eq(schema.callLogs.userId, userId), gte(schema.callLogs.createdAt, since))),
          tx
            .select({
              conversationsToday: sql`count(*)`,
              highIntentToday: sql`count(*) filter (where ${schema.emailThreads.leadScore} >= ${HIGH_INTENT_SCORE})`,
            })
            .from(schema.emailThreads)
            .where(
              and(
                eq(schema.emailThreads.userId, userId),
                gte(schema.emailThreads.lastMessageAt, since),
              ),
            ),
          tx
            .select({ count: sql`count(*)` })
            .from(schema.smsThreads)
            .where(
              and(eq(schema.smsThreads.userId, userId), gte(schema.smsThreads.lastMessageAt, since)),
            ),
          tx
            .select({ count: sql`count(*)` })
            .from(schema.appointments)
            .where(eq(schema.appointments.userId, userId)),
          tx
            .select({ count: sql`count(*)` })
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, userId),
                inArray(schema.followUpTasks.status, [...ACTIVE_OPERATOR_TASK_STATUSES]),
              ),
            ),
        ]),
      );

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({
        conversationsToday:
          Number(callResult?.conversationsToday ?? 0) +
          Number(emailResult?.conversationsToday ?? 0) +
          Number(smsResult?.count ?? 0),
        highIntentToday:
          Number(callResult?.highIntentToday ?? 0) + Number(emailResult?.highIntentToday ?? 0),
        appointmentsBooked: Number(appointmentResult?.count ?? 0),
        activeWork: Number(workResult?.count ?? 0),
        since: since.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Overview operating metrics failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Home metrics are temporarily unavailable");
    }
  },
);

/**
 * Lightweight omnichannel recents for Home.
 *
 * The legacy dashboard aggregate reads hundreds of call/analytics rows. Home
 * only needs a four-row operating glance, so read the newest four candidates
 * per customer channel, merge them in memory, and return bounded metadata only.
 * Message bodies, transcripts, recordings, and provider payloads stay out of
 * this response.
 */
router.get(
  "/api/overview/recent-conversations",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const [calls, emails, smsThreads] = await drizzle.transaction((tx) =>
        serialQueryBatch([
          tx
            .select({
              id: schema.callLogs.id,
              contact: schema.callLogs.customerNumber,
              summary: schema.callLogs.summary,
              occurredAt: schema.callLogs.createdAt,
              durationSeconds: schema.callLogs.durationSeconds,
              agentName: schema.agents.name,
            })
            .from(schema.callLogs)
            .leftJoin(
              schema.agents,
              and(
                eq(schema.callLogs.agentId, schema.agents.id),
                eq(schema.agents.userId, userId),
              ),
            )
            .where(eq(schema.callLogs.userId, userId))
            .orderBy(desc(schema.callLogs.createdAt))
            .limit(RECENT_CONVERSATION_LIMIT),
          tx
            .select({
              id: schema.emailThreads.id,
              contact: schema.emailThreads.customerEmail,
              headline: schema.emailThreads.subject,
              summary: schema.emailThreads.summary,
              occurredAt: schema.emailThreads.lastMessageAt,
              createdAt: schema.emailThreads.createdAt,
              agentName: schema.agents.name,
            })
            .from(schema.emailThreads)
            .leftJoin(
              schema.agents,
              and(
                eq(schema.emailThreads.agentId, schema.agents.id),
                eq(schema.agents.userId, userId),
              ),
            )
            .where(eq(schema.emailThreads.userId, userId))
            .orderBy(
              desc(sql`coalesce(${schema.emailThreads.lastMessageAt}, ${schema.emailThreads.createdAt})`),
            )
            .limit(RECENT_CONVERSATION_LIMIT),
          tx
            .select({
              id: schema.smsThreads.id,
              contact: schema.smsThreads.customerNumber,
              summary: schema.smsThreads.summary,
              occurredAt: schema.smsThreads.lastMessageAt,
              createdAt: schema.smsThreads.createdAt,
              agentName: schema.agents.name,
            })
            .from(schema.smsThreads)
            .leftJoin(
              schema.agents,
              and(
                eq(schema.smsThreads.agentId, schema.agents.id),
                eq(schema.agents.userId, userId),
              ),
            )
            .where(eq(schema.smsThreads.userId, userId))
            .orderBy(
              desc(sql`coalesce(${schema.smsThreads.lastMessageAt}, ${schema.smsThreads.createdAt})`),
            )
            .limit(RECENT_CONVERSATION_LIMIT),
        ]),
      );

      const recent = [
        ...calls.map((row) => ({
          id: String(row.id),
          channel: "voice" as const,
          contact: row.contact || "Unknown caller",
          headline: null,
          summary: row.summary || null,
          occurred_at: row.occurredAt?.toISOString() || null,
          duration_seconds: row.durationSeconds ?? null,
          agent_name: row.agentName || null,
        })),
        ...emails.map((row) => ({
          id: String(row.id),
          channel: "email" as const,
          contact: row.contact || "Unknown sender",
          headline: row.headline || null,
          summary: row.summary || null,
          occurred_at: (row.occurredAt || row.createdAt)?.toISOString() || null,
          duration_seconds: null,
          agent_name: row.agentName || null,
        })),
        ...smsThreads.map((row) => ({
          id: String(row.id),
          channel: "sms" as const,
          contact: row.contact || "Unknown number",
          headline: null,
          summary: row.summary || null,
          occurred_at: (row.occurredAt || row.createdAt)?.toISOString() || null,
          duration_seconds: null,
          agent_name: row.agentName || null,
        })),
      ]
        .filter((row) => Boolean(row.occurred_at))
        .sort(
          (a, b) =>
            Date.parse(b.occurred_at || "") - Date.parse(a.occurred_at || ""),
        )
        .slice(0, RECENT_CONVERSATION_LIMIT);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({ conversations: recent });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Overview recent conversations failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Recent conversations are temporarily unavailable");
    }
  },
);

export default router;
