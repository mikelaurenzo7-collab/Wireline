import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.get("/api/emails/accounts", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accounts = await drizzle
      .select()
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.userId, req.user.id))
      .orderBy(desc(schema.emailAccounts.createdAt));

    res.json({ accounts: accounts || [] });
  } catch {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.patch("/api/emails/accounts/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
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
      .where(and(eq(schema.emailAccounts.id, req.params.id), eq(schema.emailAccounts.userId, req.user.id)));

    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to update email account assignment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update email account assignment" });
  }
});

router.get("/api/emails/threads", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const threads = await drizzle
      .select()
      .from(schema.emailThreads)
      .where(eq(schema.emailThreads.userId, req.user.id))
      .orderBy(desc(schema.emailThreads.lastMessageAt))
      .limit(100);

    res.json({ threads: threads || [] });
  } catch (e: any) { 
    log.error("Failed to load email threads", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to load email threads" }); 
  }
});

router.get("/api/emails/threads/:id/messages", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messages = await drizzle
      .select()
      .from(schema.emailMessages)
      .where(and(
        eq(schema.emailMessages.threadId, req.params.id as any), // threadId is uuid in schema, but req.params.id is string. drizzle handles conversion usually.
        eq(schema.emailMessages.userId, req.user.id)
      ))
      .orderBy(asc(schema.emailMessages.createdAt));

    res.json({ messages: messages || [] });
  } catch (e: any) { 
    log.error("Failed to load email messages", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to load email messages" }); 
  }
});

router.delete("/api/emails/accounts/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await drizzle
      .delete(schema.emailAccounts)
      .where(and(eq(schema.emailAccounts.id, req.params.id), eq(schema.emailAccounts.userId, req.user.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

export default router;
