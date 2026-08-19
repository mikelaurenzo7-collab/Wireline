import { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { drizzle, log, serialQueryBatch } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import { dashboardRateLimit } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

function requestedLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

/**
 * Metadata-only omnichannel inbox feed.
 *
 * The list intentionally excludes message bodies, transcripts, recordings, and
 * provider payloads. A row is a compact index; the detail/report is requested
 * only when the user opens it. This keeps the high-frequency Inbox surface
 * fast and keeps Home free of generated prose.
 */
router.get(
  "/api/inbox/recent",
  authenticateUser,
  dashboardRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const limit = requestedLimit(req.query.limit);
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
              and(eq(schema.callLogs.agentId, schema.agents.id), eq(schema.agents.userId, userId)),
            )
            .where(eq(schema.callLogs.userId, userId))
            .orderBy(desc(schema.callLogs.createdAt))
            .limit(limit),
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
              and(eq(schema.emailThreads.agentId, schema.agents.id), eq(schema.agents.userId, userId)),
            )
            .where(eq(schema.emailThreads.userId, userId))
            .orderBy(
              desc(sql`coalesce(${schema.emailThreads.lastMessageAt}, ${schema.emailThreads.createdAt})`),
            )
            .limit(limit),
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
              and(eq(schema.smsThreads.agentId, schema.agents.id), eq(schema.agents.userId, userId)),
            )
            .where(eq(schema.smsThreads.userId, userId))
            .orderBy(
              desc(sql`coalesce(${schema.smsThreads.lastMessageAt}, ${schema.smsThreads.createdAt})`),
            )
            .limit(limit),
        ]),
      );

      const conversations = [
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
          (a, b) => Date.parse(b.occurred_at || "") - Date.parse(a.occurred_at || ""),
        )
        .slice(0, limit);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.json({ conversations });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Inbox recent conversations failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Inbox is temporarily unavailable");
    }
  },
);

export default router;
