import { Router, type Request, type Response } from "express";

import { AppError } from "../lib/api-error";
import { verifyTextingPolicyToken } from "../lib/texting-policy-link";
import { createIpRateLimiter } from "../middleware/api-rate-limits";

/**
 * Public read for the texting privacy policy and terms BotBound hosts for a
 * business without its own website (`/texting/<token>/privacy|terms`). The
 * token is an HMAC-signed brand name, so this route reads no database and
 * returns nothing beyond the name already printed at the start of every text.
 */
const router = Router();

const textingPolicyRateLimit = createIpRateLimiter({
  bucket: "api:texting-policy",
  windowMs: 60_000,
  max: 60,
});

router.get("/api/texting-policy/:token", textingPolicyRateLimit, (req: Request, res: Response) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const brandName = verifyTextingPolicyToken(req.params.token);
  if (!brandName) {
    res.setHeader("Cache-Control", "no-store");
    throw AppError.notFound("This texting policy link isn't valid.");
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ brandName });
});

export default router;
