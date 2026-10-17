import { Router, Request, Response } from "express";
import { getCertifiedIntegrationsPublic } from "../lib/integrations-certification";
import { createIpRateLimiter } from "../middleware/api-rate-limits";

const router = Router();

const limiter = createIpRateLimiter({
  bucket: "api:integrations-certified",
  windowMs: 60_000,
  max: 60,
  message: { error: "Too many requests.", code: "RATE_LIMITED" },
});

// Preserve the public URL; its response explicitly distinguishes configuration
// checks from operational certification and never initiates provider work.
router.get("/api/integrations/certified", limiter, async (_req: Request, res: Response) => {
  const integrations = await getCertifiedIntegrationsPublic();
  return res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    integrations,
  });
});

export default router;
