import { Router, type RequestHandler, type Response } from "express";

import { eq } from "drizzle-orm";

import { phoneNumbers } from "../db/schema";
import { AppError, asyncHandler } from "../lib/api-error";
import { drizzle } from "../lib/server-context";
import {
  FALLBACK_DRILL_MODES,
  armFallbackDrill,
  isFallbackDrillMode,
} from "../lib/voice/fallback-drill";
import { normalizeOpenAIPhoneNumber } from "../lib/voice/openai-sip-config";
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

/**
 * Arm a one-shot fallback drill on one BotBound number: the next inbound call
 * to it (within 15 minutes) takes the chosen fallback path. No env change.
 */
router.post(
  "/api/voice/xai/fallback-drill",
  noStore,
  authenticateUser,
  requirePlatformAdmin,
  registrationLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const phoneNumber = normalizeOpenAIPhoneNumber(req.body?.phoneNumber);
    const mode = req.body?.mode;
    if (!phoneNumber || !isFallbackDrillMode(mode)) {
      throw AppError.badRequest(
        `Send a BotBound phoneNumber and a mode: ${FALLBACK_DRILL_MODES.join(", ")}.`,
      );
    }
    const [line] = await drizzle
      .select({ userId: phoneNumbers.userId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.phoneNumber, phoneNumber))
      .limit(1);
    if (!line?.userId) throw AppError.notFound("That number is not an assigned BotBound line.");
    const { expiresAt } = await armFallbackDrill({
      userId: line.userId,
      phoneNumber,
      mode,
      actorEmail: req.user?.email ?? null,
    });
    res.json({ armed: true, mode, phoneSuffix: phoneNumber.slice(-4), expiresAt });
  }),
);

export default router;
