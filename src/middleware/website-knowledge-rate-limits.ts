import { createRateLimiter } from "./api-rate-limits";

/**
 * Website training performs both a public-network fetch and a metered model
 * extraction. It must not inherit the generic 120/minute agent mutation bucket.
 *
 * Five imports per 15 minutes supports iterative setup without allowing a
 * single account to burst external fetches or AI spend. The independent daily
 * ceiling bounds sustained automation. Both limits fail closed when the
 * distributed limiter is unavailable because this route creates vendor cost.
 */
export const websiteKnowledgeBurstRateLimit = createRateLimiter({
  bucket: "api:website-knowledge:burst",
  windowMs: 15 * 60 * 1000,
  max: 5,
  failClosedOnError: true,
});

export const websiteKnowledgeDailyRateLimit = createRateLimiter({
  bucket: "api:website-knowledge:daily",
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  failClosedOnError: true,
});
