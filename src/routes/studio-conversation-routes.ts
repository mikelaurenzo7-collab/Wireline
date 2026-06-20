import { Router, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { agentMutationRateLimit } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { findOwnedAgentId } from "../lib/agent-ownership";
import { getErrorMessage } from "../lib/server-utils";

const router = Router();
const LIMIT = 200;
const bodySchema = z.object({
  operatorContent: z.string().trim().min(1).max(6000),
  assistantContent: z.string().trim().min(1).max(6000),
});

async function requireOwnedAgent(agentId: string, userId: string) {
  if (!(await findOwnedAgentId(agentId, userId))) throw AppError.fromHttpStatus(404, "Agent not found.");
}

router.get("/api/agents/:id/studio/conversation", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.id;
    await requireOwnedAgent(agentId, req.user.id);
    const rows = await drizzle
      .select({
        id: schema.agentConversationMessages.id,
        role: schema.agentConversationMessages.role,
        content: schema.agentConversationMessages.content,
        createdAt: schema.agentConversationMessages.createdAt,
      })
      .from(schema.agentConversationMessages)
      .where(and(eq(schema.agentConversationMessages.agentId, agentId), eq(schema.agentConversationMessages.userId, req.user.id)))
      .orderBy(desc(schema.agentConversationMessages.createdAt), desc(schema.agentConversationMessages.id))
      .limit(LIMIT);
    res.json({
      messages: rows.reverse().map((row) => ({
        id: row.id.toString(),
        role: row.role === "operator" ? "user" : "assistant",
        content: row.content,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("studio conversation load failed", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to load Studio conversation");
  }
});

router.post(
  "/api/agents/:id/studio/conversation",
  authenticateUser,
  agentMutationRateLimit,
  validateBody(bodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const userId = req.user.id;
      await requireOwnedAgent(agentId, userId);
      await drizzle.transaction(async (tx) => {
        await tx.insert(schema.agentConversationMessages).values([
          { userId, agentId, role: "operator", content: req.body.operatorContent },
          { userId, agentId, role: "agent", content: req.body.assistantContent },
        ]);
        const stale = await tx
          .select({ id: schema.agentConversationMessages.id })
          .from(schema.agentConversationMessages)
          .where(and(eq(schema.agentConversationMessages.agentId, agentId), eq(schema.agentConversationMessages.userId, userId)))
          .orderBy(desc(schema.agentConversationMessages.createdAt), desc(schema.agentConversationMessages.id))
          .offset(LIMIT);
        if (stale.length) {
          await tx.delete(schema.agentConversationMessages).where(inArray(schema.agentConversationMessages.id, stale.map((row) => row.id)));
        }
      });
      res.status(201).json({ success: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("studio conversation append failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to save Studio conversation");
    }
  },
);

export default router;
