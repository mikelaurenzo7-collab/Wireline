import { Router, type RequestHandler, type Response } from "express";

import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { elevenLabsReadinessService } from "../lib/voice/elevenlabs-readiness";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const preventStatusCaching: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
const accountChecks = createRateLimiter({
  bucket: "api:elevenlabs-voice-status",
  windowMs: 60_000,
  max: 3,
  failClosedOnError: true,
});

function handleCheck(action: "status" | "verify") {
  return async (req: AuthenticatedRequest, res: Response) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) abort();
    };
    req.once("aborted", abort);
    res.once("close", close);
    if (req.aborted || res.destroyed) abort();
    try {
      // No request body or query value selects a key, workspace, tenant or operation.
      const status = await elevenLabsReadinessService[action](req.user, controller.signal);
      if (!controller.signal.aborted && !res.destroyed && !res.writableEnded) res.json(status);
    } finally {
      req.off("aborted", abort);
      res.off("close", close);
    }
  };
}

router.get(
  "/api/voice/elevenlabs/status",
  preventStatusCaching,
  authenticateUser,
  requirePlatformAdmin,
  accountChecks,
  handleCheck("status"),
);
router.post(
  "/api/voice/elevenlabs/verify",
  preventStatusCaching,
  authenticateUser,
  requirePlatformAdmin,
  accountChecks,
  handleCheck("verify"),
);

export default router;
