import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.get("/api/emails/accounts", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: accounts, error } = await db.from('wireline_email_accounts')
                                               .select('*')
                                               .eq('user_id', req.user.id)
                                               .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ accounts: accounts || [] });
  } catch {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.patch("/api/emails/accounts/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agent_id } = req.body;

    // SECURITY: if assigning to an agent, verify it belongs to the caller.
    // Same class of bug as the phone-numbers endpoint — without this an
    // attacker could route their inbound email to another user's agent.
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    await db.from('wireline_email_accounts').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to update email account assignment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update email account assignment" });
  }
});

router.get("/api/emails/threads", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db.from("wireline_email_threads")
      .select("*")
      .eq("user_id", req.user.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ threads: data || [] });
  } catch (e: any) { 
    log.error("Failed to load email threads", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to load email threads" }); 
  }
});

router.get("/api/emails/threads/:id/messages", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db.from("wireline_email_messages")
      .select("*")
      .eq("thread_id", req.params.id)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (e: any) { 
    log.error("Failed to load email messages", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to load email messages" }); 
  }
});

router.delete("/api/emails/accounts/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.from('wireline_email_accounts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

export default router;
