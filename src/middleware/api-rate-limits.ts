// API-specific rate limiters for new enterprise endpoints.
//
// All limiters extract user_id from req.user (populated by
// authenticateUser middleware) and enforce bucket-specific limits.
//
// Returns 429 with Retry-After header on quota exceeded.

import { Request, Response, NextFunction } from "express";
import { rateLimit, RateLimiterOptions } from "../lib/rate-limit.js";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface RateLimitMiddleware {
  (req: Request, res: Response, next: NextFunction): Promise<void>;
}

/** Generic rate limit middleware factory. */
function createRateLimiter(opts: RateLimiterOptions): RateLimitMiddleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract user ID from authenticated session.
      const userId = (req as any).user?.id;
      if (!userId) {
        // Should never happen if authenticateUser ran first, but be defensive.
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await rateLimit(userId, opts);

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          error: "Rate limit exceeded",
          bucket: opts.bucket,
          retryAfterSeconds,
        });
        return;
      }

      // Include rate limit info in response headers.
      res.set("X-RateLimit-Remaining", String(result.remaining));
      res.set("X-RateLimit-Reset", String(Date.now() + result.resetMs));

      next();
    } catch (err) {
      // Fail-OPEN on unexpected error — better to serve traffic than to
      // lock out everyone on rate limiter bugs.
      // eslint-disable-next-line no-console
      console.error(
        `[api-rate-limits] error in ${opts.bucket} limiter, fail-open:`,
        getErrorMessage(err),
      );
      next();
    }
  };
}

/**
 * Quota management endpoints rate limiter.
 * 200 requests per 15 minutes per user.
 */
export const quotaRateLimit = createRateLimiter({
  bucket: "api:quotas",
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
});

/**
 * Job queue management endpoints rate limiter.
 * 20 requests per 15 minutes per user.
 * Low limit because sweep/retry operations are expensive.
 */
export const jobsRateLimit = createRateLimiter({
  bucket: "api:jobs",
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
});

/**
 * TCPA consent check endpoint rate limiter.
 * 60 requests per minute per user.
 * Moderate limit to prevent phone scraping abuse.
 */
export const tcpaRateLimit = createRateLimiter({
  bucket: "api:tcpa",
  windowMs: 60 * 1000, // 1 minute
  max: 60,
});

/**
 * SOC2 compliance endpoints rate limiter.
 * 100 requests per 15 minutes per user.
 */
export const soc2RateLimit = createRateLimiter({
  bucket: "api:soc2",
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
