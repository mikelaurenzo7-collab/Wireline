import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import { AppError, asyncHandler } from "../lib/api-error";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";
import {
  generateCuratedVoicePreview,
  isCuratedPreviewProvider,
} from "../lib/voice/voice-preview-service";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createOpenAILiveVoiceCall,
  getOpenAILiveVoiceStatus,
  runOpenAILiveVoiceTool,
} from "../lib/voice/openai-live-agent-service";
import { getStudioLiveVoiceStatus } from "../lib/voice/studio-live-test-policy";
import {
  createStudioVapiWebSession,
  proxyStudioVapiWebCall,
  studioVapiWebTicketingReady,
  verifyStudioVapiWebTicket,
} from "../lib/voice/studio-vapi-web-session";
import liveProfileRouter from "./grok-live-profile-routes";

// Legacy filename retained to avoid route-registry churn.
// Studio live tests default to Vapi web (same xAI brain and voice as PSTN).
// OpenAI Realtime remains the automatic backup when Vapi is unavailable.
const router = express.Router();
const sessionLimiter = createRateLimiter({
  bucket: "api:live-voice-session",
  windowMs: 60_000,
  max: 12,
  failClosedOnError: true,
});
const toolLimiter = createRateLimiter({
  bucket: "api:live-voice-tool",
  windowMs: 60_000,
  max: 60,
});
const statusLimiter = createRateLimiter({
  bucket: "api:live-voice-status",
  windowMs: 60_000,
  max: 30,
});
const previewLimiter = createRateLimiter({
  bucket: "api:voice-preview",
  windowMs: 60_000,
  max: 20,
  failClosedOnError: true,
});
const sessionSchema = z.object({
  agentId: z.string().min(1).max(200),
  sdp: z.string().min(100).max(60_000),
});
const webSessionSchema = z.object({
  agentId: z.string().min(1).max(200),
});
const toolSchema = z.object({
  agentId: z.string().min(1).max(200),
  name: z.string().max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

router.use(liveProfileRouter);

function requireStudioVapiWebTicket(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
) {
  const authorization = String(req.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    next(AppError.fromHttpStatus(401, "A live test ticket is required."));
    return;
  }
  const verification = verifyStudioVapiWebTicket(token);
  if (!verification.ok) {
    next(AppError.fromHttpStatus(401, "The live test ticket is invalid or expired."));
    return;
  }
  (req as AuthenticatedRequest & { studioVapiWebToken?: string }).studioVapiWebToken = token;
  next();
}

router.get(
  "/api/voices/curated/preview",
  authenticateUser,
  previewLimiter,
  enforceLaunchHardGate,
  async (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === "string" ? req.query.provider : "";
    const voiceId = typeof req.query.voiceId === "string" ? req.query.voiceId.trim() : "";
    if (!isCuratedPreviewProvider(provider) || !voiceId)
      throw AppError.fromHttpStatus(400, "A valid provider and voice are required.");
    const audio = await generateCuratedVoicePreview(provider, voiceId);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(audio));
  },
);

router.get(
  "/api/voice/live/status",
  authenticateUser,
  statusLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      ...getOpenAILiveVoiceStatus(),
      ...getStudioLiveVoiceStatus(),
    });
  },
);

router.post(
  "/api/voice/live/web-session",
  authenticateUser,
  sessionLimiter,
  enforceLaunchHardGate,
  enforceSpendCap,
  validateBody(webSessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!studioVapiWebTicketingReady()) {
      throw AppError.fromHttpStatus(503, "The live phone test is temporarily unavailable.");
    }
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "live_voice_session");
    try {
      const session = await createStudioVapiWebSession({
        userId: req.user.id,
        agentId: req.body.agentId,
      });
      await commitRealtimeSessionSpend(reservation);
      res.setHeader("Cache-Control", "no-store");
      res.json(session);
    } catch (error) {
      await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);
      throw error;
    }
  },
);

router.post(
  "/api/voice/live/vapi/call/web",
  sessionLimiter,
  requireStudioVapiWebTicket,
  asyncHandler(async (req, res) => {
    const token =
      (req as AuthenticatedRequest & { studioVapiWebToken?: string }).studioVapiWebToken || "";
    const upstream = await proxyStudioVapiWebCall(token);
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.contentType);
    res.send(upstream.body);
  }),
);

router.post(
  "/api/voice/live/session",
  authenticateUser,
  sessionLimiter,
  enforceLaunchHardGate,
  // Same posture as /api/voice/openai/session: the mint spends vendor-metered
  // realtime audio on platform keys outside the token audit path, so it must
  // respect the tenant's AI-spend hard cap and land a reserve in the envelope.
  // Cap BEFORE quota so a capped tenant's rejections don't consume the
  // durable daily minute debit.
  enforceSpendCap,
  validateBody(sessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "live_voice_session");
    let session: Awaited<ReturnType<typeof createOpenAILiveVoiceCall>>;
    try {
      session = await createOpenAILiveVoiceCall({
        userId: req.user.id,
        agentId: req.body.agentId,
        sdp: req.body.sdp,
      });
    } catch (error) {
      await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);
      throw error;
    }
    await commitRealtimeSessionSpend(reservation);
    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  },
);

router.post(
  "/api/voice/live/tool",
  authenticateUser,
  toolLimiter,
  validateBody(toolSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await runOpenAILiveVoiceTool({
      userId: req.user.id,
      agentId: req.body.agentId,
      name: req.body.name,
      arguments: req.body.arguments || {},
    });
    res.json({ result });
  },
);

export default router;
