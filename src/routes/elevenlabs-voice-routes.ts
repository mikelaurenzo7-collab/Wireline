import { Router, type RequestHandler } from "express";

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

router.get(
  "/api/voice/elevenlabs/status",
  preventStatusCaching,
  authenticateUser,
  requirePlatformAdmin,
  accountChecks,
  async (req: AuthenticatedRequest, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) abort();
    };
    req.once("aborted", abort);
    res.once("close", close);
    if (req.aborted || res.destroyed) abort();
    try {
      const status = await elevenLabsReadinessService.status(req.user, controller.signal);
      if (!controller.signal.aborted && !res.destroyed && !res.writableEnded) res.json(status);
    } finally {
      req.off("aborted", abort);
      res.off("close", close);
    }
  },
);

export default router;
