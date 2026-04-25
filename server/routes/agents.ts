import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/errors";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";
import {
  agentConfigManualSchema,
  createAgentSchema,
  updateAgentSchema,
  validate,
} from "../lib/validation";

const router = Router();

router.get(
  "/api/agents",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: agents } = await db
        .from("wireline_agents")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });
      res.json({ agents: agents || [] });
    } catch {
      res.json({ agents: [] });
    }
  })
);

router.post(
  "/api/agents",
  authenticateUser,
  validate(createAgentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const { data: userSettings } = await db
      .from("wireline_settings")
      .select("subscription_status, max_agents")
      .eq("user_id", userId)
      .single();

    const subscriptionStatus = userSettings?.subscription_status || "active";
    if (subscriptionStatus !== "active") {
      throw AppError.forbidden("Access Denied: Please upgrade your billing plan.");
    }

    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db
      .from("wireline_agents")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (agentCount !== null && agentCount >= maxAgents) {
      throw AppError.forbidden(`Quota Exceeded: Your plan only allows ${maxAgents} agents.`);
    }

    const { id, name, voice_id, channel } = req.body;
    const agentId = id || randomUUID();
    await db.from("wireline_agents").insert({
      id: agentId,
      user_id: userId,
      name,
      voice_id: voice_id || "bIHbv24MWmeRgasZH58o",
      channel,
    });

    await db.from("wireline_personality").insert({
      agent_id: agentId,
      user_id: userId,
      content:
        channel === "email"
          ? "You are a professional email agent specialized in clear, efficient communication."
          : "You are a helpful assistant serving as a phone agent.",
    });

    res.json({ success: true, id: agentId });
  })
);

router.put(
  "/api/agents/:id",
  authenticateUser,
  validate(updateAgentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await db
      .from("wireline_agents")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", req.user!.id);
    res.json({ success: true });
  })
);

router.get(
  "/api/agent-config/:id",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const userId = req.user!.id;
      const [directives, knowledge, personality] = await Promise.all([
        db
          .from("wireline_directives")
          .select("*")
          .eq("agent_id", agentId)
          .eq("user_id", userId)
          .order("priority", { ascending: false }),
        db.from("wireline_knowledge").select("*").eq("agent_id", agentId).eq("user_id", userId),
        db
          .from("wireline_personality")
          .select("content")
          .eq("agent_id", agentId)
          .eq("user_id", userId)
          .single(),
      ]);
      res.json({
        directives: directives.data || [],
        knowledge: knowledge.data || [],
        personality: personality.data?.content || "",
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch config" });
    }
  })
);

router.post(
  "/api/agent-config/:id/manual",
  authenticateUser,
  validate(agentConfigManualSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.params.id;
      const { type, content, overrideId } = req.body;
      const userId = req.user!.id;

      if (type === "personality") {
        await db
          .from("wireline_personality")
          .upsert({ agent_id: agentId, content, user_id: userId });
      } else if (type === "directive") {
        if (overrideId) {
          await db
            .from("wireline_directives")
            .update({ content })
            .eq("id", overrideId)
            .eq("user_id", userId);
        } else {
          await db
            .from("wireline_directives")
            .insert({ agent_id: agentId, content, priority: 5, user_id: userId });
        }
      } else if (type === "knowledge") {
        if (overrideId) {
          await db
            .from("wireline_knowledge")
            .update({ content })
            .eq("id", overrideId)
            .eq("user_id", userId);
        } else {
          await db
            .from("wireline_knowledge")
            .insert({ agent_id: agentId, content, user_id: userId });
        }
      }

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Manual config error");
      res.status(500).json({ error: "Failed to update" });
    }
  })
);

router.delete(
  "/api/agent-config/:id/:type/:rowId",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type, rowId } = req.params;
      const userId = req.user!.id;
      if (type === "directive")
        await db.from("wireline_directives").delete().eq("id", rowId).eq("user_id", userId);
      if (type === "knowledge")
        await db.from("wireline_knowledge").delete().eq("id", rowId).eq("user_id", userId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete" });
    }
  })
);

export default router;
