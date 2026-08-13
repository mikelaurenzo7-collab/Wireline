// API-specific rate limiters for new enterprise endpoints.
//
// All limiters extract user_id from req.user (populated by
// authenticateUser middleware) and enforce bucket-specific limits.
//
// Returns 429 with Retry-After header on quota exceeded.

import { Request, Response, NextFunction } from "express";
import { rateLimit, RateLimiterOptions, distributedLimiterStatus } from "../lib/rate-limit.js";
import { AppError } from "../lib/api-error";
import { log } from "../lib/server-context";

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
  const token = req.headers.authorization?.split(" ")[1];
  const key = token || req.ip || "anon";
  let result;
  try {
    result = await rateLimit(key, {
      bucket: "claude",
      windowMs: CLAUDE_RATE_WINDOW_MS,
      max: CLAUDE_RATE_MAX,
      failClosedOnError: true,
    });
  } catch {
    return res
      .status(503)
      .json({ error: "Rate limiter temporarily unavailable.", code: "RATE_LIMITER_ERROR" });
  }
  res.setHeader("X-RateLimit-Limit", String(CLAUDE_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${CLAUDE_RATE_MAX} requests per minute. Slow down.`,
      code: "CLAUDE_RATE_LIMIT",
    });
  }
  next();
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Daily aggregate ceiling on realtime simulation sessions (OpenAI Realtime
 * live-voice test paths; optional Grok experiment if enabled). Each session mints a vendor-metered 5-minute
 * client secret, so every mint charges 5 simulation minutes. The per-minute
 * limiter above this stops bursts; without this cap a tenant could still run
 * back-to-back sessions all day on paid realtime keys with zero accounting.
 */
export async function simulationMinuteQuota(req: Request, res: Response, next: NextFunction) {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return next();
  try {
    const { quotaTracker } = await import("../lib/server-context");
    const decision = await quotaTracker.checkAndIncrement(userId, "simulation_minutes_daily", 5);
    if (!decision.allowed) {
      res.setHeader("Retry-After", "3600");
      return res.status(429).json({
        code: "SIMULATION_QUOTA_EXCEEDED",
        error:
          "You've reached today's live-simulation limit. It resets at midnight UTC — real phone calls are unaffected.",
        limit: decision.limit,
        used: decision.used,
        reset_at: decision.reset_at,
      });
    }
    if (!decision.persisted) {
      // The tracker's read-only fallback allowed the request but could not
      // record the increment (write-degraded DB). For a vendor-metered mint an
      // unrecorded allowance is the same as no ceiling — refuse like an outage.
      log.error("simulation quota increment not durable — refusing session mint", { userId });
      return res.status(503).json({
        code: "SIMULATION_QUOTA_UNAVAILABLE",
        error:
          "Live simulation is briefly unavailable. Try again shortly — phone calls are unaffected.",
      });
    }
  } catch (err) {
    // checkAndIncrement already degrades internally; an exception here means
    // the tracker itself is down. Every session mint charges a vendor-metered
    // realtime client secret on platform keys — the same spend-sensitive class
    // as dial/SMS/campaign buckets, which fail closed on limiter outage. With
    // the tracker down there is no daily ceiling at all, so allowing mints
    // here would hand out unbounded provider spend to $0 accounts exactly
    // when accounting is blind.
    log.error("simulation quota tracker unavailable — refusing session mint", {
      userId,
      error: getErrorMessage(err),
    });
    return res.status(503).json({
      code: "SIMULATION_QUOTA_UNAVAILABLE",
      error:
        "Live simulation is briefly unavailable. Try again shortly — phone calls are unaffected.",
    });
  }
  next();
}

interface RateLimitMiddleware {
  (req: Request, res: Response, next: NextFunction): Promise<void>;
}

/** Generic rate limit middleware factory. */
export function createRateLimiter(opts: RateLimiterOptions): RateLimitMiddleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Spend-sensitive buckets fail closed when Upstash is unavailable —
      // matching claudeRateLimiter / intake rather than silently allowing
      // unbounded dial/SMS/campaign spend.
      if (opts.failClosedOnError) {
        const status = distributedLimiterStatus();
        if (!status.ok) {
          res.status(503).json({ error: status.reason, code: status.code });
          return;
        }
      }

      // Extract user ID from authenticated session.
      const userId = (req as Request & { user?: { id?: string } }).user?.id;
      if (!userId) {
        throw AppError.unauthorized();
      }

      const result = await rateLimit(userId, opts);

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
        res.set("Retry-After", String(retryAfterSeconds));
        throw AppError.tooManyRequests("Rate limit exceeded");
      }

      // Include rate limit info in response headers.
      // X-RateLimit-Reset is epoch seconds (standard), not milliseconds.
      res.set("X-RateLimit-Remaining", String(result.remaining));
      res.set("X-RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));

      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      if (opts.failClosedOnError) {
        log.error("rate limiter error, fail-closed", {
          bucket: opts.bucket,
          error: getErrorMessage(err),
        });
        next(AppError.fromHttpStatus(503, "Rate limiting temporarily unavailable. Retry shortly."));
        return;
      }
      // Fail-OPEN on unexpected infrastructure errors for non-spend buckets —
      // better to serve traffic than lock out everyone on rate limiter bugs.
      log.error("rate limiter error, fail-open", {
        bucket: opts.bucket,
        error: getErrorMessage(err),
      });
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

const JOBS_SWEEP_WINDOW_MS = 15 * 60 * 1000;
const JOBS_SWEEP_MAX = 20;

/**
 * Rate limiter for POST /api/jobs/sweep only.
 * Manual sweeps key by user id; Vercel cron keys by caller IP (no req.user).
 * Must run after cronOrAdminAuth so `_sweepMode` is set for cron callers.
 */
export const jobsSweepRateLimit: RateLimitMiddleware = async (req, res, next) => {
  const opts = { bucket: "api:jobs:sweep", windowMs: JOBS_SWEEP_WINDOW_MS, max: JOBS_SWEEP_MAX };
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  const sweepMode = (req as Request & { _sweepMode?: string })._sweepMode;
  const key = userId ?? (sweepMode === "cron" ? `cron:${req.ip || "anon"}` : null);
  if (!key) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const result = await rateLimit(key, opts);
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
    res.set("X-RateLimit-Remaining", String(result.remaining));
    // X-RateLimit-Reset is epoch seconds (standard), not milliseconds.
    res.set("X-RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));
    next();
  } catch (err) {
    log.error("rate limiter error, fail-open", {
      bucket: opts.bucket,
      error: getErrorMessage(err),
    });
    next();
  }
};

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

/**
 * Webhook CRUD rate limiter (create/update/delete/test).
 * 60 mutations per 15 minutes per user — webhook CRUD is low volume by
 * nature; the limit primarily exists to throttle credential-stuffing
 * style attacks against the secret-rotation path.
 */
export const webhooksRateLimit = createRateLimiter({
  bucket: "api:webhooks",
  windowMs: 15 * 60 * 1000,
  max: 60,
});

/**
 * Phone number provisioning rate limiter.
 * 30 requests per 15 minutes per user.
 * Low limit as phone number operations are expensive.
 */
export const phoneNumberRateLimiter = createRateLimiter({
  bucket: "api:phone-numbers",
  windowMs: 15 * 60 * 1000,
  max: 30,
  failClosedOnError: true,
});

/**
 * Knowledge base operations rate limiter.
 * 100 requests per 15 minutes per user.
 */
export const knowledgeRateLimiter = createRateLimiter({
  bucket: "api:knowledge",
  windowMs: 15 * 60 * 1000,
  max: 100,
});

/**
 * Outbound dial rate limiter.
 * 60 dial requests per minute per user.
 */
export const dialRateLimiter = createRateLimiter({
  bucket: "api:dial",
  windowMs: 60 * 1000,
  max: 60,
  failClosedOnError: true,
});

/**
 * User-preferences rate limiter.
 *
 * `/api/user-preferences` is called from the React shell on every page
 * mount (AuthContext + several settings consumers re-read it for fresh
 * state). A typical authenticated session can easily issue 40+ reads in
 * the first minute as the Account Holder navigates between pages — way past
 * the `jobsRateLimit` ceiling of 20 / 15 min that CodeQL Autofix applied.
 *
 * Bucket is sized for an interactive UI: 240 reads/min per user, with a
 * 15-minute window so brief navigation bursts don't trip the limiter.
 * Still protects against credential-stuffing style abuse.
 */
export const userPreferencesRateLimit = createRateLimiter({
  bucket: "api:user-preferences",
  windowMs: 60 * 1000,
  max: 240,
});

/**
 * Product milestone ingestion. A busy workspace can emit several milestones
 * during setup, while the per-user bucket prevents audit-ledger flooding.
 */
export const productEventsRateLimit = createRateLimiter({
  bucket: "api:product-events",
  windowMs: 60 * 1000,
  max: 120,
});

/**
 * Voice-observability insights rate limiter.
 * 120 reads/min per user — dashboards poll latency trends interactively, so
 * the bucket is sized for UI navigation while still throttling scraping.
 */
export const insightsRateLimit = createRateLimiter({
  bucket: "api:insights",
  windowMs: 60 * 1000,
  max: 120,
});

/**
 * Assistants endpoints rate limiter.
 * 120 requests/min per user. The presence SSE stream opens one long-lived
 * connection per page mount; the limit primarily throttles reconnect storms.
 */
export const fleetRateLimit = createRateLimiter({
  bucket: "api:Assistants",
  windowMs: 60 * 1000,
  max: 120,
});

/** SMS send / mark-read — Twilio cost + abuse surface. */
export const smsRateLimit = createRateLimiter({
  bucket: "api:sms",
  windowMs: 60 * 1000,
  max: 60,
  failClosedOnError: true,
});

/** Dashboard reads, nav badges, CSV export. */
export const dashboardRateLimit = createRateLimiter({
  bucket: "api:dashboard",
  windowMs: 60 * 1000,
  max: 180,
});

/** Calendar sync — external API fan-out. */
export const calendarRateLimit = createRateLimiter({
  bucket: "api:calendar",
  windowMs: 60 * 1000,
  max: 30,
});

/** Agent CRUD + training mutations. */
export const agentMutationRateLimit = createRateLimiter({
  bucket: "api:agents-mutate",
  windowMs: 60 * 1000,
  max: 120,
});

/** Campaign create/update without Claude. */
export const campaignWriteRateLimit = createRateLimiter({
  bucket: "api:campaigns-write",
  windowMs: 60 * 1000,
  max: 60,
  failClosedOnError: true,
});

// ──────────────────────────────────────────────────────────────────────
//  IP-based rate limiter — for unauthenticated/webhook endpoints where
//  no req.user exists. Keys by IP address. Uses the same distributed
//  Redis-backed rateLimit engine as the authenticated limiters.
// ──────────────────────────────────────────────────────────────────────

interface IpRateLimiterOpts {
  /** Logical bucket name (e.g. "webhook:twilio"). */
  bucket: string;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per IP in the window. */
  max: number;
  /** JSON body returned on 429. Defaults to generic message. */
  message?: Record<string, string>;
}

/**
 * Creates an IP-keyed rate limit middleware for unauthenticated routes.
 * Replaces express-rate-limit with the unified distributed limiter.
 */
export function createIpRateLimiter(opts: IpRateLimiterOpts): RateLimitMiddleware {
  const errorBody = opts.message ?? { error: "Too many requests. Please try again later." };
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    try {
      const result = await rateLimit(ip, {
        bucket: opts.bucket,
        windowMs: opts.windowMs,
        max: opts.max,
      });

      // Standard rate-limit headers
      res.set("RateLimit-Limit", String(opts.max));
      res.set("RateLimit-Remaining", String(result.remaining));
      res.set("RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));

      if (!result.allowed) {
        const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json(errorBody);
        return;
      }
      next();
    } catch (err) {
      // Fail-OPEN on error — better to serve traffic than block webhooks.
      log.error("ip rate limiter error, fail-open", {
        bucket: opts.bucket,
        error: getErrorMessage(err),
      });
      next();
    }
  };
}
