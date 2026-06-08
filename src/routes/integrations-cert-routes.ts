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

router.get("/api/integrations/certified", limiter, async (_req: Request, res: Response) => {
  const certified = await getCertifiedIntegrationsPublic();
  return res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    integrations: certified,
  });
});

export default router;
