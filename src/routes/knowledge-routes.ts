/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, KnowledgeSchema } from "../lib/form-validators";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE MANAGER — cross-agent view of every fact in
//  wireline_knowledge. Agents accumulate knowledge from URL/PDF
//  ingest, agent-forge seed, and per-agent manual entry; this is
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
      res.status(500).json({ error: "Failed to load knowledge" });
    }
  },
);

router.post(
  "/api/knowledge",
  authenticateUser,
  rateLimiters.knowledgeRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate input using Zod schema
      const validation = parseFormData(KnowledgeSchema, {
        content: req.body.content,
      });

      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", errors: validation.errors });
      }
      if (!validation.data) throw new Error("Validation data missing");

      const content = (validation.data as any).content;
      const agent_id = (req.body?.agent_id || "").toString();
      if (!agent_id) return res.status(400).json({ error: "agent_id is required" });

      const [agent] = await drizzle
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
        .limit(1);

      if (!agent) return res.status(404).json({ error: "Agent not found." });

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
      log.error("Failed to add knowledge", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to add knowledge" });
    }
  },
);

router.patch(
  "/api/knowledge/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required" });
      }

      const [data] = (await drizzle
        .update(schema.knowledge)
        .set({ content: content.trim() })
        .where(
          and(
            eq(schema.knowledge.id, BigInt(req.params.id)),
            eq(schema.knowledge.userId, req.user.id),
          ),
        )
        .returning()) as any[];

      res.json({ success: true, knowledge: data });
    } catch (e: any) {
      log.error("Failed to update knowledge", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to update knowledge" });
    }
  },
);

router.delete(
  "/api/knowledge/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.knowledge)
        .where(
          and(
            eq(schema.knowledge.id, BigInt(req.params.id)),
            eq(schema.knowledge.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (e: any) {
      log.error("Failed to delete knowledge", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to delete knowledge" });
    }
  },
);

export default router;
