import { Router, Request, Response, NextFunction } from "express";
import { db, log, fetchWithTimeout } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
}

const router = Router();

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
router.get("/api/phone-numbers", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db.from('wireline_phone_numbers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch {
    res.json({ numbers: [] });
  }
});

router.post("/api/phone-numbers", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone_number, vapi_number_id } = req.body;
    await db.from('wireline_phone_numbers').insert({ phone_number, vapi_number_id, user_id: req.user.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

router.patch("/api/phone-numbers/:id", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agent_id } = req.body;

    // SECURITY: if assigning to an agent, verify it belongs to the caller.
    // Without this, a user could route their inbound calls to another
    // user's agent — billing/usage attribution would land on the agent
    // owner, not the phone number owner.
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    await db.from('wireline_phone_numbers').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Failed to update phone number assignment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update phone number assignment" });
  }
});

router.delete("/api/phone-numbers/:id", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await db.from('wireline_phone_numbers')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Failed to delete phone number", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete phone number." });
  }
});

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
router.get("/api/carrier/numbers", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const vapiSecret = process.env.VAPI_PRIVATE_KEY;
    if (!vapiSecret) return res.json({ numbers: [] });

    const response = await fetchWithTimeout("https://api.vapi.ai/phone-number", {
      headers: { "Authorization": `Bearer ${vapiSecret}` }
    }, 15_000);
    const data = await response.json() as VapiPhoneNumber[];
    
    // The Vapi response is usually an array of phone number objects
    const formatted = (data || []).map((num: VapiPhoneNumber) => ({
      id: num.id,
      number: num.number,
      provider: num.provider
    }));

    res.json({ numbers: formatted });
  } catch (error: unknown) {
    log.error("Vapi sync error", { error: getErrorMessage(error) });
    res.json({ numbers: [] });
  }
});

export default router;
