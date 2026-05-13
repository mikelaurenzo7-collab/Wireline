import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { parseFormData, KnowledgeSchema } from "../lib/form-validators";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

interface AgentRef {
  id: string;
  name: string;
  archetype: string | null;
}

interface KnowledgeRow {
  id: number;
  agent_id: string;
  content: string;
  created_at: string;
}

const router = Router();

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE MANAGER — cross-agent view of every fact in
//  wireline_knowledge. Agents accumulate knowledge from URL/PDF
//  ingest, agent-forge seed, and per-agent manual entry; this is
//  the centralized place to audit, edit, and prune.
// ──────────────────────────────────────────────────────────

router.get("/api/knowledge", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [{ data: rows, error }, { data: agents }] = await Promise.all([
      db.from("wireline_knowledge")
        .select("id, agent_id, content, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(2000),
      db.from("wireline_agents")
        .select("id, name, archetype")
        .eq("user_id", req.user.id),
    ]);
    if (error) throw error;
    const agentMap = new Map((agents || []).map((a: AgentRef) => [a.id, a]));
    const knowledge = (rows || []).map((r: KnowledgeRow) => {
      const agent = agentMap.get(r.agent_id) as AgentRef | undefined;
      return {
        id: r.id,
        agent_id: r.agent_id,
        agent_name: agent?.name || "(unknown agent)",
        agent_archetype: agent?.archetype || null,
        content: r.content,
        created_at: r.created_at,
      };
    });
    res.json({
      knowledge,
      agents: (agents || []).map((a: AgentRef) => ({ id: a.id, name: a.name, archetype: a.archetype })),
      total: knowledge.length,
    });
  } catch (e: any) { 
    log.error("Failed to load knowledge", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to load knowledge" }); 
  }
});

router.post("/api/knowledge", authenticateUser, rateLimiters.knowledgeRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(KnowledgeSchema, {
      content: req.body.content
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    if (!validation.data) throw new Error('Validation data missing');

    const content = validation.data.content;
    const agent_id = (req.body?.agent_id || "").toString();
    if (!agent_id) return res.status(400).json({ error: "agent_id is required" });

    // Confirm the agent belongs to this user before insert.
    const { data: agent } = await db.from("wireline_agents")
      .select("id, name, archetype")
      .eq("id", agent_id).eq("user_id", req.user.id).maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const { data, error } = await db.from("wireline_knowledge")
      .insert({
        agent_id,
        user_id: req.user.id,
        content,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, knowledge: data });
  } catch (e: any) { 
    log.error("Failed to add knowledge", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to add knowledge" }); 
  }
});

router.patch("/api/knowledge/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: "content is required" });
    }
    const { data, error } = await db.from("wireline_knowledge")
      .update({ content: content.trim() })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ success: true, knowledge: data });
  } catch (e: any) { 
    log.error("Failed to update knowledge", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to update knowledge" }); 
  }
});

router.delete("/api/knowledge/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await db.from("wireline_knowledge")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) { 
    log.error("Failed to delete knowledge", { error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to delete knowledge" }); 
  }
});

export default router;
