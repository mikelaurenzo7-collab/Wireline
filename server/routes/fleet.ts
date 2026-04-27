import { Router, type Response } from "express";
import { z } from "zod";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { asyncHandler } from "../lib/errors";
import { db } from "../lib/supabase";
import { fleetTaskSchema, validate } from "../lib/validation";

const router = Router();

const updateFleetTaskSchema = z
  .object({
    status: z.string().trim().min(1).max(60),
  })
  .strict();

router.get(
  "/api/fleet/tasks",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data, error } = await db
        .from("wireline_fleet_tasks")
        .select("*, wireline_agents(name)")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ tasks: data || [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch fleet tasks" });
    }
  })
);

router.post(
  "/api/fleet/tasks",
  authenticateUser,
  validate(fleetTaskSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { source_type, source_id, target_channel, customer_info, task_type, description, agent_id } =
        req.body;
      await db.from("wireline_fleet_tasks").insert({
        source_type,
        source_id,
        target_channel,
        customer_info,
        task_type,
        description,
        agent_id,
        status: "pending",
        user_id: req.user!.id,
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to create fleet task" });
    }
  })
);

router.patch(
  "/api/fleet/tasks/:id",
  authenticateUser,
  validate(updateFleetTaskSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      await db
        .from("wireline_fleet_tasks")
        .update({ status })
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update task status" });
    }
  })
);

export default router;
