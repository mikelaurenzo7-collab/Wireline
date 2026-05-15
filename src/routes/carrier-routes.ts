import { Router, Request, Response, NextFunction } from "express";
import { log, fetchWithTimeout, drizzle, requirePermission } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { timingSafeEq } from "../lib/vapi-helpers";
import { provisionVapiPhoneLineForUser } from "../lib/vapi-phone-provision";
import { rateLimit } from "../lib/rate-limit.js";

interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
}

const router = Router();

function authenticateWirelinePlatformSecret(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.WIRELINE_PLATFORM_SECRET?.trim();
  if (!configured) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const raw = req.headers["x-wireline-platform-secret"];
  const provided = typeof raw === "string" ? raw.trim() : "";
  if (!timingSafeEq(provided, configured)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

async function rateLimitPlatformProvision(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const key = req.ip || "unknown";
    const hit = await rateLimit(`prov:${key}`, {
      bucket: "api:internal-phone-provision",
      windowMs: 15 * 60 * 1000,
      max: 40,
    });
    if (!hit.allowed) {
      res.status(429).json({ error: "Too many provisioning attempts from this address." });
      return;
    }
  } catch {
    /* fail-open on limiter errors */
  }
  next();
}

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
router.get(
  "/api/phone-numbers",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await drizzle
        .select()
        .from(schema.phoneNumbers)
        .where(eq(schema.phoneNumbers.userId, req.user.id))
        .orderBy(desc(schema.phoneNumbers.createdAt));

      res.json({ numbers: data || [] });
    } catch {
      res.json({ numbers: [] });
    }
  },
);

router.post(
  "/api/phone-numbers",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { phone_number, vapi_number_id } = req.body;
      await drizzle.insert(schema.phoneNumbers).values({
        phoneNumber: phone_number,
        vapiNumberId: vapi_number_id,
        userId: req.user.id,
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to add phone number" });
    }
  },
);

router.post(
  "/api/phone-numbers/provision-vapi",
  authenticateUser,
  requirePermission("settings.manage"),
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const rawAgent = req.body?.agent_id;
    const agent_id =
      typeof rawAgent === "string"
        ? rawAgent.trim()
        : rawAgent === null || rawAgent === ""
          ? null
          : undefined;
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    const result = await provisionVapiPhoneLineForUser({
      userId: req.user.id,
      agentId: agent_id ?? null,
      name: name ?? null,
    });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({
      success: true,
      phone_number: result.phone_number,
      vapi_number_id: result.vapi_number_id,
      id: result.db_id,
    });
  },
);

router.post(
  "/api/internal/tenant-phone/provision",
  authenticateWirelinePlatformSecret,
  rateLimitPlatformProvision,
  async (req: Request, res: Response) => {
    const target_user_id =
      typeof req.body?.target_user_id === "string" ? req.body.target_user_id.trim() : "";
    if (!target_user_id) {
      res.status(400).json({ error: "target_user_id is required." });
      return;
    }
    const rawAgent = req.body?.agent_id;
    const agent_id =
      typeof rawAgent === "string"
        ? rawAgent.trim()
        : rawAgent === null || rawAgent === ""
          ? null
          : null;
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;

    const result = await provisionVapiPhoneLineForUser({
      userId: target_user_id,
      agentId: agent_id,
      name: name ?? null,
    });
    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({
      success: true,
      phone_number: result.phone_number,
      vapi_number_id: result.vapi_number_id,
      id: result.db_id,
    });
  },
);

router.patch(
  "/api/phone-numbers/:id",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
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
        .update(schema.phoneNumbers)
        .set({ agentId: agent_id })
        .where(
          and(
            eq(schema.phoneNumbers.id, BigInt(req.params.id)),
            eq(schema.phoneNumbers.userId, req.user.id),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to update phone number assignment", { error: getErrorMessage(error) });
      res.status(500).json({ error: "Failed to update phone number assignment" });
    }
  },
);

router.delete(
  "/api/phone-numbers/:id",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.id, BigInt(req.params.id)),
            eq(schema.phoneNumbers.userId, req.user.id),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to delete phone number", { error: getErrorMessage(error) });
      res.status(500).json({ error: "Failed to delete phone number." });
    }
  },
);

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
router.get(
  "/api/carrier/numbers",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const vapiSecret = process.env.VAPI_PRIVATE_KEY;
      if (!vapiSecret) return res.json({ numbers: [] });

      const response = await fetchWithTimeout(
        "https://api.vapi.ai/phone-number",
        {
          headers: { Authorization: `Bearer ${vapiSecret}` },
        },
        15_000,
      );
      const data = (await response.json()) as VapiPhoneNumber[];

      // The Vapi response is usually an array of phone number objects
      const formatted = (data || []).map((num: VapiPhoneNumber) => ({
        id: num.id,
        number: num.number,
        provider: num.provider,
      }));

      res.json({ numbers: formatted });
    } catch (error: any) {
      log.error("Vapi sync error", { error: getErrorMessage(error) });
      res.json({ numbers: [] });
    }
  },
);

export default router;
