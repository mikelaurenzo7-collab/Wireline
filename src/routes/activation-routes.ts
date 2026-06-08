import { Router, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { getTenantActivationStatus } from "../lib/tenant-activation";
import { getErrorMessage } from "../lib/server-utils";
import { log } from "../lib/server-context";

const router = Router();

const activationRateLimit = createRateLimiter({ windowMs: 60_000, max: 120 });

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

export default router;
