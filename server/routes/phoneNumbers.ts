import { Router, type Response } from "express";
import { z } from "zod";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { env } from "../lib/env";
import { asyncHandler } from "../lib/errors";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";
import { phoneNumberSchema, validate } from "../lib/validation";

const router = Router();

const createPhoneNumberSchema = z
  .object({
    phone_number: phoneNumberSchema,
    vapi_number_id: z.string().trim().min(1).max(200),
  })
  .strict();

const updatePhoneAssignmentSchema = z
  .object({
    agent_id: z.string().trim().min(1).max(200).nullish(),
  })
  .strict();

router.get(
  "/api/phone-numbers",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data, error } = await db
        .from("wireline_phone_numbers")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ numbers: data || [] });
    } catch {
      res.json({ numbers: [] });
    }
  })
);

router.post(
  "/api/phone-numbers",
  authenticateUser,
  validate(createPhoneNumberSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { phone_number, vapi_number_id } = req.body;
      await db
        .from("wireline_phone_numbers")
        .insert({ phone_number, vapi_number_id, user_id: req.user!.id });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to add phone number" });
    }
  })
);

router.patch(
  "/api/phone-numbers/:id",
  authenticateUser,
  validate(updatePhoneAssignmentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_id } = req.body;
      await db
        .from("wireline_phone_numbers")
        .update({ agent_id })
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update phone number assignment" });
    }
  })
);

router.get(
  "/api/carrier/numbers",
  authenticateUser,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const vapiSecret = env.VAPI_PRIVATE_KEY;
      if (!vapiSecret) return res.json({ numbers: [] });

      const response = await fetch("https://api.vapi.ai/phone-number", {
        headers: { Authorization: `Bearer ${vapiSecret}` },
      });
      const data = await response.json();

      const formatted = (data || []).map((num: { id: string; number: string; provider: string }) => ({
        id: num.id,
        number: num.number,
        provider: num.provider,
      }));

      res.json({ numbers: formatted });
    } catch (error) {
      logger.error({ err: error }, "Vapi sync error");
      res.json({ numbers: [] });
    }
  })
);

export default router;
