import { Router, type Request, type Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { requireFounderCockpit } from "../middleware/require-founder-cockpit";
import { getOperatingCockpitPayload } from "../lib/operating-cockpit";
import { evaluateLaunchReadiness } from "../lib/launch-readiness";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

const router = Router();

router.get(
  "/api/founder/cockpit",
  authenticateUser,
  requireFounderCockpit,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as Request & { user: { id: string } }).user.id;
      const payload = await getOperatingCockpitPayload(String(userId));
      return res.json(payload);
    } catch (e) {
      log.error("founder-cockpit failed", { error: getErrorMessage(e) });
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Operating cockpit query failed",
      });
    }
  },
);

router.get(
  "/api/founder/launch-readiness",
  authenticateUser,
  requireFounderCockpit,
  (_req: Request, res: Response) => {
    return res.json({ ok: true, ...evaluateLaunchReadiness() });
  },
);

export default router;
