import { Router, Response } from "express";
import { desc, eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { getTenantActivationStatus } from "../lib/tenant-activation";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";

const router = Router();

const activationRateLimit = createRateLimiter({
  bucket: "api:activation",
  windowMs: 60_000,
  max: 120,
});

router.get(
  "/api/activation/status",
  authenticateUser,
  activationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await getTenantActivationStatus(req.user.id);
      return res.json({ ok: true, ...status });
    } catch (error) {
      log.error("activation status failed", { error: getErrorMessage(error) });
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Activation status query failed",
      });
    }
  },
);

router.get(
  "/api/activation/nudge-status",
  authenticateUser,
  activationRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [status, agentRows, phoneRows] = await Promise.all([
        getTenantActivationStatus(req.user.id),
        drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id))
          .limit(1),
        drizzle
          .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, req.user.id))
          .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
          .limit(1),
      ]);

      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        ok: true,
        activated: status.activated,
        activatedAt: status.activatedAt,
        activationChannel: status.activationChannel,
        firstActivationCallId: status.firstActivationCallId,
        hasAgent: agentRows.length > 0,
        phoneNumber: phoneRows[0]?.phoneNumber ?? null,
      });
    } catch (error) {
      log.error("activation nudge status failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Activation reminder status query failed",
      });
    }
  },
);

export default router;
