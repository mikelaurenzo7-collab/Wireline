import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { asyncHandler } from "../lib/errors";
import { db } from "../lib/supabase";
import { settingsSchema, validate } from "../lib/validation";

const router = Router();

router.get(
  "/api/settings",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data } = await db
        .from("wireline_settings")
        .select("id, user_id, subscription_status, max_agents, vapi_phone_number_id, updated_at")
        .eq("user_id", req.user!.id)
        .maybeSingle();
      res.json(data || {});
    } catch {
      res.json({});
    }
  })
);

router.post(
  "/api/settings",
  authenticateUser,
  validate(settingsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { vapi_phone_number_id, subscription_status, max_agents } = req.body;
      await db.from("wireline_settings").upsert(
        {
          id: req.user!.id,
          user_id: req.user!.id,
          vapi_phone_number_id: vapi_phone_number_id || null,
          subscription_status,
          max_agents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  })
);

export default router;
