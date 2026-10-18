import { Router, type RequestHandler, type Response } from "express";

import { asyncHandler } from "../lib/api-error";
import { configuredPhoneVoiceProvider } from "../lib/voice/realtime-provider";
import {
  syncXAIPhoneRegistrations,
  xaiRegistrationStatus,
} from "../lib/voice/xai-phone-registration";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import type { AuthenticatedRequest } from "../types/auth";

/**
 * Platform-only controls for the xAI Grok Voice cutover: see which BotBound
 * numbers are registered with xAI, and register every assigned number that is
 * not yet. Responses carry phone suffixes only.
 */
const router = Router();
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
const registrationLimiter = createRateLimiter({
  bucket: "api:xai-voice-registrations",
  windowMs: 60_000,
  max: 3,
  failClosedOnError: true,
});

router.get(
  "/api/voice/xai/status",
  noStore,
  authenticateUser,
  requirePlatformAdmin,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      phoneVoiceProvider: configuredPhoneVoiceProvider(),
      ...(await xaiRegistrationStatus()),
    });
  }),
);

router.post(
  "/api/voice/xai/registrations/sync",
  noStore,
  authenticateUser,
  requirePlatformAdmin,
  registrationLimiter,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const { configured, results } = await syncXAIPhoneRegistrations();
    res.json({
      configured,
      results: results.map((result) => ({
        phoneSuffix: result.phoneNumber.slice(-4),
        status: result.status,
        ...(result.status === "failed" ? { reason: result.reason } : {}),
      })),
    });
  }),
);

export default router;
