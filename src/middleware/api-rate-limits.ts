// API-specific rate limiters for new enterprise endpoints.
//
// All limiters extract user_id from req.user (populated by
// authenticateUser middleware) and enforce bucket-specific limits.
//
// Returns 429 with Retry-After header on quota exceeded.

import { Request, Response, NextFunction } from 'express';
import { rateLimit, RateLimiterOptions, distributedLimiterStatus } from '../lib/rate-limit.js';

// ──────────────────────────────────────────────────────────────────────
//  Claude rate limiter — shared by server.ts and extracted route files.
//  Keys by Bearer token first; falls back to IP for unauthenticated edge
//  cases. Fails CLOSED when the distributed limiter is unavailable.
// ──────────────────────────────────────────────────────────────────────
const CLAUDE_RATE_WINDOW_MS = 60_000;
const CLAUDE_RATE_MAX = 60;

/**
 * Middleware that enforces per-user Claude API rate limits.
 * Accepts optional hooks for audit logging and Sentry tracking so callers
 * can wire their own singletons without creating circular imports.
 */
export async function claudeRateLimiter(req: Request, res: Response, next: NextFunction) {
  const status = distributedLimiterStatus();
  if (!status.ok) {
    return res.status(503).json({ error: status.reason, code: status.code });
  }
  const token = req.headers.authorization?.split(' ')[1];
  const key = token || req.ip || 'anon';
  let result;
  try {
    result = await rateLimit(key, {
      bucket: 'claude',
      windowMs: CLAUDE_RATE_WINDOW_MS,
      max: CLAUDE_RATE_MAX,
      failClosedOnError: true,
    });
  } catch {
    return res
      .status(503)
      .json({ error: 'Rate limiter temporarily unavailable.', code: 'RATE_LIMITER_ERROR' });
  }
  res.setHeader('X-RateLimit-Limit', String(CLAUDE_RATE_MAX));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${CLAUDE_RATE_MAX} requests per minute. Slow down.`,
      code: 'CLAUDE_RATE_LIMIT',
    });
  }
  next();
}

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
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      if (!userId) {
        // Should never happen if authenticateUser ran first, but be defensive.
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await rateLimit(userId, opts);

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: 'Rate limit exceeded',
          bucket: opts.bucket,
          retryAfterSeconds,
        });
        return;
      }

      // Include rate limit info in response headers.
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', String(Date.now() + result.resetMs));

      next();
    } catch (err) {
      // Fail-OPEN on unexpected error — better to serve traffic than to
      // lock out everyone on rate limiter bugs.
       
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
  bucket: 'api:quotas',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
});

/**
 * Job queue management endpoints rate limiter.
 * 20 requests per 15 minutes per user.
 * Low limit because sweep/retry operations are expensive.
 */
export const jobsRateLimit = createRateLimiter({
  bucket: 'api:jobs',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
});

/**
 * TCPA consent check endpoint rate limiter.
 * 60 requests per minute per user.
 * Moderate limit to prevent phone scraping abuse.
 */
export const tcpaRateLimit = createRateLimiter({
  bucket: 'api:tcpa',
  windowMs: 60 * 1000, // 1 minute
  max: 60,
});

/**
 * SOC2 compliance endpoints rate limiter.
 * 100 requests per 15 minutes per user.
 */
export const soc2RateLimit = createRateLimiter({
  bucket: 'api:soc2',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});

/**
 * Webhook CRUD rate limiter (create/update/delete/test).
 * 60 mutations per 15 minutes per user — webhook CRUD is low volume by
 * nature; the limit primarily exists to throttle credential-stuffing
 * style attacks against the secret-rotation path.
 */
export const webhooksRateLimit = createRateLimiter({
  bucket: 'api:webhooks',
  windowMs: 15 * 60 * 1000,
  max: 60,
});

/**
 * Phone number provisioning rate limiter.
 * 30 requests per 15 minutes per user.
 * Low limit as phone number operations are expensive.
 */
export const phoneNumberRateLimiter = createRateLimiter({
  bucket: 'api:phone-numbers',
  windowMs: 15 * 60 * 1000,
  max: 30,
});

/**
 * Knowledge base operations rate limiter.
 * 100 requests per 15 minutes per user.
 */
export const knowledgeRateLimiter = createRateLimiter({
  bucket: 'api:knowledge',
  windowMs: 15 * 60 * 1000,
  max: 100,
});

/**
 * Outbound dial rate limiter.
 * 60 dial requests per minute per user.
 */
export const dialRateLimiter = createRateLimiter({
  bucket: 'api:dial',
  windowMs: 60 * 1000,
  max: 60,
});
