import { Router, type Request, type Response } from "express";

import { AppError } from "../lib/api-error";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

function requestIp(req: Request): string {
  return String(req.ip || "unknown").trim();
}

function publicVoicePreviewRetired(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    error: "Public voice previews have moved behind BotBound account access.",
    code: "public_voice_preview_retired",
    signupPath: "/signup?plan=free",
  });
}

router.get("/api/public/stats", async (req, res) => {
  const decision = await rateLimit(requestIp(req), {
    bucket: "public_stats",
    windowMs: 60_000,
    max: 30,
  });
  if (!decision.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(decision.resetMs / 1000)));
    throw AppError.fromHttpStatus(429, "Rate limit exceeded.");
  }
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.json({
    published: false,
    reason: "customer_activity_metrics_not_yet_published",
    voice_preview_mode: "account_required",
  });
});

router.get("/api/public/assistant/:agentName", publicVoicePreviewRetired);
router.post("/api/public/demo-session", publicVoicePreviewRetired);
router.post("/api/public/demo-call", publicVoicePreviewRetired);

export default router;
