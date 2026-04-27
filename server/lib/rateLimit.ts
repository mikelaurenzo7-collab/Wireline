/**
 * Pluggable rate-limit store with a memory-backed default. The interface is
 * Redis-shaped so we can swap in `IORedis` later without touching call sites.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitStore {
  /**
   * Increment the counter for `key` and return the resulting count + when
   * the bucket resets. Implementations must atomically initialize the bucket
   * if it doesn't exist or has expired.
   */
  hit(key: string, windowMs: number): Promise<{ count: number; resetsAt: number }>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetsAt: number }>();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      const fresh = { count: 1, resetsAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    bucket.count += 1;
    return bucket;
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  keyFn?: (req: Request) => string;
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const { max, windowMs, keyFn } = opts;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyFn ? keyFn(req) : `${req.ip}:${req.path}`;
      const bucket = await store.hit(key, windowMs);
      if (bucket.count > max) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetsAt - Date.now()) / 1000));
        res.setHeader("Retry-After", retryAfterSec);
        return res.status(429).json({
          error: "Too many requests. Please try again later.",
          code: "too_many_requests",
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Shared presets so we don't sprinkle magic numbers across routers. Tune
 * here and every call site picks up the change.
 *
 * - `webhook`: high ceiling because Vapi may burst events for a single call
 *   (assistant-request → many tool-calls → end-of-call-report). Keyed by IP
 *   only since the request path is constant.
 * - `oauth`: low ceiling — initiation/callback abuse is the main risk.
 * - `ai`: moderate; Gemini quota is the actual cost driver.
 */
export const RATE_LIMITS = {
  webhook: { max: 600, windowMs: 60 * 1000 },
  oauthInit: { max: 10, windowMs: 10 * 60 * 1000 },
  oauthCallback: { max: 20, windowMs: 10 * 60 * 1000 },
  ai: { max: 30, windowMs: 60 * 1000 },
} as const;
