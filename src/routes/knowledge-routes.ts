/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, parseBigIntId } from "../lib/server-utils";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { validateBody, addKnowledgeSchema, updateKnowledgeSchema } from "../lib/api-validation";

const router = Router();

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE MANAGER — cross-agent view of every fact in
//  wireline_knowledge. Agents accumulate knowledge from URL/PDF
//  ingest, agent-wire seed, and per-agent manual entry; this is
//  the centralized place to audit, edit, and prune.
// ──────────────────────────────────────────────────────────

router.get(
  "/api/knowledge",
  authenticateUser,
  async (req: AuthenticatedRequest<any, any, any>, res: Response) => {
    try {
      const [rows, agents] = await Promise.all([
        drizzle
          .select({
            id: schema.knowledge.id,
            agentId: schema.knowledge.agentId,
            content: schema.knowledge.content,
            createdAt: schema.knowledge.createdAt,
          })
          .from(schema.knowledge)
          .where(eq(schema.knowledge.userId, req.user.id))
          .orderBy(desc(schema.knowledge.createdAt))
          .limit(2000),
        drizzle
          .select({
            id: schema.agents.id,
            name: schema.agents.name,
            archetype: schema.agents.archetype,
          })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id)),
      ]);

      const agentMap = new Map((agents || []).map((a: any) => [a.id, a]));
      const knowledge = (rows || []).map((r: any) => {
        const agent = agentMap.get(r.agentId) as any;
        return {
          id: Number(r.id),
          agent_id: r.agentId,
          agent_name: agent?.name || "(unknown agent)",
          agent_archetype: agent?.archetype || null,
          content: (r as any).content,
          created_at: r.createdAt,
        };
      });
      res.json({
        knowledge,
        agents: (agents || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          archetype: a.archetype,
        })),
        total: knowledge.length,
      });
    } catch (e: any) {
      log.error("Failed to load knowledge", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load knowledge");
    }
  },
);

router.post(
  "/api/knowledge",
  authenticateUser,
  rateLimiters.knowledgeRateLimiter,
  validateBody(addKnowledgeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content, agent_id } = req.body;

      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
        .limit(1);

      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");

      const [data] = (await drizzle
        .insert(schema.knowledge)
        .values({
          agentId: agent_id,
          userId: req.user.id,
          content,
        })
        .returning()) as any[];

      res.json({ success: true, knowledge: data });
    } catch (e: any) {
      // Deliberate 400/404s are thrown inside the try block; without this they
      // are caught here and reported as a 500, so a caller sees a server fault
      // for what the handler already identified as a client error.
      rethrowIfAppError(e);
      log.error("Failed to add knowledge", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to add knowledge");
    }
  },
);

router.patch(
  "/api/knowledge/:id",
  authenticateUser,
  validateBody(updateKnowledgeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content } = req.body;

      const knowledgeId = parseBigIntId(req.params.id);
      if (knowledgeId === null) {
        throw AppError.fromHttpStatus(400, "Knowledge id must be a positive integer");
      }

      const [data] = (await drizzle
        .update(schema.knowledge)
        .set({ content: content.trim() })
        .where(and(eq(schema.knowledge.id, knowledgeId), eq(schema.knowledge.userId, req.user.id)))
        .returning()) as any[];

      // Without this the handler answered `success: true` with an undefined
      // record for an id the caller does not own or that no longer exists.
      if (!data) throw AppError.fromHttpStatus(404, "Knowledge not found");

      res.json({ success: true, knowledge: data });
    } catch (e: any) {
      // Deliberate 400/404s are thrown inside the try block; without this they
      // are caught here and reported as a 500, so a caller sees a server fault
      // for what the handler already identified as a client error.
      rethrowIfAppError(e);
      log.error("Failed to update knowledge", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update knowledge");
    }
  },
);

router.delete(
  "/api/knowledge/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const knowledgeId = parseBigIntId(req.params.id);
      if (knowledgeId === null) {
        throw AppError.fromHttpStatus(400, "Knowledge id must be a positive integer");
      }

      const deleted = (await drizzle
        .delete(schema.knowledge)
        .where(and(eq(schema.knowledge.id, knowledgeId), eq(schema.knowledge.userId, req.user.id)))
        .returning()) as unknown[];

      if (!deleted.length) throw AppError.fromHttpStatus(404, "Knowledge not found");

      res.json({ success: true });
    } catch (e: any) {
      // Deliberate 400/404s are thrown inside the try block; without this they
      // are caught here and reported as a 500, so a caller sees a server fault
      // for what the handler already identified as a client error.
      rethrowIfAppError(e);
      log.error("Failed to delete knowledge", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to delete knowledge");
    }
  },
);

export default router;
