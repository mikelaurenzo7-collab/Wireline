import { Router, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { authenticateUser } from "../middleware/auth";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * Tenant-safe call history for one owned agent.
 *
 * The global /api/calls endpoint intentionally stays partner-compatible. Agent
 * workspaces need a different invariant: filter by tenant + agent in Postgres
 * before LIMIT/OFFSET, otherwise a busy workspace can show an empty outcome
 * ledger simply because another agent owns the newest global rows.
 */
router.get(
  "/api/agents/:agentId/calls",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = String(req.params.agentId || "").trim();
      if (!agentId) throw AppError.fromHttpStatus(400, "Agent id is required");

      const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
      const offsetRaw = Number.parseInt(String(req.query.offset ?? ""), 10);
      const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

      const [agent] = await drizzle
        .select({ id: schema.agents.id, name: schema.agents.name })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

      const callScope = and(
        eq(schema.callLogs.userId, req.user.id),
        eq(schema.callLogs.agentId, agentId),
      );

      const [countResult] = await drizzle
        .select({ count: sql`count(*)` })
        .from(schema.callLogs)
        .where(callScope);
      const count = Number(countResult?.count ?? 0);

      const calls = await drizzle
        .select({
          id: schema.callLogs.id,
          userId: schema.callLogs.userId,
          vapiCallId: schema.callLogs.vapiCallId,
          agentId: schema.callLogs.agentId,
          direction: schema.callLogs.direction,
          customerNumber: schema.callLogs.customerNumber,
          durationSeconds: schema.callLogs.durationSeconds,
          cost: schema.callLogs.cost,
          summary: schema.callLogs.summary,
          transcript: schema.callLogs.transcript,
          recordingUrl: schema.callLogs.recordingUrl,
          leadScore: schema.callLogs.leadScore,
          intentLabel: schema.callLogs.intentLabel,
          sentiment: schema.callLogs.sentiment,
          coachingNote: schema.callLogs.coachingNote,
          outcomeTag: schema.callLogs.outcomeTag,
          campaignSource: schema.callLogs.campaignSource,
          demo: schema.callLogs.demo,
          createdAt: schema.callLogs.createdAt,
        })
        .from(schema.callLogs)
        .where(callScope)
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const safeCalls = (calls || []).map((call) => ({
        ...call,
        agentName: agent.name,
        recordingUrl: call.recordingUrl
          ? `/api/calls/${String(call.id)}/recording`
          : null,
      }));

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({
        calls: mapObjectToSnake(safeCalls),
        hasMore: offset + limit < count,
        total: count,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to fetch agent call history", {
        agentId: req.params.agentId,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to fetch agent call history");
    }
  },
);

export default router;
