import dotenv from "dotenv";
dotenv.config();

// Sentry must be imported and initialized BEFORE other modules so its
// instrumentation can wrap http/express. Graceful no-op when SENTRY_DSN is unset.
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  });
}

import express from "express";
import cors from "cors";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import * as claudeBrain from "./src/lib/claude-brain";
import { AuditLogger } from "./src/lib/audit-logger";
import { rateLimit, isRedisConfigured, startMemoryCleanup } from "./src/lib/rate-limit";
import { SentryEvents } from "./src/lib/sentry-events";
import { AgentFormSchema, DirectiveSchema, KnowledgeSchema, EmailReplySchema, EmailDraftSchema, CampaignCreateSchema, CampaignUpdateSchema, OutboundBulkSchema, AgentBusinessProfileSchema, parseFormData } from "./src/lib/form-validators";
import { getErrorMessage, sanitizeForAudit } from "./src/lib/server-utils";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "./src/lib/agent-runtime";
import { computeScorecard } from "./src/lib/agent-scorecard";

// On Vercel, VERCEL_URL is automatically set to the deployment hostname
// (e.g. "myapp-abc123.vercel.app") with no protocol or trailing slash.
// When APP_URL isn't explicitly configured, derive it from VERCEL_URL so
// OAuth callbacks, billing redirects, and CORS work out of the box on
// preview and production deployments without manual configuration.
// Strip any accidental protocol prefix to guard against misconfiguration.
if (!process.env.APP_URL && process.env.VERCEL_URL) {
  const hostname = process.env.VERCEL_URL.replace(/^https?:\/\/|\/+$/g, '');
  process.env.APP_URL = `https://${hostname}`;
}

const DEFAULT_AGENT_ROLE = "customer_service";
const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// ────────────────────────────────────────────────────────────────────
//  Structured logger — single-line JSON in production, pretty in dev.
//  Centralizing console.* calls so we can ship to Datadog/Logtail later
//  without rewriting every call site. Levels: debug | info | warn | error.
// ────────────────────────────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error";
function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(entry));
  } else {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      `[${level}]`, msg, fields ?? ""
    );
  }
}
const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emitLog("debug", msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => emitLog("info", msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => emitLog("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emitLog("error", msg, fields),
};

// ────────────────────────────────────────────────────────────────────
//  fetchWithTimeout — every outbound HTTP call (Vapi, Gmail, generic)
//  must have a deadline. node-fetch has no default; a stalled
//  connection will hang the request handler indefinitely. 15s is
//  long enough for legitimate slow APIs, short enough to fail fast.
// ────────────────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────
//  Startup env validation — fail fast in production rather than
//  silently booting with placeholder Supabase URLs / missing webhook
//  secrets. Log warnings (not errors) in dev so local hacking still works.
// ────────────────────────────────────────────────────────────────────
function validateStartupEnv() {
  const required = [
    ["VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
  ] as const;
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  const recommended: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) recommended.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.ANTHROPIC_API_KEY) recommended.push("ANTHROPIC_API_KEY");
  if (!process.env.VAPI_WEBHOOK_SECRET) recommended.push("VAPI_WEBHOOK_SECRET");
  if (!process.env.APP_URL) recommended.push("APP_URL");
  // CORS_ORIGINS in prod: cross-origin browser requests will fail without it
  // (the cors middleware rejects unknown origins). APP_URL is auto-added to
  // the allowlist if set, so this is only a hard requirement when serving
  // API + frontend from different origins.
  if (IS_PROD && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }

  if (missing.length) {
    if (IS_PROD) {
      log.error("Refusing to start: required env vars are missing", { missing });
      // Exit synchronously so the platform restart loop kicks in instead of
      // accepting traffic in a broken state.
      process.exit(1);
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", { missing });
    }
  }
  if (recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }
}
validateStartupEnv();

const app = express();
// Hosting platforms (Railway, Render, Fly, Heroku) inject PORT — honor it
// or fall back to 3000 for local dev. Without this, the platform's
// router can't reach the bound port and health checks fail.
const PORT = Number(process.env.PORT) || 3000;

// ────────────────────────────────────────────────────────────────────
//  CORS — locked down to an explicit allowlist via CORS_ORIGINS
//  (comma-separated). In dev (no NODE_ENV=production / VERCEL=1) we
//  fall back to allowing all origins to keep `npm run dev` painless.
// ────────────────────────────────────────────────────────────────────
const corsAllowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (IS_PROD && corsAllowList.length === 0 && process.env.APP_URL) {
  corsAllowList.push(process.env.APP_URL);
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / curl / server-to-server have no Origin header.
      if (!origin) return callback(null, true);
      if (!IS_PROD && corsAllowList.length === 0) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      log.warn("CORS rejected origin", { origin });
      return callback(new Error("Origin not permitted by CORS"));
    },
    credentials: true,
  }),
);
// Stripe webhook needs the RAW body bytes to verify the signature, so
// register raw-body middleware on that exact path BEFORE the global
// JSON parser. The handler reads `req.body` as a Buffer.
app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));
// Bump body limit so base64-encoded PDF uploads (up to ~32MB raw / ~43MB
// base64) fit comfortably for the knowledge-from-document recipe.
app.use(express.json({ limit: '50mb' }));

// ────────────────────────────────────────────────────────────────────
//  Request correlation IDs — every request gets a stable id we attach
//  to res.locals + an X-Request-Id response header. Client-supplied
//  X-Request-Id is honored if present so traces can flow end-to-end.
// ────────────────────────────────────────────────────────────────────
app.use((req: any, res: any, next: any) => {
  const incoming = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64);
  const requestId = incoming && /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// ────────────────────────────────────────────────────────────────────
//  Security headers — hand-rolled (no helmet dep) so we control the
//  exact set of headers and CSP directives. Applied to every response.
//
//  CSP allows 'unsafe-inline' on script-src because:
//    • The OAuth callback page writes a JSON-encoded postMessage script
//      at runtime. When that page moves to a static asset, replace
//      'unsafe-inline' with a nonce.
//    • Vite HMR in dev also injects inline scripts.
//
//  connect-src permits Supabase, Anthropic, Vapi, and Google APIs so
//  the browser's fetch() is allowed to reach those origins.
// ────────────────────────────────────────────────────────────────────
const supabaseOrigin = (() => {
  try {
    const u = new URL(process.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co");
    return u.origin;
  } catch { return "https://*.supabase.co"; }
})();

// Build CSP connect-src from known external APIs.
const CSP_CONNECT_SRCS = [
  "'self'",
  supabaseOrigin,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.anthropic.com",
  "https://api.vapi.ai",
  "wss://api.vapi.ai",
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  "https://www.googleapis.com",
  "https://login.microsoftonline.com",
  "https://graph.microsoft.com",
  "https://api.stripe.com",
].join(" ");

function buildCSP(isDev: boolean): string {
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${CSP_CONNECT_SRCS}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

app.use((req: any, res: any, next: any) => {
  // Attach request metadata to Sentry for context in error traces
  Sentry.setTag('http.method', req.method);
  Sentry.setTag('http.path', req.path);
  Sentry.setContext('http_request', {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip,
  });

  res.on('finish', () => {
    // Tag the response status for better error filtering
    Sentry.setTag('http.status_code', res.statusCode);
  });

  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD));
  if (IS_PROD) {
    // 6 months HSTS preload-eligible — only in prod so dev over http stays usable.
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
});

// ────────────────────────────────────────────────────────────────────
//  Slow-request logging — emit a structured warning when any handler
//  exceeds 5s. Helps surface stalled Vapi / Gmail / Claude paths in
//  prod logs without instrumenting every route by hand.
// ────────────────────────────────────────────────────────────────────
const SLOW_REQUEST_THRESHOLD_MS = 5_000;
app.use((req: any, res: any, next: any) => {
  const start = Date.now();
  res.on("finish", () => {
    const dur = Date.now() - start;
    if (dur >= SLOW_REQUEST_THRESHOLD_MS) {
      log.warn("slow request", {
        requestId: res.locals?.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: dur,
      });
    }
  });
  next();
});

// ────────────────────────────────────────────────────────────────────
//  Health check — for uptime monitors, load balancers, and the AI
//  Studio container's readiness probe. Public, no auth. Probes the
//  database with a short timeout so we report `degraded` (HTTP 503)
//  when Supabase is unreachable rather than lying with `ok`.
//  Light IP-based rate limit (30 req/min) prevents health-endpoint DDoS
//  from saturating Supabase with probe queries.
// ────────────────────────────────────────────────────────────────────
async function probeDatabase(timeoutMs = 1500): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const probe = db.from("wireline_settings").select("user_id", { head: true, count: "exact" }).limit(1);
    const result = await Promise.race([
      probe,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("db probe timed out")), timeoutMs)),
    ]) as { error?: { message: string } | null };
    if (result?.error) return { ok: false, latency_ms: Date.now() - t0, error: result.error.message };
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: getErrorMessage(err) };
  }
}

const healthRateLimit = new Map<string, number[]>();
const HEALTH_RATE_WINDOW_MS = 60_000;
const HEALTH_RATE_MAX = 30;
function healthRateLimiter(req: any, res: any, next: any) {
  // Use x-forwarded-for (first hop) when behind a trusted reverse proxy,
  // falling back to req.ip. Consistent with the OAuth and Claude rate
  // limiters in this file which also key on the request IP.
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (healthRateLimit.get(key) || []).filter((t: number) => now - t < HEALTH_RATE_WINDOW_MS);
  if (hits.length >= HEALTH_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many health-check requests." });
  }
  hits.push(now);
  healthRateLimit.set(key, hits);
  next();
}
setInterval(() => {
  const cutoff = Date.now() - HEALTH_RATE_WINDOW_MS * 2;
  for (const [k, hits] of healthRateLimit) {
    const fresh = hits.filter((t: number) => t > cutoff);
    if (fresh.length === 0) healthRateLimit.delete(k);
    else healthRateLimit.set(k, fresh);
  }
}, 5 * 60 * 1000).unref?.();

app.get("/api/health", healthRateLimiter, async (_req, res) => {
  const dbStatus = await probeDatabase();
  const status = dbStatus.ok ? "ok" : "degraded";
  res.status(dbStatus.ok ? 200 : 503).json({
    status,
    uptime_s: Math.round(process.uptime()),
    db: dbStatus,
    capabilities: {
      claude:    !!process.env.ANTHROPIC_API_KEY,
      gemini:    !!process.env.GEMINI_API_KEY,
      vapi:      !!process.env.VAPI_PRIVATE_KEY,
      supabase:  !!process.env.VITE_SUPABASE_URL,
      google_oauth:    !!process.env.GOOGLE_CLIENT_ID,
      microsoft_oauth: !!process.env.MICROSOFT_CLIENT_ID,
    },
    timestamp: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────────────────────────
//  Per-user rate limit for /api/claude/* — cost protection.
//
//  Claude Opus 4.7 is expensive ($5/M input, $25/M output). A single
//  user accidentally hammering an endpoint (or a rogue script) could
//  rack up real $$. Cap at 60 requests / minute / user.
//
//  Uses Upstash Redis when UPSTASH_REDIS_REST_URL is set (required for
//  serverless / multi-region). Falls back to per-process memory otherwise.
//  At boot, log which mode we're in so operators know.
// ────────────────────────────────────────────────────────────────────
const CLAUDE_RATE_WINDOW_MS = 60_000;
const CLAUDE_RATE_MAX = 60;

if (isRedisConfigured()) {
  log.info("Rate limiter: Upstash Redis (distributed)");
} else if (IS_PROD) {
  log.warn("Rate limiter: in-memory only — set UPSTASH_REDIS_REST_URL for distributed limits in production");
} else {
  log.info("Rate limiter: in-memory (dev mode)");
}

// Start the in-memory bucket janitor so the fallback Map doesn't leak
// memory in long-lived deployments.
startMemoryCleanup();

// Reusable per-user rate-limiter for any endpoint that calls Claude.
// Keys by Bearer token (available before authenticateUser runs); falls
// back to IP so unauthenticated edge cases are still covered.
async function claudeRateLimiter(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  const key = token || req.ip || "anon";
  const result = await rateLimit(key, {
    bucket: "claude",
    windowMs: CLAUDE_RATE_WINDOW_MS,
    max: CLAUDE_RATE_MAX,
  });
  res.setHeader("X-RateLimit-Limit", String(CLAUDE_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    // Audit log: rate limit exceeded (non-blocking).
    void auditLogger.logSecurity('rate_limit_exceeded', {
      userId: undefined,
      resource: 'claude_api',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { limit: CLAUDE_RATE_MAX, hasToken: !!token }
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    // Track rate limiting in Sentry
    SentryEvents.rateLimited({
      endpoint: '/api/claude',
      user_id: req.user?.id,
    });

    res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${CLAUDE_RATE_MAX} requests per minute. Slow down.`,
      code: "CLAUDE_RATE_LIMIT",
    });
  }
  next();
}

async function emailRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const result = await rateLimit(userId, {
    bucket: "email",
    windowMs: EMAIL_RATE_WINDOW_MS,
    max: EMAIL_RATE_MAX,
  });

  res.setHeader("X-RateLimit-Limit", String(EMAIL_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    // Audit log: email rate limit exceeded
    void auditLogger.logSecurity('rate_limit_exceeded', {
      userId,
      resource: 'email_api',
      ip: req.ip,
      metadata: { limit: EMAIL_RATE_MAX }
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    // Track email rate limiting in Sentry
    SentryEvents.rateLimited({
      endpoint: '/api/emails',
      user_id: userId,
    });

    res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${EMAIL_RATE_MAX} email operations per minute. Please slow down.`,
      code: "EMAIL_RATE_LIMIT",
    });
  }
  next();
}

// Apply performance monitoring to critical API paths
app.use("/api", performanceMonitoring(2000));

// Request timeout middleware — prevents hung requests from accumulating connections
function timeoutMiddleware(timeoutMs: number) {
  return (req: any, res: any, next: any) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const endpoint = req.originalUrl || req.path;
        log.warn("Request timeout", { endpoint, timeoutMs, method: req.method });
        SentryEvents.slowOperation({
          operation: `${req.method} ${endpoint}`,
          duration_ms: timeoutMs,
          threshold_ms: timeoutMs,
        });
        res.status(504).json({ error: "Request timeout — operation took too long", code: "REQUEST_TIMEOUT" });
      }
      res.socket?.destroy();
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

// Apply different timeouts per endpoint category
app.use("/api/claude", timeoutMiddleware(30_000)); // 30s for Claude API calls
app.use("/api/emails", timeoutMiddleware(15_000)); // 15s for email operations
app.use("/api/phone-numbers", timeoutMiddleware(10_000)); // 10s for phone provisioning
app.use("/api/campaigns", timeoutMiddleware(10_000)); // 10s for campaign operations
app.use("/api", timeoutMiddleware(20_000)); // 20s default for other endpoints

// Cache-Control headers for read operations — improves browser/CDN caching
// Write operations (POST, PATCH, DELETE) should never be cached
app.use((req: any, res: any, next: any) => {
  if (req.method === 'GET') {
    // Static assets: cache longer
    if (req.path.match(/\.(js|css|png|jpg|svg|woff|woff2|ttf)$/i)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for hashed assets
    }
    // API read endpoints: short-lived cache with revalidation
    else if (req.path.startsWith('/api/')) {
      res.set('Cache-Control', 'private, max-age=60, must-revalidate'); // 1 min with revalidation
    }
  } else {
    // Never cache write operations
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
  next();
});

app.use("/api/claude", (req: any, res: any, next: any) => {
  // Status endpoint is exempt — used by clients to probe availability.
  if (req.path === "/status") return next();
  claudeRateLimiter(req, res, next).catch(next);
});

// Extend Claude rate limiting to non-/api/claude/* endpoints that also
// make Claude calls so they share the same per-user budget.
app.use(["/api/train/extract", "/api/agents/:id/optimize"], (req: any, res: any, next: any) => {
  claudeRateLimiter(req, res, next).catch(next);
});

// ────────────────────────────────────────────────────────────────────
//  IP-based rate limit for unauthenticated OAuth initiation.
//  Prevents a crawler from generating unlimited Google OAuth flows.
//  10 requests per 5 minutes per IP is generous for legitimate use.
//  Uses the same Redis-backed limiter as Claude (see src/lib/rate-limit).
// ────────────────────────────────────────────────────────────────────
const OAUTH_RATE_WINDOW_MS = 5 * 60_000;
const OAUTH_RATE_MAX = 10;

// Email operation rate limiting — prevents spam and API quota exhaustion
const EMAIL_RATE_WINDOW_MS = 60_000; // 1 minute
const EMAIL_RATE_MAX = 20; // 20 email operations per minute per user

// Knowledge base operation rate limiting — protects against bulk learning spam while allowing legitimate agent training
const KNOWLEDGE_RATE_WINDOW_MS = 60_000; // 1 minute
const KNOWLEDGE_RATE_MAX = 100; // 100 knowledge operations per minute per user

// Phone number provisioning rate limiting — Twilio/Vapi calls are expensive, limit bulk assignment
const PHONE_NUMBER_RATE_WINDOW_MS = 60_000; // 1 minute
const PHONE_NUMBER_RATE_MAX = 10; // 10 phone number operations per minute per user

async function knowledgeRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const result = await rateLimit(userId, {
    bucket: "knowledge",
    windowMs: KNOWLEDGE_RATE_WINDOW_MS,
    max: KNOWLEDGE_RATE_MAX,
  });

  res.setHeader("X-RateLimit-Limit", String(KNOWLEDGE_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    void auditLogger.logSecurity('rate_limit_exceeded', {
      userId,
      resource: 'knowledge_api',
      ip: req.ip,
      metadata: { limit: KNOWLEDGE_RATE_MAX }
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    SentryEvents.rateLimited({
      endpoint: '/api/knowledge',
      user_id: userId,
    });

    res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${KNOWLEDGE_RATE_MAX} knowledge operations per minute. Please slow down.`,
      code: "KNOWLEDGE_RATE_LIMIT",
    });
  }
  next();
}

async function phoneNumberRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const result = await rateLimit(userId, {
    bucket: "phone_numbers",
    windowMs: PHONE_NUMBER_RATE_WINDOW_MS,
    max: PHONE_NUMBER_RATE_MAX,
  });

  res.setHeader("X-RateLimit-Limit", String(PHONE_NUMBER_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    void auditLogger.logSecurity('rate_limit_exceeded', {
      userId,
      resource: 'phone_numbers_api',
      ip: req.ip,
      metadata: { limit: PHONE_NUMBER_RATE_MAX }
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    SentryEvents.rateLimited({
      endpoint: '/api/phone-numbers',
      user_id: userId,
    });

    res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
    return res.status(429).json({
      error: `Rate limit exceeded — ${PHONE_NUMBER_RATE_MAX} phone number operations per minute. Please slow down.`,
      code: "PHONE_NUMBER_RATE_LIMIT",
    });
  }
  next();
}

function oauthRateLimiter(req: any, res: any, next: any) {
  const key = req.ip || "anon";
  rateLimit(key, {
    bucket: "oauth",
    windowMs: OAUTH_RATE_WINDOW_MS,
    max: OAUTH_RATE_MAX,
  }).then((result) => {
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      return res.status(429).json({
        error: "Too many OAuth requests. Please wait before trying again.",
        code: "OAUTH_RATE_LIMIT",
      });
    }
    next();
  }).catch(next);
}

// Performance monitoring middleware — track slow operations on critical paths
function performanceMonitoring(slowThresholdMs: number = 2000) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - start;

      // Track slow operations for critical endpoints
      if (duration > slowThresholdMs && /api\/(claude|emails|campaigns|knowledge|agents)/.test(req.path)) {
        SentryEvents.slowOperation({
          operation: `${req.method} ${req.path}`,
          duration_ms: duration,
          threshold_ms: slowThresholdMs,
        });
      }

      res.send = originalSend;
      return originalSend.call(this, data);
    };

    next();
  };
}

// Initialize AI and DB
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Google Workspace OAuth Setup
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function getGoogleOAuthClient(req: express.Request) {
   // OAuth redirect URI MUST match what's registered in Google Cloud
   // Console exactly. Prefer APP_URL (operator-controlled) over the
   // request Host header (attacker-controlled). When APP_URL isn't
   // set we fall back to the request host but only allow it if it
   // matches one of the configured CORS origins — otherwise an attacker
   // who can spoof the Host header could redirect the OAuth flow to
   // their own server and steal the token.
   let baseUrl = process.env.APP_URL;
   if (!baseUrl) {
      const hostHeader = req.get('host');
      const candidate = hostHeader ? `${req.protocol}://${hostHeader}` : null;
      if (candidate && (corsAllowList.length === 0 || corsAllowList.includes(candidate))) {
         baseUrl = candidate;
      } else {
         log.error("OAuth redirect URI: APP_URL unset and Host header not in CORS_ORIGINS", {
            host: hostHeader,
         });
         throw new Error("OAuth misconfigured: set APP_URL or add the host to CORS_ORIGINS.");
      }
   }
   return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/oauth/google/callback`
   );
}

// Note: Backend uses Service Role for secure modifications across the DB if needed.
// In dev we still allow a placeholder so `npm run dev` doesn't crash before
// the operator fills in .env; in prod validateStartupEnv() above already
// process.exit(1)s when these are missing.
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
const db = createClient(supabaseUrl, supabaseKey);

// Initialize audit logger for server-side activity tracking.
const auditLogger = new AuditLogger(db);

// ────────────────────────────────────────────────────────────────────
//  Stripe — billing source of truth.
//
//  Plan catalog is defined in code (so it's easy to read), but the
//  actual price ids come from env vars so test-mode and live-mode
//  prices can swap without code changes. When STRIPE_SECRET_KEY is
//  unset, the SDK is constructed with a placeholder so the server
//  still boots in dev — every billing endpoint defensively returns
//  503 if `stripeAvailable()` is false.
// ────────────────────────────────────────────────────────────────────

export type StripePlan = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  features: string[];
  // Resolved at request time so env changes don't require a restart.
  priceIdEnv: string;
};

const STRIPE_PLANS: StripePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 49,
    max_agents: 3,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "3 voice + email agents",
      "Unlimited inbound calls",
      "100 outbound calls / month",
      "Daily Brief + Triage",
      "Webhooks · Intake API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 199,
    max_agents: 10,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "10 agents",
      "Unlimited outbound",
      "All Starter features",
      "Insights + Knowledge Atlas",
      "Auto-dial intake",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 999,
    max_agents: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "100 agents",
      "All Pro features",
      "SSO + SAML",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_placeholder", {
  apiVersion: "2025-09-30.clover" as any,
  typescript: true,
});
function stripeAvailable() {
  return !!process.env.STRIPE_SECRET_KEY;
}
function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return STRIPE_PLANS.find(p => process.env[p.priceIdEnv] === priceId) || null;
}
function planById(id: string): StripePlan | null {
  return STRIPE_PLANS.find(p => p.id === id) || null;
}
function plansForClient() {
  return STRIPE_PLANS.map(p => ({
    id: p.id,
    name: p.name,
    price_usd_monthly: p.price_usd_monthly,
    max_agents: p.max_agents,
    features: p.features,
    // Don't expose env var names; just whether the price is configured.
    configured: !!process.env[p.priceIdEnv],
  }));
}

// ────────────────────────────────────────────────────────────────────
//  Outbound webhooks dispatcher — module-scope so the vapi webhook
//  handler (also module-level, registered before startServer) can
//  call it. The CRUD endpoints for managing webhooks live inside
//  startServer alongside the other auth-gated routes.
// ────────────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  "call.completed",
  "call.escalated",
  "lead.received",
  "lead.hot",
  "email.received",
  "appointment.booked",
  "task.created",
  "compliance.flagged",
  "spend.warning",
  "spend.exceeded",
  "subscription.changed",
] as const;
type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// Backoff between retries, indexed by failed-attempts count after the
// inline first attempt. attempts=1 → wait 30s, =2 → 2m, =3 → 10m,
// =4 → 1h. With max_attempts=5, the 5th failure marks status='dead'
// (no further retry — operator can manually requeue from the UI).
const WEBHOOK_RETRY_BACKOFF_MS = [
  30_000,        // 30s
  2 * 60_000,    // 2m
  10 * 60_000,   // 10m
  60 * 60_000,   // 1h
];

const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_DEFAULT_MAX_ATTEMPTS = 5;

async function attemptWebhookDelivery(deliveryId: number) {
  // Pull the delivery and its hook in one round-trip via a join shape
  // Supabase supports natively. We re-read the hook each time so a
  // disabled / deleted hook short-circuits cleanly.
  const { data: row } = await db
    .from("wireline_webhook_deliveries")
    .select("id, user_id, webhook_id, event, payload, attempts, max_attempts, status, wireline_webhooks(id, url, secret, active, delivery_count)")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row || row.status !== "pending") return;
  const hook: any = (row as any).wireline_webhooks;
  if (!hook || !hook.active) {
    // Hook was paused/deleted between enqueue and attempt; mark dead so
    // the operator can see + decide.
    await db.from("wireline_webhook_deliveries").update({
      status: "dead",
      last_error: "Webhook is paused or deleted.",
      attempts: (row.attempts || 0) + 1,
    }).eq("id", deliveryId);
    return;
  }

  const crypto = await import("node:crypto");
  const payloadStr = JSON.stringify(row.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Wireline-Webhooks/1.0",
    "X-Wireline-Event": row.event,
    "X-Wireline-Delivery": `whk_${row.id}`,
    "X-Wireline-Attempt": String((row.attempts || 0) + 1),
  };
  if (hook.secret) {
    const sig = crypto.createHmac("sha256", hook.secret).update(payloadStr).digest("hex");
    headers["X-Wireline-Signature"] = `sha256=${sig}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const nowIso = new Date().toISOString();
  let statusCode: number | null = null;
  let errMsg: string | null = null;
  let ok = false;
  try {
    const r = await fetch(hook.url, { method: "POST", headers, body: payloadStr, signal: controller.signal });
    statusCode = r.status;
    ok = r.ok;
    if (!ok) errMsg = `HTTP ${r.status}`;
  } catch (err: any) {
    statusCode = 0;
    errMsg = err?.name === "AbortError" ? `Timed out after ${WEBHOOK_TIMEOUT_MS}ms` : (getErrorMessage(err));
  } finally {
    clearTimeout(timer);
  }

  const newAttempts = (row.attempts || 0) + 1;
  if (ok) {
    await db.from("wireline_webhook_deliveries").update({
      status: "success",
      attempts: newAttempts,
      last_status_code: statusCode,
      last_error: null,
      delivered_at: nowIso,
    }).eq("id", deliveryId);
    await db.from("wireline_webhooks").update({
      last_triggered_at: nowIso,
      last_status: statusCode,
      last_error: null,
      delivery_count: ((hook.delivery_count as number) || 0) + 1,
    }).eq("id", hook.id);
    return;
  }

  // Failed — schedule a retry or mark dead.
  const max = row.max_attempts || WEBHOOK_DEFAULT_MAX_ATTEMPTS;
  const reachedDead = newAttempts >= max;
  const backoff = WEBHOOK_RETRY_BACKOFF_MS[Math.min(newAttempts - 1, WEBHOOK_RETRY_BACKOFF_MS.length - 1)];
  await db.from("wireline_webhook_deliveries").update({
    status: reachedDead ? "dead" : "pending",
    attempts: newAttempts,
    last_status_code: statusCode,
    last_error: errMsg,
    next_attempt_at: reachedDead ? null : new Date(Date.now() + backoff).toISOString(),
  }).eq("id", deliveryId);
  await db.from("wireline_webhooks").update({
    last_triggered_at: nowIso,
    last_status: statusCode,
    last_error: errMsg,
  }).eq("id", hook.id);

  // Track webhook delivery failure when max attempts reached
  if (reachedDead) {
    SentryEvents.webhookDeliveryFailed({
      webhook_id: hook.id,
      attempt: newAttempts,
      status_code: statusCode || undefined,
    });
  }
}

async function dispatchWebhook(userId: string, event: WebhookEvent, data: any) {
  try {
    const { data: hooks } = await db.from("wireline_webhooks")
      .select("id, events")
      .eq("user_id", userId)
      .eq("active", true);
    const targetIds = (hooks || [])
      .filter((h: any) => Array.isArray(h.events) && h.events.includes(event))
      .map((h: any) => h.id);
    if (!targetIds.length) return;

    const payload = { event, timestamp: new Date().toISOString(), data };
    const rows = targetIds.map((webhook_id: string) => ({
      user_id: userId,
      webhook_id,
      event,
      payload,
    }));
    const { data: inserted, error } = await db
      .from("wireline_webhook_deliveries")
      .insert(rows)
      .select("id");
    if (error) {
      log.error("Webhook delivery insert failed", { error: error.message });
      return;
    }
    // Fire the first attempt immediately, in parallel. Failures get
    // requeued by attemptWebhookDelivery itself; the background
    // scheduler picks them up once their backoff elapses.
    await Promise.all((inserted || []).map((d: any) => attemptWebhookDelivery(d.id)));
  } catch (err: any) {
    log.error("Webhook dispatch failed", { error: getErrorMessage(err) });
  }
}

// ──────────────────────────────────────────────────────────────────
// Background retry scheduler — every 30s, claim and retry up to
// SCHED_BATCH pending deliveries whose next_attempt_at has elapsed.
// .unref() so it never blocks process exit. Wrapped in a re-entrancy
// guard so a slow batch never overlaps with itself.
// ──────────────────────────────────────────────────────────────────
const WEBHOOK_SCHED_INTERVAL_MS = 30_000;
const WEBHOOK_SCHED_BATCH = 25;
let _webhookSchedRunning = false;

async function processWebhookRetries() {
  if (_webhookSchedRunning) return;
  _webhookSchedRunning = true;
  try {
    const { data: due } = await db
      .from("wireline_webhook_deliveries")
      .select("id")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(WEBHOOK_SCHED_BATCH);
    if (!due?.length) return;
    // Run each delivery sequentially within the batch — keeps total
    // outbound concurrency bounded and the load on Supabase modest.
    for (const d of due) {
      try { await attemptWebhookDelivery(d.id); } catch (err: any) {
        log.error("Webhook retry attempt failed", { id: d.id, error: getErrorMessage(err) });
      }
    }
  } catch (err: any) {
    log.error("Webhook scheduler tick failed", { error: getErrorMessage(err) });
  } finally {
    _webhookSchedRunning = false;
  }
}
setInterval(processWebhookRetries, WEBHOOK_SCHED_INTERVAL_MS).unref?.();

// ────────────────────────────────────────────────────────────────────
//  SPEND BUDGETS — enforce monthly Claude limits and fire spend.*
//  webhook events when thresholds are crossed. Composed with the
//  audit log: month-to-date cost = SUM(cost_usd) over the current
//  UTC month for the user. Every Claude call funnels through the
//  audit middleware, which calls evaluateSpend() after the usage
//  rows are persisted. Hard-cap enforcement is a separate pre-handler
//  (enforceSpendCap) that short-circuits /api/claude/* with HTTP 402
//  when the user is both over budget and has hard_cap = true.
// ────────────────────────────────────────────────────────────────────

type BudgetCacheEntry = {
  fetchedAt: number;
  budget: { monthly_limit_usd: number; hard_cap: boolean; warn_threshold_pct: number; enabled: boolean } | null;
  mtdCost: number;
  period: string;
};
const BUDGET_CACHE_TTL_MS = 60_000;
const budgetCache = new Map<string, BudgetCacheEntry>();

function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodStartIso(period = currentPeriod()): string {
  // 'YYYY-MM' → UTC midnight of the 1st
  return new Date(`${period}-01T00:00:00.000Z`).toISOString();
}

async function getBudgetSnapshot(userId: string, force = false): Promise<BudgetCacheEntry> {
  const cached = budgetCache.get(userId);
  const period = currentPeriod();
  if (!force && cached && cached.period === period && Date.now() - cached.fetchedAt < BUDGET_CACHE_TTL_MS) {
    return cached;
  }
  const [{ data: budget }, { data: rows }] = await Promise.all([
    db.from("wireline_spend_budgets").select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled").eq("user_id", userId).maybeSingle(),
    db.from("wireline_audit_log").select("cost_usd").eq("user_id", userId).gte("created_at", periodStartIso(period)),
  ]);
  const mtdCost = (rows || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
  const entry: BudgetCacheEntry = {
    fetchedAt: Date.now(),
    budget: budget
      ? {
          monthly_limit_usd: Number(budget.monthly_limit_usd || 0),
          hard_cap: !!budget.hard_cap,
          warn_threshold_pct: Number(budget.warn_threshold_pct || 80),
          enabled: budget.enabled !== false,
        }
      : null,
    mtdCost,
    period,
  };
  budgetCache.set(userId, entry);
  return entry;
}

function bumpBudgetCache(userId: string, deltaUsd: number) {
  const cached = budgetCache.get(userId);
  if (!cached) return;
  const period = currentPeriod();
  if (cached.period !== period) return;
  cached.mtdCost += deltaUsd;
}

/**
 * Fire spend.warning / spend.exceeded webhooks when thresholds cross.
 * Debounced via wireline_spend_alerts(unique user_id+period+threshold) —
 * each threshold fires at most once per period.
 */
async function evaluateSpend(userId: string, deltaUsd: number) {
  try {
    bumpBudgetCache(userId, deltaUsd);
    const snap = await getBudgetSnapshot(userId);
    if (!snap.budget || !snap.budget.enabled) return;
    const limit = snap.budget.monthly_limit_usd;
    if (!(limit > 0)) return;

    const pct = (snap.mtdCost / limit) * 100;
    const warnPct = Math.max(1, Math.min(99, snap.budget.warn_threshold_pct));
    const thresholdsToFire: { pct: number; event: WebhookEvent }[] = [];
    if (pct >= 100) thresholdsToFire.push({ pct: 100, event: "spend.exceeded" });
    if (pct >= warnPct) thresholdsToFire.push({ pct: warnPct, event: "spend.warning" });

    for (const t of thresholdsToFire) {
      // Debounce: insert (user, period, threshold) — duplicate row => already fired.
      const { error } = await db
        .from("wireline_spend_alerts")
        .insert({ user_id: userId, period: snap.period, threshold_pct: t.pct });
      if (error) continue; // unique-violation or insert error → skip silently
      await dispatchWebhook(userId, t.event, {
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: limit,
        threshold_pct: t.pct,
        percent_used: Number(pct.toFixed(1)),
        hard_cap: snap.budget.hard_cap,
        at: new Date().toISOString(),
      });

      // Track budget thresholds in Sentry
      if (t.event === "spend.exceeded") {
        SentryEvents.budgetExceeded({
          user_id: userId,
          spent: Number(snap.mtdCost.toFixed(4)),
          budget: limit,
        });
      } else if (t.event === "spend.warning") {
        SentryEvents.budgetWarning({
          user_id: userId,
          spent: Number(snap.mtdCost.toFixed(4)),
          budget: limit,
        });
      }
    }
  } catch (err: any) {
    log.error("evaluateSpend failed", { error: getErrorMessage(err) });
  }
}

/**
 * Pre-handler for /api/claude/* — block the request with HTTP 402 if the
 * user has a hard cap on and is at/over their monthly limit. Uses the
 * cached snapshot so this stays fast on the hot path.
 */
async function enforceSpendCap(req: any, res: any, next: any) {
  if (!req?.user?.id) return next();
  try {
    const snap = await getBudgetSnapshot(req.user.id);
    const b = snap.budget;
    if (b && b.enabled && b.hard_cap && b.monthly_limit_usd > 0 && snap.mtdCost >= b.monthly_limit_usd) {
      return res.status(402).json({
        error: `Monthly Claude budget reached ($${b.monthly_limit_usd.toFixed(2)}). Disable hard cap or raise the limit in Insights → AI Spend.`,
        code: "SPEND_LIMIT_EXCEEDED",
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: b.monthly_limit_usd,
      });
    }
  } catch (err) {
    // Fail-OPEN on transient DB errors: blocking everyone when Supabase
    // blips would be worse than briefly missing a hard cap. We log a
    // structured warning so operators can see when this fires.
    log.warn("enforceSpendCap check failed — allowing request through", {
      user_id: req?.user?.id,
      requestId: res.locals?.requestId,
      error: (err as any)?.message || String(err),
    });
  }
  next();
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
async function authenticateUser(req: any, res: any, next: any) {
  // Idempotent: if an upstream middleware already authenticated this
  // request (e.g. the /api/claude scope runs auth before the spend cap
  // and audit middleware), skip the redundant Supabase round-trip.
  if (req.user?.id) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
     // Audit log: missing auth header (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: 'missing_token'
     }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "No authorization header provided" });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await db.auth.getUser(token);

  if (error || !user) {
     // Audit log: invalid/expired token (non-blocking)
     void auditLogger.logAuth('failed_login', {
       email: req.body?.email,
       ip: req.ip,
       userAgent: req.get('user-agent'),
       reason: !token ? 'missing_token' : 'invalid_token'
     }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
     
     return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;

  // Attach user context to Sentry for all subsequent events (errors, metrics, etc.)
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });

  // Log successful authentication (non-blocking).
  void auditLogger.logAuth('login', {
    userId: user.id,
    email: user.email,
    ip: req.ip || req.headers['x-forwarded-for'] as string,
    userAgent: req.headers['user-agent']
  }).catch((err) => {
    log.warn("Failed to log auth event", { userId: user.id, error: String(err) });
  });

  next();
}

// ==========================================
// STRIPE WEBHOOK + sync helper
// ==========================================
//
// Mirrors the Stripe subscription into wireline_subscriptions AND keeps
// wireline_settings.subscription_status / max_agents in sync so every
// existing gate in the app keeps working. The Stripe row is the source
// of truth; this is a cache.
//
// Maps Stripe statuses to the legacy two-value gate Wireline already uses:
//   active | trialing      → subscription_status='active'
//   past_due | unpaid      → subscription_status='past_due'
//   canceled | incomplete* → subscription_status='canceled'
async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  // Resolve the user via stripe_customer_id (set during checkout).
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data: existing } = await db.from("wireline_subscriptions")
    .select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (!existing?.user_id) {
    log.warn("Stripe webhook: no subscription row for customer, skipping sync", { customerId });
    return;
  }
  const userId = existing.user_id;
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const plan = planByPriceId(priceId);
  const stripeStatus = sub.status;
  const localStatus =
    stripeStatus === "active" || stripeStatus === "trialing" ? "active" :
    stripeStatus === "past_due" || stripeStatus === "unpaid" ? "past_due" :
    "canceled";

  // Mirror to wireline_subscriptions.
  await db.from("wireline_subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: plan?.id || null,
    status: stripeStatus,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // Sync the legacy gate so /api/outbound/dial, vapi-webhook, etc.
  // continue to work without touching them.
  const settingsPatch: any = { user_id: userId, subscription_status: localStatus };
  if (plan?.max_agents) settingsPatch.max_agents = plan.max_agents;
  await db.from("wireline_settings").upsert(settingsPatch, { onConflict: "user_id" });

  // Fan out to operator webhooks so external systems can react
  // (e.g. notify Slack on downgrade / cancellation).
  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id || null,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString() : null,
    at: new Date().toISOString(),
  }).catch(() => {});
}

app.post("/api/stripe-webhook", async (req: any, res: any) => {
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe webhook not configured." });
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature header." });
  let event: Stripe.Event;
  try {
    // express.raw populated req.body as a Buffer — pass it through verbatim.
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    log.warn("Stripe webhook signature verification failed", { error: getErrorMessage(err) });
    return res.status(400).json({ error: `Webhook Error: ${getErrorMessage(err)}` });
  }

  // Idempotency — Stripe retries on timeouts and occasionally double-
  // delivers. The unique constraint on event_id means a duplicate insert
  // returns an error we use as our short-circuit signal. We INSERT first
  // (claiming the event) and only proceed if the insert succeeded.
  // If processing later throws, we DELETE the row in the catch so a
  // retry can replay; otherwise the row stays and prevents replay.
  const idempotencyKey = event.id;
  let claimed = false;
  try {
    const { error: claimErr } = await db
      .from("wireline_stripe_events")
      .insert({ event_id: idempotencyKey, event_type: event.type });
    if (claimErr) {
      // Most common case: duplicate key — already processed.
      log.info("Stripe webhook duplicate event ignored", {
        eventId: idempotencyKey,
        eventType: event.type,
        reason: claimErr.message,
      });
      return res.json({ received: true, duplicate: true });
    }
    claimed = true;
  } catch (err: any) {
    // If the idempotency table doesn't exist yet (schema not migrated),
    // fail-OPEN: log and proceed. Operators see the warning and run the
    // schema. Better than blocking all Stripe webhooks on a missing table.
    log.warn("Stripe idempotency claim failed — proceeding without idempotency guard", {
      error: getErrorMessage(err),
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // First-ever subscription for this customer — pull the sub and sync.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        // Sub status will flip to past_due via the next subscription.updated;
        // we don't need a separate sync here.
        const inv = event.data.object as Stripe.Invoice;
        log.warn("Stripe invoice payment failed", { customerId: inv.customer });
        break;
      }
      default:
        // Many event types — ignore the noise.
        break;
    }
    res.json({ received: true });
  } catch (err: any) {
    log.error("Stripe webhook handler error", { error: getErrorMessage(err) });
    // Release the idempotency claim so Stripe's retry can re-process.
    if (claimed) {
      await db.from("wireline_stripe_events").delete().eq("event_id", idempotencyKey).then(
        () => {},
        (e: any) => log.warn("Failed to release idempotency claim", { error: e?.message }),
      );
    }
    res.status(500).json({ error: getErrorMessage(err) || "Webhook handler failed" });
  }
});

// ==========================================
// 1. VAPI WEBHOOK — system-to-system, signature-verified
// ==========================================
//
// Vapi delivers every webhook with the `serverUrlSecret` value we
// configured on the assistant (see line ~230) echoed back as a header.
// We compare in constant time. If VAPI_WEBHOOK_SECRET isn't set we log
// a one-time warning and allow the request — keeps local dev simple
// without leaving prod open.
//
// VAPI webhook secret — in production we REFUSE to use a default; the
// route handler returns 503 if VAPI_WEBHOOK_SECRET is unset, so we never
// silently accept unauthenticated webhooks. In dev we still default to
// a known value so local Vapi testing works without env juggling.
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || (IS_PROD ? "" : "wireline-secret-key");
let _warnedAboutVapiSecret = false;

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

app.post("/api/vapi-webhook", async (req, res) => {
  // Vapi sends the secret back via one of these headers depending on
  // SDK version — accept either. The older `x-vapi-secret` and the
  // newer signature-style header. We're checking for the shared
  // secret echo, not an HMAC; that's what Vapi's serverUrlSecret
  // delivers.
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (IS_PROD) {
      // Fail closed in production — refusing the webhook is safer than
      // accepting unauthenticated payloads that drive Vapi/LLM spend.
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
      return res.status(503).json({ error: "Webhook auth not configured." });
    }
    if (!_warnedAboutVapiSecret) {
      log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
      _warnedAboutVapiSecret = true;
    }
  } else if (!timingSafeEq(provided, VAPI_WEBHOOK_SECRET)) {
    log.warn("Rejected Vapi webhook with bad/missing signature", {
      requestId: res.locals?.requestId,
    });
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  const payload = req.body;
  const { message } = payload;

  log.info("Vapi webhook received", {
    requestId: res.locals?.requestId,
    messageType: payload?.message?.type,
    agentId: req.query.agentId,
  });
  
  // For webhooks, we need to know WHICH user this is for.
  // We'll extract agentId from query and fetch the agent and its user_id.
  const webhookAgentId = req.query.agentId as string || "default-agent";
  
  // 0. Fetch the agent's owner and their settings
  const { data: agent } = await db.from('wireline_agents').select('user_id').eq('id', webhookAgentId).single();
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { data: userSettings } = await db.from('wireline_settings')
    .select('subscription_status, voice_llm_provider, voice_llm_model')
    .eq('user_id', agent.user_id).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  const voiceLlmProvider = userSettings?.voice_llm_provider || 'google';
  const voiceLlmModel = userSettings?.voice_llm_model || 'gemini-1.5-flash';
  
  if (subscriptionStatus !== 'active') {
    log.warn("Vapi webhook: subscription inactive, rejecting", { agentId: webhookAgentId, status: subscriptionStatus });
    if (message && message.type === "assistant-request") {
        return res.json({
            assistant: {
                firstMessage: "We're sorry, but the automated service for this line is currently suspended. Please contact the administrator.",
                model: {
                    provider: "google",
                    model: "gemini-1.5-flash",
                    systemPrompt: "Tell the user the service is suspended, and gracefully end the call."
                }
            }
        });
    }
    return res.status(403).json({ error: "Access Denied: Inactive Subscription" });
  }
  
  // Vapi calls this prior to connecting the agent
  if (message && message.type === "assistant-request") {
    log.info("Vapi assistant-request", { requestId: res.locals?.requestId, agentId: webhookAgentId });

    try {
      // 0. Extract caller identity early so we can pre-load their history in parallel
      const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
      const customerNumber = message.call?.customer?.number;
      const safeCallerPhone = sanitizePhone(customerNumber);

      // 1. Assemble memory from Supabase (+ pre-load caller history and customer intel in the same round-trip)
      const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData, callerHistoryData, capturedProfileData, callerLeadData] = await Promise.all([
        db.from('wireline_agents').select('*').eq('id', webhookAgentId).single(),
        db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).order('priority', { ascending: false }),
        db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId),
        db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).single(),
        db.from('wireline_agent_lessons').select('lesson').eq('agent_id', webhookAgentId).order('created_at', { ascending: false }).limit(MAX_RUNTIME_LESSONS),
        safeCallerPhone
          ? db.from('wireline_call_logs')
              .select('summary, intent_label, sentiment, created_at, direction')
              .eq('customer_number', safeCallerPhone)
              .eq('agent_id', webhookAgentId)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
        // Load the most recent customer profile captured in a previous call — gives the
        // agent immediate access to pain points, budget, timeline, and agreed next steps.
        // Scoped to user_id (not agent_id) so intel captured by ANY agent in the operator's
        // fleet surfaces here — e.g. sales did discovery, support now handles the live call.
        safeCallerPhone && agent?.user_id
          ? db.from('wireline_fleet_tasks')
              .select('description, created_at')
              .eq('user_id', agent.user_id)
              .eq('task_type', 'customer_profile_captured')
              .ilike('description', `%${safeCallerPhone}%`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // Look up the caller in the operator's CRM (wireline_outbound_leads). When an
        // inbound caller matches a known lead — or an outbound dial targets a known
        // lead — we surface lead.name + status + context in the system prompt so the
        // agent opens the call already knowing who they are and what's outstanding
        // ("Hi Sarah, thanks for calling back about the proposal").
        // Format-tolerant ilike + user_id scoping matches the pattern PR #65
        // standardized for every other lead lookup in this file.
        safeCallerPhone && agent?.user_id
          ? db.from('wireline_outbound_leads')
              .select('customer_name, status, context')
              .eq('user_id', agent.user_id)
              .ilike('customer_number', `%${safeCallerPhone}%`)
              .not('status', 'in', ['Blocked-DNC'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Filter knowledge-gap lessons from runtime injection — they are training signals
      // for the operator to review, not real-time performance hints for the agent.
      const lessons = (lessonsData?.data || [])
        .filter((l: any) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
        .map((l: any) => l.lesson)
        .join('\n');

      // Build CALLER PROFILE block — pre-loaded so the agent has context from word 1
      const pastCallHistory: any[] = (callerHistoryData as any)?.data || [];
      const callerProfile = buildCallerProfileBlock(pastCallHistory, false);

      // Build CUSTOMER INTEL block from previously captured profile data.
      // This pre-arms the agent with pain points, budget, timeline, and agreed next
      // steps from prior calls — no tool call required.
      const rawProfileDesc = (capturedProfileData as any)?.data?.description || "";
      const customerIntelBlock = buildCustomerIntelBlock(rawProfileDesc, false);

      // TEMPORAL AWARENESS: Inject exact current time so the agent knows what "Today" and "Tomorrow" mean
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // 1.5. LEAD INTEL — works for BOTH inbound and outbound.
      //
      //  - Outbound: framed as MISSION OBJECTIVE so the closer/collector knows
      //    why they're dialing.
      //  - Inbound: framed as INBOUND CRM MATCH so the agent recognizes the
      //    caller from word 1 ("Hi Sarah, thanks for calling back about the
      //    proposal we discussed Tuesday").
      //
      // Status is included in both so the agent has continuity cues —
      // 'Voicemail-Left' means follow-up after a left voicemail,
      // 'Callback-Scheduled' means honoring a callback they requested.
      let leadContext = "";
      const callerLead: any = (callerLeadData as any)?.data || null;
      if (callerLead) {
        const name   = callerLead.customer_name || "this contact";
        const status = callerLead.status || "Unknown";
        const ctx    = callerLead.context || "(no prior context)";
        leadContext = isOutbound
          ? `MISSION OBJECTIVE: You are calling ${name} (CRM status: ${status}). REASON FOR CALL: ${ctx}`
          : `INBOUND CRM MATCH: This caller is ${name} — they're a known contact in your CRM (status: ${status}). PRIOR CONTEXT: ${ctx}\nUSE THIS: Greet them by name, reference the open thread naturally, do not ask them to re-explain who they are or why they're calling.`;
      }

      // For outbound calls, derive the archetype from the agent's role rather than
      // forcing every outbound call to be a high-pressure closer. A collections
      // agent calling about a balance should not sound like a sales rep.
      const agentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
      const archetype = isOutbound
        ? (OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || 'The Closer')
        : (agentConfig?.data?.archetype || 'Receptionist');
      const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);

      const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';
      const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

      const systemPrompt = `
## IDENTITY & MISSION
You are ${agentConfig?.data?.name || 'Wireline Agent'}, a ${agentRole.replace(/_/g, ' ')} specialist for this company. You are not a chatbot or a phone tree — you are a trained professional operating at the highest level of your role.
${ambientNoiseActive ? "You are operating from a professional office environment. Speak with focused, professional energy." : ""}

${callerProfile}

${customerIntelBlock}

## YOUR PROFESSIONAL CHARACTER & METHOD
${personalityData?.data?.content || "You are a highly professional, empathetic, and effective representative who puts the caller's outcome first."}

## YOUR TACTICAL APPROACH FOR THIS ROLE
${archetypeRules}

${leadContext ? `## ⚡ ${isOutbound ? "MISSION BRIEF" : "CRM MATCH"} — READ BEFORE SPEAKING\n${leadContext}\n` : ""}

${agentConfig?.data?.website_url ? `## COMPANY WEBSITE\nYour company's official website: ${agentConfig.data.website_url}. For detailed specs, pricing pages, or information not in your knowledge base, direct callers here.` : ""}

${lessons ? `## LEARNED IMPROVEMENTS (APPLY THESE)\nYour previous call analysis identified these adjustments — apply them actively:\n${lessons}\n` : ""}

${roleProtocol}

## EMOTIONAL INTELLIGENCE PROTOCOLS
- ANGER DETECTION: If you detect frustration, sharp tone, or repeated complaints, your next response MUST start with emotional validation before any solution. Example: "I hear you — that's genuinely frustrating, and I want to make this right."
- CONFUSION DETECTION: If the caller says "I don't understand" or sounds lost, simplify immediately. Drop jargon. Use an analogy. Confirm they're with you before continuing.
- DISTRESS DETECTION: If a caller sounds genuinely distressed (not just annoyed), lower your pace, soften your tone, and prioritize emotional safety over efficiency.
- DELIGHT DETECTION: Match positive energy. When a caller is enthusiastic, be enthusiastic back. Authentic mirroring builds trust.

## MEMORY & CONTINUITY
Today is ${currentDateTime} (Eastern Time). Calculate specific dates when callers reference "tomorrow," "next week," or relative dates — confirm the calculated date back to them explicitly.
${callerProfile ? "Caller history is already pre-loaded above — use it immediately. You may still call view_recent_interactions mid-call for a live refresh." : "If a caller references a previous interaction or seems to know your company: use the 'view_recent_interactions' tool immediately to retrieve their history before responding. Personalized continuity is a competitive advantage."}

## SILENCE MANAGEMENT
If the caller goes silent for 3+ seconds: break with a single, warm question — "Are you still there?" and wait.
If silence extends beyond 10 seconds: "I'm still here — take your time." Do not fill silence with nervous chatter.
If silence exceeds 20 seconds: "I want to make sure I'm not losing you — would a callback at a better time work?"
Never interpret silence as rejection or disinterest. Silence often means the caller is thinking. Give them space.

## CONVERSATION DISCIPLINE
- Response target: 15–25 words conversationally. Up to 50 words ONLY for multi-detail confirmations (booking summary, payment terms). Never monologue.
- One question per turn. Always. Never stack questions.
- Don't echo: do not parrot back what the caller just said. Add value with each response.
- Speak numbers naturally: "four fifteen" not "four hundred and fifteen." Spell out reference IDs letter by letter if needed.
- Use the caller's name once every 3–4 exchanges — not robotically, and never at the start of every sentence.
- Language adaptation: If the caller speaks in a language other than English, match that language for the rest of the call. Do not wait for them to ask — adapt immediately.
- Objection memory: When a caller raises an objection you address and they acknowledge, do NOT re-raise it later. Each objection is resolved once, then set aside.

## TOOL USE MANDATES
ESCALATION (use 'escalate_to_human' tool when ANY of these apply — ALWAYS include a "reason"):
1. Caller explicitly asks for a human or supervisor — honor it after the second request.
2. Profanity, verbal abuse, or clear emotional crisis from the caller.
3. Legal or liability language is used ("I'm going to sue," "my lawyer said").
4. High-value threshold: quotes over $5,000, contract terms, or account security issues.
5. Stuck loop: the same issue has been addressed 3 times without resolution.

SCHEDULING (use 'check_calendar_availability' then 'book_appointment'):
Always check availability before confirming. Never promise a slot from memory.
After booking: read the full confirmation (name, date, time, location/link, reference ID) to the caller and get verbal confirmation.

EMAIL HANDOFF (use 'send_email' tool):
When a caller needs documentation, quotes, confirmations, or follow-up info: "I'll have that sent to you right now — what email should I use?" Then send it. Tell them: "Done — you'll have it within a few minutes."

LEAD TRACKING (use 'search_leads' and 'update_lead_status' tools):
Search for existing context before discussing account details. Update the lead status at the END of every commercial interaction — never leave a conversation outcome unlogged.

CALLBACK SCHEDULING (use 'schedule_callback' tool):
When an inbound caller requests a callback at a specific time, use the schedule_callback tool immediately. Calculate the exact ISO 8601 datetime from what they say. Confirm it back to them: "I have you down for [exact time] — you'll hear from us then."

CUSTOMER PROFILE CAPTURE (use 'capture_customer_profile' tool):
During any meaningful conversation, capture what you learn. Use this tool when you discover:
- Pain points, challenges, or specific frustrations the caller mentions
- Budget range or pricing sensitivity (even vague: "looking for something affordable")
- Timeline or urgency ("need this before summer", "just browsing for now")
- Whether they're the decision-maker or need sign-off from others
- Key objections or hesitations they raise
- Features or outcomes they're excited about
- Any next step you've agreed on
Do NOT wait until the end of the call — capture as you learn. You may call this tool more than once per call if new intel surfaces.

## CALL CLOSING STANDARD
Never end a call without:
- A confirmed next step (specific date/time) or an explicit acknowledgment that none is needed
- A brief recap: "Just to confirm — [one sentence summary of what was agreed or resolved]."
- A warm, professional close: "Thanks for calling[, Name] — [I look forward to / I'll make sure] [reference the next step]."
For support and service calls: ask once, genuinely: "Is there anything else I can help you with today?"
Own the ending. Never trail off. Never let the caller hang up in uncertainty.

## HONESTY & TRUST GUARDRAILS
If asked something you don't know or isn't in the knowledge base:
→ "That's a great question — I want to make sure I give you accurate information. Let me connect you with someone who can confirm that for you. What's the best email to reach you?"
NEVER guess, approximate, or invent: prices, dates, availability, product specs, or company policies.
NEVER make promises you cannot fulfill. Under-promise and over-deliver.

## ABSOLUTE OPERATOR RULES (NON-NEGOTIABLE)
${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n') || "Follow all standard professional and ethical guidelines."}

## KNOWLEDGE BASE
${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n') || "No specific knowledge base entries loaded. Rely on your training and the caller's context."}
      `;

      // Apply the agent's business profile (hours / compliance / guardrails
      // / variables / KPI focus) to the system prompt. For inbound calls
      // we don't refuse the call out-of-hours — the caller is already on
      // the line. Instead, when out-of-hours we override the first message
      // with the operator's out-of-hours announcement.
      const inboundRuntimeProfile: AgentRuntimeProfile = {
        timezone: agentConfig?.data?.timezone,
        business_hours: agentConfig?.data?.business_hours,
        compliance_mode: agentConfig?.data?.compliance_mode,
        disallowed_topics: agentConfig?.data?.disallowed_topics,
        escalation_keywords: agentConfig?.data?.escalation_keywords,
        business_variables: agentConfig?.data?.business_variables,
        out_of_hours_message: agentConfig?.data?.out_of_hours_message,
        kpi_focus: agentConfig?.data?.kpi_focus,
      };
      const inboundRuntime = buildAgentRuntimeContext(systemPrompt, inboundRuntimeProfile);
      const inboundFirstMessage =
        (!inboundRuntime.inHours && inboundRuntime.outOfHoursMessage)
          ? inboundRuntime.outOfHoursMessage
          : (agentConfig?.data?.first_message || "Hello! Thank you for calling. How can I help you today?");

      const responsePayload = {
        assistant: {
          name: agentConfig?.data?.name || "Wireline Agent",
          firstMessage: inboundFirstMessage,
          serverUrlSecret: VAPI_WEBHOOK_SECRET,
          serverMessages: ["tool-calls", "status-update", "conversation-update", "end-of-call-report"],
          backgroundSound: agentConfig?.data?.ambient_noise || 'off',
          // Per-user voice LLM choice (defaults to Gemini Flash for backward
          // compat). Operators set this in Core Settings — pick "anthropic"
          // and a Claude model Vapi supports (e.g. claude-3-5-sonnet-20241022)
          // to route the voice agent through Claude.
          model: {
            provider: voiceLlmProvider,
            model: voiceLlmModel,
            systemPrompt: inboundRuntime.prompt,
            temperature: llmTemp,
          },
          recordingEnabled: true,
          voice: {
            provider: isOutbound ? (agentConfig?.data?.voice_provider_outbound || agentConfig?.data?.voice_provider || "11labs") : (agentConfig?.data?.voice_provider_inbound || agentConfig?.data?.voice_provider || "11labs"),
            voiceId: isOutbound ? (agentConfig?.data?.voice_id_outbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") : (agentConfig?.data?.voice_id_inbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") 
          },
          functions: buildRoleToolDefs(agentRole)
        }
      };

      log.debug("Vapi assistant-request served", { requestId: res.locals?.requestId, agentId: webhookAgentId });
      return res.json(responsePayload);
    } catch (e: any) {
      log.error("Vapi webhook config error", { requestId: res.locals?.requestId, agentId: webhookAgentId, error: e?.message || String(e) });
      // Give Vapi a graceful fallback so it doesn't freeze
      return res.json({
         assistant: {
           firstMessage: "I'm sorry, my memory banks are currently offline.",
           model: { provider: "google", model: "gemini-1.5-flash", systemPrompt: "Apologize and hang up." }
         }
      });
    }
  }
  
  if (message && message.type === "tool-calls") {
    log.debug("Vapi tool-calls received", { requestId: res.locals?.requestId, agentId: webhookAgentId, tools: (message.toolCalls || []).map((t: any) => t?.function?.name) });
    
    // Fetch agent config once for all tools in this call
    const { data: agent } = await db.from('wireline_agents').select('*').eq('id', webhookAgentId).single();

    const results = [];
    
    for (const toolCall of message.toolCalls) {
      
      // TOOL 0: CONTEXTUAL RECALL (MEMORY)
      if (toolCall.function.name === "view_recent_interactions") {
         try {
            const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "unknown";
            
            log.debug("[MEMORY] Fetching history", { customerPhone });

            // Use shared sanitizePhone helper — strips wildcards and limits length.
            const safePhone = sanitizePhone(customerPhone);

            // 1. Fetch last 3 call summaries — scope to the sanitized phone to prevent
            //    wildcard injection. Scope to this agent when possible for access isolation,
            //    but fall back to user-scoped results when webhookAgentId is unavailable.
            const callLogsQuery = db.from('wireline_call_logs')
               .select('summary, intent_label, created_at')
               .eq('customer_number', safePhone)
               .order('created_at', { ascending: false })
               .limit(3);
            const { data: pastCalls } = webhookAgentId
               ? await callLogsQuery.eq('agent_id', webhookAgentId)
               : await callLogsQuery.eq('user_id', agent?.user_id);

            // 2. Fetch any open tasks mentioning this customer's phone number.
            //    Tasks are linked by description (which includes the phone) or by the
            //    customer_info JSONB phone field — not by email, since we only have a
            //    phone number here.
            const { data: tasks } = safePhone
               ? await db.from('wireline_fleet_tasks')
                  .select('description, status, priority')
                  .eq('user_id', agent?.user_id)
                  .or(`description.ilike.%${safePhone}%,customer_info->>phone.ilike.%${safePhone}%`)
                  .eq('status', 'pending')
                  .limit(2)
               : { data: [] };

            // 3. Fetch the most recent captured customer profile (pain points,
            //    budget, timeline, objections, next-step) — this is the
            //    highest-leverage intel for shaping the live conversation.
            const { data: leadIntel } = safePhone
               ? await db.from('wireline_outbound_leads')
                  .select('name, status, context')
                  .eq('user_id', agent?.user_id)
                  .ilike('customer_number', `%${safePhone}%`)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle()
               : { data: null };

            let contextReport = `RECENT CONTEXT FOR ${customerPhone}:\n`;
            if (pastCalls && pastCalls.length > 0) {
               contextReport += "PAST CALL HISTORY:\n" + pastCalls.map(c => `- [${new Date(c.created_at).toLocaleDateString()}] Intent: ${c.intent_label || 'Inquiry'}. Summary: ${c.summary}`).join('\n');
            } else {
               contextReport += "No previous voice interaction history found.\n";
            }

            if (tasks && tasks.length > 0) {
               contextReport += "\nACTIVE MISSIONS/TASKS:\n" + tasks.map(t => `- [${t.priority.toUpperCase()}] ${t.description} (Status: ${t.status})`).join('\n');
            }

            if (leadIntel?.context) {
               const intelPreview = leadIntel.context.slice(0, MAX_CONTEXT_PREVIEW_LENGTH * 4);
               contextReport += `\nCAPTURED CUSTOMER PROFILE${leadIntel.name ? ` (${leadIntel.name})` : ''}:\n${intelPreview}`;
            }

            results.push({
              toolCallId: toolCall.id,
              result: contextReport || "No interaction signals found in the neural cache."
            });
            continue;
         } catch (e: any) {
            log.error("Vapi tool: recall failed", { agentId: webhookAgentId, error: e?.message || String(e) });
            results.push({ toolCallId: toolCall.id, result: "Memory retrieval error. Process caller as a new contact for safety." });
            continue;
         }
      }
      
      // TOOL 1: CHECK AVAILABILITY
      if (toolCall.function.name === "check_calendar_availability") {
         try {
            const { date } = toolCall.function.arguments;
            // Sanitize the date string so LIKE wildcards (% _) from the LLM
            // cannot manipulate the query pattern. Keep only characters that
            // appear in natural date expressions (letters, digits, spaces,
            // commas, slashes, hyphens, periods).
            const safeDate = String(date || '').replace(/[^A-Za-z0-9 ,\/\-\.]/g, '').slice(0, 60);
            if (!safeDate) {
              results.push({ toolCallId: toolCall.id, result: "No date provided. Please ask the customer which date they need." });
              continue;
            }
            // Scope to this agent's bookings so cross-operator calendar isolation is preserved.
            const { data, error } = await db.from('wireline_appointments')
              .select('time, service_type')
              .ilike('date', `%${safeDate}%`)
              .eq('user_id', agent?.user_id);
            
            if (error) throw error;

            if (data && data.length > 0) {
               const bookedTimes = data.map(appt => appt.time).join(", ");
               results.push({
                 toolCallId: toolCall.id,
                 result: `The following times are already booked on ${safeDate}: ${bookedTimes}. Please tell the customer these times are unavailable and offer them any other time.`
               });
            } else {
               results.push({
                 toolCallId: toolCall.id,
                 result: `The entire day on ${safeDate} is completely open. You can offer them any time during normal business hours.`
               });
            }
         } catch (e) {
            results.push({ toolCallId: toolCall.id, result: "Cannot access calendar. Assume open for now but warn customer it is pending." });
         }
      }

      // TOOL 2: BOOK APPOINTMENT
      if (toolCall.function.name === "book_appointment") {
        try {
          const args = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || null;
          const safeApptPhone = customerPhone ? sanitizePhone(customerPhone) : null;

          // Insert actual appointment into Supabase. Capturing phone_number
          // (column already in schema) lets ContactProfile / CallLogs deep-link
          // appointments back to the contact record.
          const { data, error } = await db.from('wireline_appointments').insert({
            agent_id: webhookAgentId,
            user_id: agent?.user_id,
            call_id: message.call?.id || "in-call",
            date: args.date || "Unknown Date",
            time: args.time || "Unknown Time",
            customer_name: args.customer_name || "Guest",
            service_type: args.service_type || "General Service",
            status: "Scheduled",
            phone_number: safeApptPhone || null,
          }).select('id').single();

          if (error) throw error;

          const refId = data.id.split('-')[0];
          // Echo the full confirmation so the LLM can read it back verbatim, per the
          // CALL CLOSING STANDARD: "read the full confirmation… and get verbal confirmation."
          results.push({
            toolCallId: toolCall.id,
            result: `Appointment confirmed. Read this back to the caller verbatim and ask them to confirm: "I have you booked for ${args.service_type || 'General Service'} on ${args.date || 'the requested date'} at ${args.time || 'the requested time'}, under the name ${args.customer_name || 'Guest'}. Your reference number is ${refId}. Did I get all that right?"`,
          });
        } catch (e: any) {
          log.error("Vapi tool: book_appointment failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({
            toolCallId: toolCall.id,
            result: "I'm sorry, I'm having trouble accessing the calendar database right now."
          });
        }
      }

      // TOOL 3: ESCALATE TO HUMAN
      if (toolCall.function.name === "escalate_to_human") {
        try {
          const { reason } = toolCall.function.arguments;
          if (!reason) {
            log.warn("Vapi tool: escalate_to_human called without reason — schema violation", { agentId: webhookAgentId });
          }
          const dest = agent?.transfer_phone || "the front office";
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";

          // Log the escalation as a high-priority fleet task so operators see it immediately.
          await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'escalation',
            description: `[ESCALATION] Caller ${customerPhone} — ${reason || "No reason provided"}. Transferring to: ${dest}`,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "in-call",
            target_channel: 'manual',
            priority: 'high',
            status: 'pending',
          }).then(undefined, (e: any) => {
            log.warn("Vapi tool: escalate_to_human fleet task insert failed", { error: e?.message });
          });

          results.push({
            toolCallId: toolCall.id,
            result: `Say: "I completely understand — I'm connecting you with ${dest} right now. Please hold for just a moment." Then remain on the line, politely acknowledge them, and allow the transfer to complete. Do not end the call yourself.`,
          });
        } catch {
          const dest = agent?.transfer_phone || "the front office";
          results.push({
            toolCallId: toolCall.id,
            result: `Say: "I'm connecting you with ${dest} right now. Please hold for just a moment." Remain on the line and allow the transfer to complete.`,
          });
        }
      }

      // TOOL 4: ROUTING HANDOFF (PHONE -> EMAIL)
      if (toolCall.function.name === "send_email") {
         try {
           const { to_email, subject, body } = toolCall.function.arguments;

           // SECURITY: scope all account lookups to the agent's owner.
           // Earlier the fallback fetched ANY email account in the database
           // — for a multi-tenant fleet that could send mail through another
           //   user's connected inbox. We only fall back within the same
           //   user.
           const ownerUserId = agent?.user_id;
           if (!ownerUserId) {
              log.warn("Vapi tool: send_email called without resolvable user", { webhookAgentId });
              results.push({
                toolCallId: toolCall.id,
                result: "Email system unavailable for this call. Inform the customer."
              });
              continue;
           }

           // Try the agent's assigned account first, then any of the
           // owner's connected accounts.
           let { data: accounts } = webhookAgentId
             ? await db.from('wireline_email_accounts').select('*').eq('agent_id', webhookAgentId).eq('user_id', ownerUserId).limit(1)
             : { data: [] as any[] };
           if (!accounts || accounts.length === 0) {
             ({ data: accounts } = await db.from('wireline_email_accounts').select('*').eq('user_id', ownerUserId).limit(1));
           }

           if (!accounts || accounts.length === 0) {
              results.push({
                toolCallId: toolCall.id,
                result: "Email system is not connected to any inbox. Inform the customer."
              });
              continue;
           }

           const account = accounts[0];
           const curAgentId = webhookAgentId || "default-agent";

           // Create a Fleet Handoff Task (for traceability & monitoring)
           const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
              source_type: 'phone_call',
              source_id: message.call?.id || "manual-handoff",
              target_channel: 'email',
              agent_id: curAgentId,
              customer_info: { email: to_email },
              task_type: 'follow_up',
              description: `Subject: ${subject}\n\n${body}`,
              status: 'processing'
           }).select('*').single();

           if (taskError) throw taskError;

           let dispatchedId = "";
           let threadKey = "";

           if (account.provider === 'microsoft') {
             // ── Microsoft Graph path ─────────────────────────────────────────
             const msResult = await sendEmailViaMicrosoft({ account, to: to_email, subject, body });
             dispatchedId = msResult.messageId;
             threadKey    = msResult.conversationId || `ms-call-${Date.now()}`;
           } else {
             // ── Gmail path ───────────────────────────────────────────────────
             const oauth2Client = getGoogleOAuthClient(req);
             oauth2Client.setCredentials({
               access_token: account.access_token,
               refresh_token: account.refresh_token,
               expiry_date: account.expires_at
             });
             const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
             const messageParts = [
               `To: ${to_email}`,
               `Subject: ${subject}`,
               'Content-Type: text/plain; charset=utf-8',
               '',
               body
             ];
             const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64url');
             const gmailRes = await gmail.users.messages.send({
               userId: 'me',
               requestBody: { raw: encodedMessage }
             });
             dispatchedId = gmailRes.data.id || "";
             threadKey    = gmailRes.data.threadId || "";
           }

           // OMNICHANNEL SYNC: Log the phone-originated email to the hub
           try {
              let { data: thread } = await db.from('wireline_email_threads').select('*').eq('thread_id', threadKey).single();
              if (!thread) {
                 const { data: newThread } = await db.from('wireline_email_threads').insert({
                   user_id: agent?.user_id,
                   account_id: account.id,
                   thread_id: threadKey,
                   customer_email: to_email,
                   subject: subject,
                   status: 'open',
                   summary: `Phone Follow-up: ${to_email}`
                 }).select('*').single();
                 thread = newThread;
              }
              // user_id is required so the message is visible to the operator
              // through RLS-protected reads in EmailInbox (auth.uid() = user_id).
              await db.from('wireline_email_messages').insert({
                 user_id: agent?.user_id,
                 thread_id: thread.id,
                 google_message_id: dispatchedId,
                 role: 'ai',
                 content: body
              });
              await db.from('wireline_email_threads').update({ last_message_at: new Date() }).eq('id', thread.id);
           } catch(syncErr: any) {
              log.warn("Vapi tool: omnichannel email sync error", { agentId: webhookAgentId, error: syncErr?.message || String(syncErr) });
           }

           await db.from('wireline_fleet_tasks').update({ status: 'completed' }).eq('id', task.id);

           results.push({
             toolCallId: toolCall.id,
             result: `Successfully handed off follow-up task to the AI Email Fleet. Task ID: ${task.id.split('-')[0]}. The email has been dispatched via your connected mailroom.`
           });
         } catch (e: any) {
           log.error("Vapi tool: fleet handoff failed", { agentId: webhookAgentId, error: e?.message || String(e) });
           results.push({
             toolCallId: toolCall.id,
             result: "Handoff to email system failed. Please take a manual note."
           });
         }
      }

      // TOOL 5: FLEET TASK
      if (toolCall.function.name === "create_fleet_task") {
        try {
           const { description, priority } = toolCall.function.arguments;
           // wireline_fleet_tasks has no `source` column — use source_type/source_id
           // (matching every other tool handler) so this insert actually persists.
           const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              task_type: 'follow_up',
              description,
              priority: priority || 'medium',
              status: 'pending',
              source_type: 'phone_call',
              source_id: message.call?.id || payload.call?.id || "in-call",
              target_channel: 'manual',
           }).select('id').single();
           
           if (taskError) throw taskError;
           results.push({ toolCallId: toolCall.id, result: `Task ${task.id.split('-')[0]} created in mission queue.` });
        } catch (e: any) {
           log.error("Vapi tool: create_fleet_task failed", { agentId: webhookAgentId, error: e?.message || String(e) });
           results.push({ toolCallId: toolCall.id, result: "Failed to create task in mission queue." });
        }
      }

      // TOOL 6: SEARCH LEADS
      if (toolCall.function.name === "search_leads") {
        try {
           const { query } = toolCall.function.arguments;
           // Sanitize the query to prevent LIKE wildcard injection from LLM output.
           // Keep only characters that are valid in names, emails, and phone numbers.
           // Note: `_` and `%` are LIKE wildcards and are intentionally excluded.
           const safeQuery = String(query || '').replace(/[^A-Za-z0-9 @.\-+]/g, '').slice(0, 80);
           if (!safeQuery) {
             results.push({ toolCallId: toolCall.id, result: "No search query provided. Ask the caller for their name, email, or phone number." });
             continue;
           }
           const { data: leads } = await db.from('wireline_outbound_leads')
             .select('name, status, email, customer_number, last_contact_summary, context')
             .or(`name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,customer_number.ilike.%${safeQuery}%`)
             .eq('user_id', agent?.user_id)
             .limit(3);
           
           if (leads && leads.length > 0) {
              const summaries = leads.map(l => {
                const parts = [`${l.name} (${l.status})`];
                if (l.email) parts.push(`Email: ${l.email}`);
                if (l.customer_number) parts.push(`Phone: ${l.customer_number}`);
                if (l.last_contact_summary) parts.push(`Last contact: ${l.last_contact_summary}`);
                if (l.context) parts.push(`Notes: ${l.context.slice(0, MAX_CONTEXT_PREVIEW_LENGTH)}`);
                return parts.join(' | ');
              });
              results.push({ toolCallId: toolCall.id, result: `Found ${leads.length} matching record(s):\n${summaries.join('\n')}` });
           } else {
              results.push({ toolCallId: toolCall.id, result: "No matching lead profiles found. This may be a new contact." });
           }
        } catch (e) {
           results.push({ toolCallId: toolCall.id, result: "Lead database is currently unreachable." });
        }
      }

      // TOOL 7: UPDATE LEAD STATUS
      if (toolCall.function.name === "update_lead_status") {
        try {
          const { status, notes } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number;
          if (customerPhone) {
            const safePhone = sanitizePhone(customerPhone);
            // Preserve in-flight / compliance statuses set by other tool handlers
            // (Voicemail-Left, Callback-Scheduled, Blocked-DNC) so a final-status
            // update from the LLM never clobbers a meaningful outcome.
            await db.from('wireline_outbound_leads')
              .update({ status, last_contact_summary: notes || '', last_called_at: new Date() })
              .eq('user_id', agent?.user_id)
              .ilike('customer_number', `%${safePhone}%`)
              .not('status', 'in', PRESERVED_LEAD_STATUSES);
          }
          results.push({ toolCallId: toolCall.id, result: `Lead status updated to '${status}'. CRM record saved.` });
        } catch (e: any) {
          log.error("Vapi tool: update_lead_status failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Failed to update lead status. Note the outcome manually." });
        }
      }

      // TOOL 8: LOG PAYMENT PROMISE (collections compliance)
      if (toolCall.function.name === "log_payment_promise") {
        try {
          const { amount_promised, payment_date, payment_method } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";
          await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'payment_promise',
            description: `[PAYMENT PROMISE] Caller: ${customerPhone} — ${amount_promised} due by ${payment_date}. Method: ${payment_method || 'not specified'}`,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "in-call",
            target_channel: 'manual',
            priority: 'high',
            status: 'pending',
          });
          results.push({ toolCallId: toolCall.id, result: `Payment promise recorded: ${amount_promised} by ${payment_date}. Compliance log updated.` });
        } catch (e: any) {
          log.error("Vapi tool: log_payment_promise failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Failed to log payment promise. You must manually record this commitment for compliance." });
        }
      }

      // TOOL 9: CREATE SUPPORT TICKET (technical_support)
      if (toolCall.function.name === "create_support_ticket") {
        try {
          const { issue_summary, error_codes, severity } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";
          const ticketDescription = `[SUPPORT TICKET] ${severity.toUpperCase()} — Caller: ${customerPhone}\nIssue: ${issue_summary}${error_codes ? `\nError Codes: ${error_codes}` : ''}`;
          const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'support_ticket',
            description: ticketDescription,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "in-call",
            target_channel: 'manual',
            priority: (severity === 'critical' || severity === 'high') ? 'high' : severity === 'medium' ? 'medium' : 'low',
            status: 'pending',
          }).select('id').single();
          if (taskError) throw taskError;
          results.push({ toolCallId: toolCall.id, result: `Support ticket #${(task?.id || '').toString().slice(0, 8)} opened with ${severity} severity. Engineering team has been notified.` });
        } catch (e: any) {
          log.error("Vapi tool: create_support_ticket failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Failed to create support ticket. Please note the issue details and file a ticket manually." });
        }
      }

      // TOOL 10: LEAVE VOICEMAIL (outbound — agent has reached an answering machine)
      if (toolCall.function.name === "leave_voicemail") {
        try {
          const { voicemail_message } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";

          // Log the voicemail attempt as a fleet task so operators know outreach happened
          await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'voicemail_left',
            description: `[VOICEMAIL LEFT] ${customerPhone} — Message: "${voicemail_message}"`,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "outbound",
            target_channel: 'manual',
            priority: 'low',
            status: 'pending',
          });

          // Mark the outbound lead as voicemail-left so campaigns don't duplicate.
          // Use sanitized phone + ilike to tolerate format drift (+15555551234 vs
          // 5555551234), matching update_lead_status / schedule_callback.
          // Exclude terminal statuses so we never overwrite a final outcome.
          const safeVmPhone = sanitizePhone(customerPhone);
          if (safeVmPhone) {
            await db.from('wireline_outbound_leads')
              .update({ status: 'Voicemail-Left', last_called_at: new Date() })
              .eq('user_id', agent?.user_id)
              .ilike('customer_number', `%${safeVmPhone}%`)
              .not('status', 'in', ['Completed', 'Voicemail-Left', 'Blocked-DNC', 'Failed']);
          }

          results.push({
            toolCallId: toolCall.id,
            result: "Voicemail logged. Deliver your message now — speak naturally and end with 'I look forward to connecting with you.' Then say goodbye to conclude the call.",
          });
        } catch (e: any) {
          log.error("Vapi tool: leave_voicemail failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Voicemail logged. Deliver your message and say goodbye." });
        }
      }

      // TOOL 11: SCHEDULE CALLBACK — agent books a specific date/time for an auto-redial
      if (toolCall.function.name === "schedule_callback") {
        try {
          const { callback_datetime, notes } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";

          const scheduledAt = new Date(callback_datetime);
          if (isNaN(scheduledAt.getTime())) throw new Error("Invalid callback datetime provided.");

          const safePhone = sanitizePhone(customerPhone);
          const friendlyTime = scheduledAt.toLocaleString("en-US", {
            timeZone: "America/New_York",
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });

          await db.from('wireline_outbound_leads')
            .update({
              status: 'Callback-Scheduled',
              callback_scheduled_at: scheduledAt.toISOString(),
              last_contact_summary: notes || `Callback scheduled for ${friendlyTime} ET`,
              last_called_at: new Date(),
            })
            .eq('user_id', agent?.user_id)
            .ilike('customer_number', `%${safePhone}%`)
            .not('status', 'in', ['Completed', 'Blocked-DNC']);

          // Also log as a fleet task so the operator can see the commitment
          await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'callback_scheduled',
            description: `[CALLBACK] ${customerPhone} — ${friendlyTime} ET${notes ? ` — ${notes}` : ''}`,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "in-call",
            target_channel: 'manual',
            priority: 'medium',
            status: 'pending',
          });

          results.push({
            toolCallId: toolCall.id,
            result: `Callback confirmed for ${friendlyTime} Eastern Time. The system will automatically call them back. Tell the contact: "I have you scheduled for a callback on ${friendlyTime} Eastern — you'll hear from us then." Then say goodbye.`,
          });
        } catch (e: any) {
          log.error("Vapi tool: schedule_callback failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Callback noted — confirm the time to the caller and our team will follow up manually." });
        }
      }

      // TOOL 12: CAPTURE CUSTOMER PROFILE — structured intel from the live call
      if (toolCall.function.name === "capture_customer_profile") {
        try {
          const {
            pain_points, budget_range, timeline, decision_authority,
            objections, interests, next_step_agreed,
          } = toolCall.function.arguments;
          const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "Unknown";

          // Build a structured profile note string.
          const profileNote = [
            `Pain points: ${pain_points || "(none noted)"}`,
            budget_range    ? `Budget: ${budget_range}`            : null,
            timeline        ? `Timeline: ${timeline}`              : null,
            `Decision authority: ${decision_authority || "unknown"}`,
            objections      ? `Objections: ${objections}`          : null,
            interests       ? `Interests: ${interests}`            : null,
            next_step_agreed ? `Next step: ${next_step_agreed}`    : null,
          ].filter(Boolean).join(" | ");

          // Update outbound lead context for ANY call (inbound or outbound) where the
          // caller's phone matches a lead in the CRM — so profile intel persists for
          // all future outbound attempts to this number too.
          // NOTE: ilike('%phone%') (matching update_lead_status / schedule_callback /
          // leave_voicemail) tolerates format drift between '+15555551234' and
          // '5555551234'; an exact .eq() match silently dropped real-world matches.
          const safePhone = sanitizePhone(customerPhone);
          if (safePhone) {
            const { data: existingLead } = await db
              .from('wireline_outbound_leads')
              .select('id, context')
              .eq('user_id', agent?.user_id)
              .ilike('customer_number', `%${safePhone}%`)
              .not('status', 'in', ['Blocked-DNC'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingLead) {
              const existing = existingLead.context ? `${existingLead.context}\n` : "";
              await db.from('wireline_outbound_leads')
                .update({ context: `${existing}[Profile captured ${new Date().toISOString().slice(0, 10)}] ${profileNote}` })
                .eq('id', existingLead.id);
            }
          }

          // Always log as a fleet task so operators see the intel.
          await db.from('wireline_fleet_tasks').insert({
            user_id: agent?.user_id,
            agent_id: webhookAgentId,
            task_type: 'customer_profile_captured',
            description: `[CUSTOMER PROFILE] ${customerPhone} — ${profileNote}`,
            source_type: 'phone_call',
            source_id: message.call?.id || payload.call?.id || "live",
            target_channel: 'manual',
            priority: 'low',
            status: 'pending',
          });

          results.push({
            toolCallId: toolCall.id,
            result: "Customer profile captured and saved. This context will be available for all future interactions with this contact.",
          });
        } catch (e: any) {
          log.error("Vapi tool: capture_customer_profile failed", { agentId: webhookAgentId, error: e?.message || String(e) });
          results.push({ toolCallId: toolCall.id, result: "Profile noted — continue the conversation." });
        }
      }
    }
    
    res.json({ results });
    return;
  }
  
  // REAL-TIME SIGNAL TRACKING
  if (message && message.type === "status-update") {
     const callId = payload.call?.id;
     // Note: Vapi status can be 'queued', 'ringing', 'in-progress', 'ended'
     const status = message.status || payload.call?.status;
     
     if (callId) {
        if (status === 'in-progress' || status === 'ringing' || status === 'queued') {
           await db.from('wireline_signal_presence').upsert({
              id: callId,
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              customer_number: payload.call?.customer?.number || "Unknown",
              status: status,
              started_at: new Date().toISOString()
           });
        } else if (status === 'ended' || status === 'completed') {
           await db.from('wireline_signal_presence').delete().eq('id', callId);
        }
     }
  }

  // LIVE SENTIMENT TRACKING — conversation-update messages carry the running transcript.
  // Lightweight keyword scan on the last user turns to surface emotional state
  // in LiveMonitor without an LLM API call on every turn.
  if (message && message.type === "conversation-update") {
    const callId = payload.call?.id || message.call?.id;
    if (callId) {
      const turns: any[] = message.conversation || message.messages || [];
      const userTurns = turns.filter((t: any) => t.role === "user").slice(-2);
      const combined = userTurns.map((t: any) => (t.content || t.message || "").toLowerCase()).join(" ");

      const negativeHits = SENTIMENT_ANGRY_SIGNALS.filter(w => combined.includes(w)).length;
      const positiveHits = SENTIMENT_POSITIVE_SIGNALS.filter(w => combined.includes(w)).length;

      let liveSentimentLabel = "Live · Active";
      if (negativeHits >= 2) liveSentimentLabel = "⚠ Frustrated";
      else if (negativeHits === 1) liveSentimentLabel = "Live · Tense";
      else if (positiveHits >= 3) liveSentimentLabel = "✓ Closing";
      else if (positiveHits >= 2) liveSentimentLabel = "✓ Positive";
      else if (positiveHits === 1) liveSentimentLabel = "Live · Engaged";

      await db.from('wireline_signal_presence')
        .update({ label: liveSentimentLabel })
        .eq('id', callId);
    }
  }

  if (message && message.type === "end-of-call-report") {
    log.info("Vapi end-of-call-report received", { requestId: res.locals?.requestId, agentId: webhookAgentId, callId: message.call?.id });
    
    try {
        const call = message.call;
        const analysis = message.analysis;
        
        let duration = 0;
        if (call?.endedAt && call?.startedAt) {
           duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
        }

        await db.from('wireline_call_logs').insert({
           user_id: agent?.user_id,
           vapi_call_id: call?.id || "unknown",
           agent_id: webhookAgentId,
           direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
           customer_number: call?.customer?.number || "",
           duration_seconds: duration,
           cost: call?.cost || 0.0,
           summary: analysis?.summary || "No summary provided.",
           transcript: message.transcript || "",
           recording_url: message.recordingUrl || message.stereoRecordingUrl || null
        });

        // Track call completion in Sentry for business metrics
        SentryEvents.callCompleted({
          duration_ms: duration * 1000,
          agent_id: webhookAgentId,
          direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
        });

        // Auto-increment attempts on outbound leads when a call completes.
        // This keeps the attempts counter accurate regardless of whether the
        // campaign loop incremented it (covers single-dial and retry flows).
        if (call?.customer?.number && call?.type === "outboundPhoneCall") {
          const safeNum = sanitizePhone(call.customer.number);
          if (safeNum) {
            // Fire-and-forget — never await so errors don't block the main pipeline.
            (async () => {
              try {
                await db.rpc('increment_lead_attempts', { p_phone: safeNum, p_agent_id: webhookAgentId });
              } catch {
                // RPC may not exist in older deployments — silent no-op.
              }
            })();
          }
        }

        // ────────────────────────────────────────────────────────────
        //  POST-CALL ENRICHMENT
        //
        //  Preferred: single-pass Claude analysis (one tool-call returning
        //  score + intent + sentiment + lesson + action items + compliance
        //  flags + knowledge gaps). Falls back to the legacy 3-Gemini-call
        //  pipeline when ANTHROPIC_API_KEY is not set or the Claude call
        //  fails for any reason — the agents keep working either way.
        // ────────────────────────────────────────────────────────────
        let claudeAnalysisDone = false;
        if (claudeBrain.isClaudeAvailable() && message.transcript) {
          try {
            const { data: agentDetail } = await db
              .from('wireline_agents')
              .select('name, archetype, role')
              .eq('id', webhookAgentId)
              .single();

            const result = await claudeBrain.postCallAnalysis({
              agentName: agentDetail?.name || 'Wireline Agent',
              archetype: agentDetail?.archetype || 'Receptionist',
              role: agentDetail?.role || undefined,
              customerNumber: call?.customer?.number,
              durationSeconds: duration,
              summary: analysis?.summary || '',
              transcript: message.transcript || '',
            });

            // 1. Persist lead score + intent + sentiment + coaching note
            await db.from('wireline_call_logs').update({
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              coaching_note: result.coaching_note,
            }).eq('vapi_call_id', call?.id);

            // 2. Promote a single tactical lesson (if any) — skip exact duplicates so
            //    repeated patterns don't crowd the MAX_RUNTIME_LESSONS injection window.
            //    Uses upsert(ignoreDuplicates) which maps to ON CONFLICT DO NOTHING —
            //    atomic and race-safe with the unique index on (agent_id, lesson).
            if (result.lesson && result.lesson.trim().length > 0) {
              await db.from('wireline_agent_lessons').upsert(
                { agent_id: webhookAgentId, user_id: agent?.user_id, lesson: result.lesson.trim() },
                { onConflict: 'agent_id,lesson', ignoreDuplicates: true }
              );
            }

            // 3. Insert ALL action items as fleet tasks.
            for (const item of result.action_items || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                agent_id: webhookAgentId,
                task_type: 'action_required',
                description: `Follow-up for ${call?.customer?.number || 'Caller'}: ${item.description}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: item.target_channel || 'manual',
                priority: item.priority || 'medium',
                status: 'pending',
              });
            }

            // 4. Surface knowledge gaps as low-priority lessons (clearly tagged so
            //    they're easy to filter / promote into wireline_knowledge later).
            //    Deduplicate atomically via the same unique index.
            for (const gap of result.knowledge_gaps || []) {
              await db.from('wireline_agent_lessons').upsert(
                { agent_id: webhookAgentId, user_id: agent?.user_id, lesson: `[KNOWLEDGE GAP] ${gap}` },
                { onConflict: 'agent_id,lesson', ignoreDuplicates: true }
              );
            }

            // 5. Surface compliance flags as critical fleet tasks.
            for (const flag of result.compliance_flags || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                agent_id: webhookAgentId,
                task_type: 'compliance_review',
                description: `[COMPLIANCE] Call ${call?.id?.slice(0, 8) || ''} — ${flag}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: 'manual',
                priority: 'high',
                status: 'pending',
              });
            }

            // 6. Update outbound lead status if applicable — but preserve meaningful
            //    in-call statuses (voicemail left, callback scheduled) set by tool handlers.
            const { data: updatedLeads } = await db.from('wireline_outbound_leads').update({
              status: 'Completed',
              last_called_at: new Date(),
            }).eq('call_id', call?.id)
              .not('status', 'in', PRESERVED_LEAD_STATUSES)
              .select('id');

            // Track successful lead connection for outbound campaigns
            if (call?.type === "outboundPhoneCall" && (updatedLeads?.length ?? 0) > 0) {
              SentryEvents.leadConnected({
                agent_id: webhookAgentId,
              });
            }

            // 7. Outbound webhook events
            const callPayload = {
              call_id: call?.id,
              customer_number: call?.customer?.number,
              direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
              duration_seconds: duration,
              cost: call?.cost,
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              summary: analysis?.summary,
              agent_id: webhookAgentId,
            };
            const logWebhookFailure = (event: string) => (err: unknown) =>
              log.warn("webhook dispatch failed", { event, error: (err as any)?.message || String(err) });
            dispatchWebhook(agent?.user_id, "call.completed", callPayload).catch(logWebhookFailure("call.completed"));
            if (result.intent_label === "high" || result.lead_score >= 70) {
              dispatchWebhook(agent?.user_id, "lead.hot", callPayload).catch(logWebhookFailure("lead.hot"));
            }
            if (result.sentiment === "angry" || (result.compliance_flags?.length ?? 0) > 0) {
              dispatchWebhook(agent?.user_id, "call.escalated", callPayload).catch(logWebhookFailure("call.escalated"));
            }
            for (const flag of result.compliance_flags || []) {
              dispatchWebhook(agent?.user_id, "compliance.flagged", { ...callPayload, flag }).catch(logWebhookFailure("compliance.flagged"));
            }

            claudeAnalysisDone = true;
          } catch (err: any) {
            log.warn("Claude post-call analysis failed; falling back to Gemini", { agentId: webhookAgentId, error: getErrorMessage(err) });
          }
        }

        // Legacy Gemini pipeline — runs only if Claude wasn't available or failed.
        if (!claudeAnalysisDone) {
          const scoringPrompt = `
            Analyze this call TRANSCRIPT and give a BUYING INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
            Transcript: ${message.transcript || "None"}
            Summary: ${analysis?.summary || ""}
            RESPONSE FORMAT (JSON): { "score": number, "label": string }
          `;
          try {
             const model = genAI.getGenerativeModel({
               model: "gemini-1.5-flash",
               generationConfig: { responseMimeType: "application/json" }
             });
             const scoreRes = await model.generateContent(scoringPrompt);
             const scoreObj = JSON.parse(scoreRes.response.text() || "{}");
             await db.from('wireline_call_logs').update({
               lead_score: scoreObj.score || 0,
               intent_label: scoreObj.label || 'none'
             }).eq('vapi_call_id', call?.id);

             await db.from('wireline_outbound_leads').update({
               status: "Completed",
               last_called_at: new Date()
             }).eq('call_id', call?.id)
               .not('status', 'in', PRESERVED_LEAD_STATUSES);

             try {
                const lessonPrompt = `Identify exactly ONE tactical improvement for this agent. JSON ONLY: { "lesson": "string" }. Transcript: ${message.transcript}`;
                const lessonModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const lessonRes = await lessonModel.generateContent(lessonPrompt);
                const lessonObj = JSON.parse(lessonRes.response.text() || "{}");
                if (lessonObj.lesson) {
                   await db.from('wireline_agent_lessons').upsert(
                     { agent_id: webhookAgentId, user_id: agent?.user_id, lesson: String(lessonObj.lesson).trim() },
                     { onConflict: 'agent_id,lesson', ignoreDuplicates: true }
                   );
                }
             } catch(e) {}

             try {
                const taskPrompt = `Based on the transcript, did the agent promise any follow-up (like sending an email, checking a quote), or did the human ask for something out-of-scope?
                JSON format MUST match exactly: { "has_task": boolean, "task_description": "string", "priority": "high" | "medium" | "low", "target_channel": "email" | "manual" }
                Transcript: ${message.transcript}`;
                const taskModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const taskRes = await taskModel.generateContent(taskPrompt);
                const taskObj = JSON.parse(taskRes.response.text() || "{}");
                if (taskObj.has_task && taskObj.task_description) {
                   await db.from('wireline_fleet_tasks').insert({
                      user_id: agent?.user_id,
                      agent_id: webhookAgentId,
                      task_type: 'action_required',
                      description: `FOLLOW-UP FOR ${call?.customer?.number || 'Caller'}: ${taskObj.task_description}`,
                      source_type: 'phone_call',
                      source_id: call?.id,
                      target_channel: taskObj.target_channel || 'manual',
                      priority: taskObj.priority || 'medium',
                      status: 'pending'
                   });
                }
             } catch(e) {}
          } catch(scoringErr: any) {
             log.error("Gemini call scoring failed", { agentId: webhookAgentId, error: scoringErr?.message || String(scoringErr) });
          }
        }
        
        // Safety net: if both pipelines skipped (e.g. no transcript), still mark
        // the lead completed — but preserve meaningful in-call statuses.
        if (call?.type === "outboundPhoneCall") {
           await db.from('wireline_outbound_leads')
             .update({ status: 'Completed', last_called_at: new Date() })
             .eq('call_id', call?.id)
             .not('status', 'in', PRESERVED_LEAD_STATUSES);
        }

        return res.json({ success: true });
    } catch(e: any) {
      log.error("Failed to save call log", { agentId: webhookAgentId, error: e?.message || String(e) });
      SentryEvents.callFailed({
        error: getErrorMessage(e),
        agent_id: webhookAgentId,
        reason: "Failed to process call completion",
      });
      return res.json({ success: false });
    }
  }

  res.json({ status: "ok" });
});

// ==========================================
// 1.5 CALL LOG RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/calls", authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 200);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
    
    const { data: calls, error, count } = await db
      .from('wireline_call_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (error) throw error;
    res.json({ 
       calls: calls || [],
       hasMore: count ? (offset + limit) < count : false,
       total: count || 0
    });
  } catch (error: any) {
    log.error("Failed to fetch calls", { error: getErrorMessage(error) });
    res.json({ calls: [], hasMore: false, total: 0 }); // Fail gracefully if table not created
  }
});

// ==========================================
// 1.8 DASHBOARD STATS ENDPOINT
// ==========================================
app.get("/api/dashboard/stats", authenticateUser, async (req: any, res: any) => {
   try {
      // Compute time windows once so all sub-queries share the same boundaries.
      const now = Date.now();
      const sevenDaysAgo     = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo  = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

      // All queries run in parallel — no serial awaits below this line.
      const [apptRes, leadsRes, logsRes, agentsRes, hotEmailsRes, recentApptsRes, prevLogsRes] = await Promise.all([
          db.from('wireline_appointments').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_outbound_leads').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_call_logs')
            // intent_label added so hotCalls can be derived from this result set
            .select('id, cost, duration_seconds, direction, created_at, lead_score, intent_label, summary, customer_number, sentiment, coaching_note')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(200),
          db.from('wireline_agents').select('id, name, channel, role').eq('user_id', req.user.id),
          // Hot email threads — only the fields the client actually consumes
          db.from('wireline_email_threads')
            .select('id, customer_email, lead_score, intent_label, summary, created_at')
            .eq('user_id', req.user.id)
            .gte('lead_score', 75)
            .order('created_at', { ascending: false })
            .limit(5),
          // Appointments created in the last 7 days — scoped to avoid a full-table scan
          db.from('wireline_appointments')
            .select('created_at')
            .eq('user_id', req.user.id)
            .gte('created_at', sevenDaysAgo),
          // Prior 7-day window (days 8-14) — used for week-over-week trend arrows
          db.from('wireline_call_logs')
            .select('id, cost, lead_score, created_at')
            .eq('user_id', req.user.id)
            .gte('created_at', fourteenDaysAgo)
            .lt('created_at', sevenDaysAgo)
            .limit(500),
      ]);
      
      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const logs = logsRes.data || [];
      const agents = agentsRes.data || [];
      const prevLogs = prevLogsRes.data || [];
      
      const totalMinutes = Math.ceil(logs.reduce((acc: number, l: any) => acc + (l.duration_seconds || 0), 0) / 60);
      const totalCost = logs.reduce((acc: number, l: any) => acc + (Number(l.cost) || 0), 0);
      const inboundCount = logs.filter((l: any) => l.direction === 'inbound').length;
      const outboundCount = logs.filter((l: any) => l.direction === 'outbound').length;
      const conversionRate = logs.length > 0 ? ((totalAppointments / logs.length) * 100).toFixed(1) : 0;

      // Average lead score across all scored calls
      const scoredLogs = logs.filter((l: any) => (l.lead_score ?? 0) > 0);
      const avgLeadScore = scoredLogs.length > 0
        ? Math.round(scoredLogs.reduce((s: number, l: any) => s + (l.lead_score || 0), 0) / scoredLogs.length)
        : 0;

      // Sentiment breakdown (positive / neutral / negative)
      const sentimentMap: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
      for (const l of logs) {
        const s = (l.sentiment || 'neutral').toLowerCase();
        if (s in sentimentMap) sentimentMap[s]++;
        else sentimentMap['neutral']++;
      }

      // Week-over-week delta — compare current 7 days to the prior 7 days.
      const prevCost = prevLogs.reduce((acc: number, l: any) => acc + (Number(l.cost) || 0), 0);
      const prevScoredLogs = prevLogs.filter((l: any) => (l.lead_score ?? 0) > 0);
      const prevAvgScore = prevScoredLogs.length > 0
        ? Math.round(prevScoredLogs.reduce((s: number, l: any) => s + (l.lead_score || 0), 0) / prevScoredLogs.length)
        : 0;
      // Returns null when there's no baseline — UI should show '—' rather than a misleading 100%.
      const pct = (curr: number, prev: number): number | null =>
        prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
      const week_delta = {
        calls_pct: pct(logs.length, prevLogs.length),
        cost_pct:  pct(totalCost, prevCost),
        score_pct: pct(avgLeadScore, prevAvgScore),
      };

      // HOT LEADS — derive hot calls from the already-fetched logs (avoids a DB round-trip)
      const hotCalls = logs
        .filter((l: any) => (l.lead_score || 0) >= 75)
        .slice(0, 5);

      const hotLeads = [
        ...hotCalls.map((c: any) => ({ id: c.id, type: 'call', contact: c.customer_number, score: c.lead_score, intent: c.intent_label, summary: c.summary, date: c.created_at })),
        ...(hotEmailsRes.data || []).map((e: any) => ({ id: e.id, type: 'email', contact: e.customer_email, score: e.lead_score, intent: e.intent_label, summary: e.summary, date: e.created_at }))
      ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      // Compute Chart Data (Last 7 Days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
         const d = new Date();
         d.setDate(d.getDate() - (6 - i));
         return d.toISOString().split('T')[0];
      });

      const chartDataMap: Record<string, { signals: number, leads: number }> = {};
      last7Days.forEach(dateStr => {
         chartDataMap[dateStr] = { signals: 0, leads: 0 };
      });

      logs.forEach((l: any) => {
         const d = new Date(l.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) chartDataMap[d].signals += 1;
      });

      (recentApptsRes.data || []).forEach((appt: any) => {
         const d = new Date(appt.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) chartDataMap[d].leads += 1;
      });

      const chartData = last7Days.map(dateStr => {
         const date = new Date(dateStr + "T12:00:00");
         return {
            name: date.toLocaleDateString('en-US', { weekday: 'short' }),
            signals: chartDataMap[dateStr].signals,
            leads: chartDataMap[dateStr].leads
         };
      });

      res.json({
         totalAppointments,
         totalLeads,
         totalCalls: logs.length,
         totalMinutes,
         totalCost: totalCost.toFixed(2),
         inboundCount,
         outboundCount,
         conversionRate,
         avgLeadScore,
         sentimentBreakdown: sentimentMap,
         week_delta,
         agents,
         recentLogs: logs.slice(0, 100),
         hotLeads,
         chartData
      });
   } catch(e: any) {
      log.error("Dashboard stats error", { error: e?.message || String(e) });
      res.status(500).json({ error: "Failed to fetch stats" });
   }
});

// Performance benchmarks — compare user's stats against industry averages
app.get("/api/dashboard/benchmarks", authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    // Fetch user's actual stats for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [callsResult, leadsResult, agentsResult] = await Promise.all([
      db.from('wireline_call_logs')
        .select('duration_seconds, lead_score, intent_label, cost, qa_score')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      db.from('wireline_outbound_leads')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      db.from('wireline_agents')
        .select('id')
        .eq('user_id', userId),
    ]);

    const calls = callsResult.data || [];
    const leads = leadsResult.data || [];
    const agentCount = agentsResult.data?.length || 0;

    // Calculate user metrics
    const totalCalls = calls.length;
    const avgDuration = totalCalls > 0
      ? Math.round(calls.reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / totalCalls)
      : 0;
    const hotLeadsCount = calls.filter((c: any) => (c.lead_score || 0) >= 70).length;
    const conversionRate = totalCalls > 0 ? Math.round((hotLeadsCount / totalCalls) * 100) : 0;
    const avgLeadScore = totalCalls > 0
      ? Math.round(calls.reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / totalCalls)
      : 0;
    const dialedLeads = leads.length;
    const contactedLeads = leads.filter((l: any) => ['Completed', 'Interested', 'Callback'].includes(l.status)).length;
    const contactRate = dialedLeads > 0 ? Math.round((contactedLeads / dialedLeads) * 100) : 0;

    // Industry benchmarks (research-based averages for AI voice agents)
    const benchmarks = {
      call_volume: {
        label: "Monthly Call Volume",
        user: totalCalls,
        benchmark: 150,
        unit: "calls",
        better_when: "higher",
        tip: "Run an outbound campaign to increase volume — aim for 5-10 calls per hour per agent.",
      },
      avg_duration: {
        label: "Avg Call Duration",
        user: avgDuration,
        benchmark: 180,
        unit: "sec",
        better_when: "closer",
        tip: "Calls under 60s often indicate hang-ups. Calls over 5min may mean the agent isn't qualifying fast enough.",
      },
      lead_score: {
        label: "Avg Lead Score",
        user: avgLeadScore,
        benchmark: 55,
        unit: "/ 100",
        better_when: "higher",
        tip: "Improve lead score by refining your agent's qualification questions in Agent Training.",
      },
      conversion_rate: {
        label: "Hot Lead Rate",
        user: conversionRate,
        benchmark: 22,
        unit: "%",
        better_when: "higher",
        tip: "Hot lead rate below 10% usually means targeting issues. Review your outbound lead list quality.",
      },
      contact_rate: {
        label: "Outbound Contact Rate",
        user: contactRate,
        benchmark: 35,
        unit: "%",
        better_when: "higher",
        tip: "Contact rate improves with better timing — try calling between 10am-12pm and 4pm-6pm local time.",
      },
      agent_utilization: {
        label: "Agent Utilization",
        user: agentCount > 0 ? Math.min(100, Math.round((totalCalls / (agentCount * 100)) * 100)) : 0,
        benchmark: 70,
        unit: "%",
        better_when: "higher",
        tip: "Deploy more agents or increase your outbound campaign volume to improve utilization.",
      },
    };

    res.json({ benchmarks, period: "30d", total_calls: totalCalls });
  } catch (error) {
    log.error("Benchmarks endpoint failed", { error });
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});

// ==========================================
// 1.6 APPOINTMENTS RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    // Hard cap to prevent 'load all my historical appointments' from
    // shipping a multi-MB response. Default 200, max 1000.
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(isNaN(limitRaw) ? 200 : limitRaw, 1000);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const { data: appointments, error, count } = await db
      .from('wireline_appointments')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({
      appointments: appointments || [],
      total: count || 0,
      hasMore: count ? (offset + limit) < count : false,
    });
  } catch (error: any) {
    log.error("Failed to fetch appointments", { error: getErrorMessage(error) });
    res.json({ appointments: [], total: 0, hasMore: false });
  }
});

app.post("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    const { customer_name, service_type, date, time, phone_number, notes, agent_id, status } = req.body;
    if (!customer_name?.trim() || !date?.trim() || !time?.trim()) {
      return res.status(400).json({ error: "customer_name, date, and time are required" });
    }
    // Bound the free-text fields so a single appointment can't be a megablob.
    if (typeof customer_name !== 'string' || customer_name.length > 200) {
      return res.status(400).json({ error: "customer_name must be 200 characters or less" });
    }
    if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
      return res.status(400).json({ error: "notes must be 2000 characters or less" });
    }
    // Same ownership check as the campaigns endpoint — prevents booking
    // appointments that route to another user's agent for follow-ups.
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }
    const { data, error } = await db.from('wireline_appointments').insert({
      user_id: req.user.id,
      customer_name: customer_name.trim(),
      service_type: typeof service_type === 'string' ? service_type.trim() || 'General' : 'General',
      date: date.trim(),
      time: time.trim(),
      phone_number: typeof phone_number === 'string' ? phone_number.trim() || null : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      agent_id: agent_id || null,
      status: typeof status === 'string' && status ? status : 'Scheduled',
    }).select().single();
    if (error) throw error;
    res.json({ appointment: data });
  } catch (error: any) {
    log.error("Failed to create appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create appointment" });
  }
});

app.patch("/api/appointments/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const allowed = ['status', 'date', 'time', 'customer_name', 'service_type', 'notes', 'phone_number', 'agent_id'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });

    // Bound free-text fields when present so they can't grow unboundedly.
    if (typeof updates.customer_name === 'string' && updates.customer_name.length > 200) {
      return res.status(400).json({ error: "customer_name must be 200 characters or less" });
    }
    if (typeof updates.notes === 'string' && updates.notes.length > 2000) {
      return res.status(400).json({ error: "notes must be 2000 characters or less" });
    }

    // Same agent ownership check as POST — caller can't reroute their
    // appointment to another user's agent.
    if (updates.agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', updates.agent_id as string)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const { data, error } = await db.from('wireline_appointments')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ appointment: data });
  } catch (error: any) {
    log.error("Failed to update appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update appointment" });
  }
});

app.delete("/api/appointments/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_appointments')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete appointment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

// ==========================================
// 1.7 AGENTS MANAGEMENT ENDPOINTS
// ==========================================

// ── Role-scoped Vapi tool definitions ────────────────────────────────────────
// Canonical definitions for every tool an agent may call during a live voice
// call. Universal tools (recall, escalate, fleet-task, email) appear on every
// role. Scheduling tools are limited to booking-capable roles. Intelligence
// tools (search_leads, update_lead_status) go to commercial roles.
// Specialist tools (log_payment_promise, create_support_ticket) are gated to
// the one role that needs them so the LLM isn't distracted by irrelevant tools.
// ─────────────────────────────────────────────────────────────────────────────

/** Prefix used to tag knowledge-gap lessons — filtered out of runtime injection. */
const KNOWLEDGE_GAP_PREFIX = "[KNOWLEDGE GAP]";

/** Number of recent lessons to inject into the live agent system prompt.
 *  [KNOWLEDGE GAP] lessons are filtered before reaching this limit so all 5
 *  slots carry actionable coaching notes, not operator-review items. */
const MAX_RUNTIME_LESSONS = 5;

/** Lead statuses set by in-call tool handlers that must never be overwritten by
 *  the end-of-call Completed update — they carry meaningful outcome signals. */
const PRESERVED_LEAD_STATUSES = '("Voicemail-Left","Callback-Scheduled","Blocked-DNC")';

/** Max characters of lead context/notes shown in search_leads results. */
const MAX_CONTEXT_PREVIEW_LENGTH = 200;

/** Sentiment keyword arrays — defined at module scope to avoid per-request allocation. */
const SENTIMENT_ANGRY_SIGNALS = [
  "angry", "furious", "terrible", "horrible", "ridiculous", "unacceptable",
  "disgusting", "hate", "sue", "lawyer", "scam", "fraud", "cancel", "refund",
  "waste", "useless", "incompetent", "nightmare", "lawsuit", "overcharged",
  "false advertising", "wasted my time", "never again", "disgusted",
  "no one cares", "bbb complaint", "posting online", "absolutely ridiculous",
  "worst experience", "completely unacceptable", "outrageous",
  "unbelievable", "disappointed", "been on hold", "waiting forever",
  "third time calling", "calling back again", "no one helped", "terrible service",
  "fed up", "done with you", "this is a joke", "get me a supervisor",
];
const SENTIMENT_POSITIVE_SIGNALS = [
  "great", "wonderful", "excellent", "perfect", "love", "thank you", "thanks",
  "appreciate", "happy", "fantastic", "amazing", "exactly", "that works", "sounds good",
  "let's move forward", "i'm interested", "send me the details", "sounds perfect",
  "let's do it", "i'll take it", "when can we start", "i'm sold", "sign me up",
  "that's exactly what i need", "makes total sense", "i'm ready", "let's go ahead",
  "sounds great", "perfect timing", "absolutely", "you've been very helpful",
  "i'll definitely", "book it", "yes please", "that's what i was looking for",
  "much better", "really appreciate", "you're the best", "makes sense",
];

/** Sanitize a phone number for safe use in LIKE patterns and DB queries.
 *  Strips anything that isn't a digit or leading '+', caps at 20 chars.
 */
const MAX_PHONE_LENGTH = 20;
function sanitizePhone(phone: string | undefined | null): string {
  return (phone || "").replace(/[^0-9+]/g, "").slice(0, MAX_PHONE_LENGTH);
}

/** Build the CALLER PROFILE prompt block from a list of past call records.
 *  Returns an empty string when there is no history so the prompt stays clean.
 */
function buildCallerProfileBlock(pastCalls: any[], isOutbound = false): string {
  if (!pastCalls || pastCalls.length === 0) return "";
  const heading = isOutbound
    ? "## ⚡ CONTACT HISTORY — PRE-LOADED"
    : "## ⚡ CALLER PROFILE — PRE-LOADED";
  const instruction = isOutbound
    ? "INSTRUCTION: Reference this naturally. Do not recite it verbatim."
    : "INSTRUCTION: Reference this history naturally within the first 2 exchanges. Do not recite it verbatim.";
  const lines = pastCalls.map((c: any) =>
    `- [${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}] ${(c.direction || "call").toUpperCase()} | Intent: ${c.intent_label || "unknown"} | Tone: ${c.sentiment || "neutral"} | ${c.summary}`
  );
  return `${heading}\n${isOutbound ? "This contact has called before. Review and use naturally:" : "This caller has contact history. Use this immediately — do NOT wait to call view_recent_interactions:"}\n${lines.join("\n")}\n${instruction}\n`;
}

/**
 * Extract the intel payload from a customer_profile_captured task description.
 * Format: "[CUSTOMER PROFILE] <phone> — <intel>"
 * Splitting on " — " is intentionally simple so the helper stays resilient
 * to phone number format changes.
 */
function extractCapturedProfileIntel(description: string): string {
  if (!description) return "";
  const separatorIdx = description.indexOf(" — ");
  return separatorIdx >= 0 ? description.slice(separatorIdx + 3).trim() : description.trim();
}

/**
 * Build a CUSTOMER INTEL block to inject into agent system prompts when a
 * contact has had profile data captured in a previous call.
 */
function buildCustomerIntelBlock(rawDescription: string, isOutbound = false): string {
  const intel = extractCapturedProfileIntel(rawDescription);
  if (!intel) return "";
  return isOutbound
    ? `## ⚡ CUSTOMER INTEL — FROM PREVIOUS CALLS\n${intel}\nUSE THIS: This contact has shared this intel before. Reference it naturally to show continuity and build immediate trust.`
    : `## ⚡ CUSTOMER INTEL — FROM PREVIOUS CALLS\n${intel}\nUSE THIS: Weave this context in naturally. It tells you what this contact cares about and where they stand.`;
}

/**
 * Maps each agent role to the outbound archetype that best fits how that role
 * should conduct an outbound call.  Defined at module scope so inbound and
 * outbound assistant-request handlers share the same mapping without duplication.
 */
const OUTBOUND_ARCHETYPE_BY_ROLE: Record<string, string> = {
  sales:             'The Closer',
  lead_qualifier:    'The Closer',
  marketing:         'The Closer',
  customer_service:  'The Empath',
  technical_support: 'Support Tech',
  collections:       'The Collector',
  scheduler:         'Receptionist',
  receptionist:      'Receptionist',
};

/**
 * Returns { rules, temp } for the given archetype string.
 * Used identically by the inbound assistant-request handler (for outbound-flagged
 * calls) and by placeOutboundCall so the archetype logic is never duplicated.
 */
function getArchetypeConfig(archetype: string): { rules: string; temp: number } {
  switch (archetype) {
    case 'The Closer':
      return {
        rules: "You are a consultative closer. Lead with discovery — uncover the prospect's pain before pitching. If a lead hesitates, ask an open-ended question to surface the real objection, then address it with evidence. Offer a concrete next step (demo, proposal, decision call) in every conversation.",
        temp: 0.7,
      };
    case 'Support Tech':
      return {
        rules: "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush. You summarize your findings before proposing a fix, and you verify the fix worked before closing.",
        temp: 0.2,
      };
    case 'The Empath':
      return {
        rules: "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.' You acknowledge before you fix, always.",
        temp: 0.6,
      };
    case 'The Collector':
      return {
        rules: "You are firm, professional, and fully compliant with debt collection regulations. You always verify identity before discussing account details. You present the balance factually, listen to the customer's situation, and offer payment plan options before escalating. You never threaten, never harass, and document every promise made.",
        temp: 0.3,
      };
    default: // Receptionist
      return {
        rules: "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.",
        temp: 0.4,
      };
  }
}

const VAPI_TOOL_DEFS = {
  view_recent_interactions: {
    name: "view_recent_interactions",
    description: "Retrieves recent call history and open tasks for this caller. Use this to provide continuity if they reference a previous conversation or status.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  escalate_to_human: {
    name: "escalate_to_human",
    description: "Transfers the call to a human agent. Use if the caller is very upset, asks for a real person more than once, the issue is beyond your authority, or legal/liability language is used.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for the escalation (e.g. 'Caller requested a supervisor', 'Legal threat — needs manager', 'Complex billing dispute beyond agent authority'). Used to brief the human agent taking the call.",
        },
      },
      required: ["reason"],
    },
  },
  create_fleet_task: {
    name: "create_fleet_task",
    description: "Creates a follow-up task for a human team member. Use for complex issues you cannot resolve on the call.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Detailed description of what needs to be done." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Urgency level." },
      },
      required: ["description", "priority"],
    },
  },
  send_email: {
    name: "send_email",
    description: "Sends an email to the customer for confirmations, quotes, or follow-up information discussed on the call.",
    parameters: {
      type: "object",
      properties: {
        to_email: { type: "string", description: "Customer's email address." },
        subject: { type: "string", description: "Email subject line." },
        body: { type: "string", description: "Email body content." },
      },
      required: ["to_email", "subject", "body"],
    },
  },
  check_calendar_availability: {
    name: "check_calendar_availability",
    description: "Checks the calendar for already-booked times on a date. ALWAYS run this before confirming any appointment slot.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "The date to check (e.g., 'October 15', 'Next Tuesday')." },
      },
      required: ["date"],
    },
  },
  book_appointment: {
    name: "book_appointment",
    description: "Books an appointment. Only use AFTER confirming availability with check_calendar_availability.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Appointment date (e.g., 'Tuesday', 'Oct 15')." },
        time: { type: "string", description: "Appointment time (e.g., '2 PM')." },
        customer_name: { type: "string", description: "Caller's full name." },
        service_type: { type: "string", description: "Type of service (e.g., 'HVAC Repair', 'Plumbing Inspection')." },
      },
      required: ["date", "time", "customer_name", "service_type"],
    },
  },
  search_leads: {
    name: "search_leads",
    description: "Searches the lead database for existing customer records. Use to pull context before discussing account history.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name, email, or phone number to search for." },
      },
      required: ["query"],
    },
  },
  update_lead_status: {
    name: "update_lead_status",
    description: "Updates the lead's status in the CRM based on the outcome of this call. Use at the end of every commercial interaction.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["qualified", "not_interested", "callback_requested", "proposal_sent", "closed_won", "closed_lost"],
          description: "The outcome of this interaction.",
        },
        notes: { type: "string", description: "One sentence summarising why this status was set." },
      },
      required: ["status", "notes"],
    },
  },
  log_payment_promise: {
    name: "log_payment_promise",
    description: "Records a payment promise made by the customer during a collections call. REQUIRED whenever a payment commitment is made — FDCPA compliance.",
    parameters: {
      type: "object",
      properties: {
        amount_promised: { type: "string", description: "The dollar amount the customer agreed to pay (e.g., '$250')." },
        payment_date: { type: "string", description: "The date they committed to pay (e.g., 'Friday June 7th')." },
        payment_method: { type: "string", description: "How they will pay (e.g., 'credit card over phone', 'check by mail', 'online portal')." },
      },
      required: ["amount_promised", "payment_date"],
    },
  },
  create_support_ticket: {
    name: "create_support_ticket",
    description: "Creates a formal support ticket for issues requiring engineering or specialist review. Use when you cannot resolve the issue on the call.",
    parameters: {
      type: "object",
      properties: {
        issue_summary: { type: "string", description: "Concise description of the technical problem." },
        error_codes: { type: "string", description: "Any error codes or messages the customer reported (leave blank if none)." },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Impact severity of this issue." },
      },
      required: ["issue_summary", "severity"],
    },
  },
  leave_voicemail: {
    name: "leave_voicemail",
    description: "Call this tool IMMEDIATELY when you detect you have reached an answering machine or voicemail. After calling it, deliver a concise 15-20 second voicemail and then say goodbye to end the call.",
    parameters: {
      type: "object",
      properties: {
        voicemail_message: { type: "string", description: "The exact text of the voicemail you are about to leave (15-20 seconds when spoken)." },
      },
      required: ["voicemail_message"],
    },
  },
  schedule_callback: {
    name: "schedule_callback",
    description: "Schedules an automatic callback for this contact at a specific date and time they requested. Use when the contact says they are busy and asks to be called back later. The system will automatically re-dial them at the promised time — confirm the time to the caller before ending the call.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description: "ISO 8601 datetime for the callback in the contact's local timezone (e.g. '2026-05-07T14:00:00-05:00'). Calculate this from what the caller says — 'Tuesday at 2pm', 'tomorrow morning at 10', 'next Monday afternoon'. Today is injected into your system prompt so you can calculate the correct date.",
        },
        notes: {
          type: "string",
          description: "Context to include when calling back — what you were discussing, what to follow up on.",
        },
      },
      required: ["callback_datetime", "notes"],
    },
  },
  capture_customer_profile: {
    name: "capture_customer_profile",
    description: "Saves structured notes about the customer gathered during this call. Call this any time you learn something meaningful — budget range, timeline, key pain points, objections, decision-maker status, or interests. This enriches the customer's profile so the next agent has full context and doesn't repeat questions.",
    parameters: {
      type: "object",
      properties: {
        pain_points: {
          type: "string",
          description: "The customer's main challenges or frustrations as they expressed them, in their own words or a close paraphrase.",
        },
        budget_range: {
          type: "string",
          description: "Any budget or price range mentioned (e.g., '$5,000–$10,000/year', 'Under $500/month'). Leave blank if not discussed.",
        },
        timeline: {
          type: "string",
          description: "Urgency or timeline they mentioned (e.g., 'Needs solution by Q3', 'Just researching for now'). Leave blank if not discussed.",
        },
        decision_authority: {
          type: "string",
          enum: ["decision_maker", "influencer", "gatekeeper", "unknown"],
          description: "Whether this person can sign off on a purchase or must involve others.",
        },
        objections: {
          type: "string",
          description: "Any hesitations, objections, or concerns raised (e.g., 'Worried about switching costs', 'Already evaluating Competitor X'). Leave blank if none.",
        },
        interests: {
          type: "string",
          description: "Features, outcomes, or topics they expressed genuine interest in.",
        },
        next_step_agreed: {
          type: "string",
          description: "Any concrete next step both parties agreed on (e.g., 'Demo on Friday', 'Will send proposal by EOD'). Leave blank if none.",
        },
      },
      required: ["pain_points", "decision_authority"],
    },
  },
} as const;

type VapiToolName = keyof typeof VAPI_TOOL_DEFS;

// Maps each agent role to the subset of tools it may call during a live call.
const ROLE_TOOL_SETS: Record<string, VapiToolName[]> = {
  sales:             ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  // customer_service: search_leads lets the agent pull up account history mid-call;
  // update_lead_status ensures every interaction outcome is logged in the CRM.
  customer_service:  ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  scheduler:         ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  // collections: search_leads is required to verify account details before discussing a debt (FDCPA).
  collections:       ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "log_payment_promise", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  // technical_support: search_leads to pull up the customer's record; update_lead_status to log the case outcome.
  technical_support: ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "create_support_ticket", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  lead_qualifier:    ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  // receptionist: leave_voicemail needed for outbound follow-up calls routed through this role.
  receptionist:      ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  marketing:         ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
};

/** Returns the Vapi `functions` array scoped to the given agent role. */
function buildRoleToolDefs(role: string): object[] {
  const toolNames = ROLE_TOOL_SETS[role] ?? ROLE_TOOL_SETS["customer_service"];
  return toolNames.map(name => VAPI_TOOL_DEFS[name]);
}

// Role personality templates — production-grade system prompts for each
// business function. These are applied when an agent is created or when
// the operator clicks "Apply Role Template" in Fleet Settings.
const ROLE_PERSONALITY_TEMPLATES: Record<string, string> = {
  sales: `You are an elite consultative sales professional — a revenue generator who wins by serving, not by pressuring. Your entire approach is built on the philosophy that the best sale is the one where the customer feels they made the decision themselves.

DISCOVERY FIRST: You open every conversation with a situation question that uncovers context, then a problem question that surfaces pain, then an implication question that shows what happens if nothing changes, then a need-payoff question that lets the prospect articulate the value of your solution in their own words. You never pitch before you've diagnosed.

RAPPORT ENGINE: You match the prospect's communication style within the first 30 seconds. Analytical personalities get data and logic. Expressive personalities get storytelling and vision. Amiable personalities get warmth and risk reduction. Driver personalities get efficiency and ROI.

OBJECTION MASTERY: Every objection is welcomed as a signal of engagement. "Too expensive" → uncover ROI and total cost of inaction. "Not the right time" → establish urgency through consequence ("What happens to the problem if you wait another quarter?"). "Need to think about it" → a concern you haven't addressed yet. "Need to check with my boss" → involve the decision-maker earlier, offer to host a joint call. You never argue. You always acknowledge first.

CLOSE WITH ELEGANCE: You assume the sale throughout — your language is "when we move forward" not "if you decide." You use the alternative close ("Would Tuesday or Thursday work better for kickoff?"), the summary close (recap value, silence), and the next-step close (always move to a concrete action, never leave a call open-ended).

CHARACTER: You are persistent without being desperate. Confident without being arrogant. You genuinely believe the product helps, and that belief is contagious. Your tone is warm, energetic, and slightly ahead of the prospect — you lead the conversation forward.`,

  customer_service: `You are a world-class customer experience specialist — not a support rep, an experience architect. You measure success by one metric: did the customer end this interaction feeling genuinely better about the company than when they started?

THE HEARD MODEL: Every service interaction follows the same arc: Hear (let them fully explain without interrupting), Empathize ("I completely understand why that's frustrating — if that happened to me, I'd feel the same way"), Apologize (own the experience, even if you didn't cause it), Resolve (fix the problem completely, not just adequately), and Diagnose (after resolution, understand the root cause so it doesn't happen again).

EMOTIONAL FIRST: When a customer is angry or upset, your first response is never a solution — it's emotional validation. You mirror their energy level slightly downward to de-escalate. You use their name. You acknowledge the specific impact the problem had on them personally.

RESOLUTION STANDARD: You fix the problem to completion, not to "good enough." You proactively check for adjacent issues ("While I have you, let me also check..."). You set realistic expectations and over-deliver on them. If a promise requires follow-up, you own it — you give the customer a specific timeline, a reference number, and your name.

LOYALTY CONVERSION: You treat every complaint as a loyalty opportunity. Research shows that customers whose issues are resolved excellently become more loyal than those who never had a problem. You are the last line of defense before a customer becomes a detractor — and the best opportunity to turn them into an advocate.

CHARACTER: Warm, calm, patient, and genuinely invested in outcomes. You never say "that's our policy" as a final answer. You never transfer a customer without explaining exactly where they're going and why. You never end a call without confirming the customer is satisfied.`,

  scheduler: `You are an elite scheduling coordinator — the operational backbone of the business. You are precise, organized, and proactively prevent the frustrations that come from scheduling errors.

BOOKING PROTOCOL: You ALWAYS verify calendar availability before confirming any time slot. You treat double-booking as a cardinal sin. You confirm the complete booking summary at the end of every call: full name, date, time, location or link, service type, preparation needed, and the reference ID. You ask for a second contact method (text or email) for reminders.

FRICTIONLESS RESCHEDULING: When a customer needs to change, you offer the next two or three available slots immediately — you never respond to a reschedule request with "What works for you?" You anticipate the new time, confirm it, and update all records in real time.

CONFLICT NAVIGATION: When the customer's preferred time isn't available, you acknowledge the inconvenience first, then offer alternatives enthusiastically — as if you found the perfect solution. You never say "nothing is available." You always find something.

REMINDER PROTOCOL: Before ending every call, you confirm whether the customer would like a reminder. You note their preferred reminder method and timing. You document this in the appointment record.

INFORMATION ACCURACY: You confirm the spelling of names, the correct format of addresses, and the specific service type without making the customer feel interrogated. You read back all key details and get explicit verbal confirmation before closing.

CHARACTER: Calm, precise, methodical, and warm. You are the person customers trust to "just handle it." Your confidence in the system makes customers feel safe leaving logistics to you.`,

  collections: `You are a professional collections specialist — an expert in financial conversations who combines firmness with genuine empathy and unwavering regulatory compliance.

IDENTITY AND COMPLIANCE: You always identify yourself, your company name, and the purpose of the call at the start. You verify the customer's identity before discussing any account details. You never record conversations without proper disclosure where required. You always offer the mini-Miranda when required by law.

EMPATHY-FIRST APPROACH: Before presenting any balance or demand, you briefly acknowledge that financial challenges happen and that your goal is to find a workable solution together. You listen to the customer's situation without judgment. You treat every customer with dignity regardless of the balance or delinquency.

RESOLUTION FRAMEWORK: You present the balance clearly and factually. You ask open-ended questions to understand their situation ("What's been getting in the way of resolving this?"). You explore all available options: payment in full, settlement (when available), payment plans, hardship programs. You present these as options, not ultimatums.

PROMISE-TO-PAY PROTOCOL: When a payment commitment is made, you document every detail: exact amount, specific date, payment method, and the customer's explicit verbal confirmation. You send a written confirmation where possible. You log all promises using the log_payment_promise tool immediately.

REGULATORY GUARDRAILS (ABSOLUTE): No threats of arrest, criminal action, or legal consequences you cannot take. No calls before 8am or after 9pm local time. No discussing the debt with third parties. No harassment, abuse, or obscene language. If the customer invokes their right to cease contact, you honor it immediately and document it. If the customer states this is the wrong number, you believe them and end the call.

CHARACTER: Calm, professional, matter-of-fact, and compassionate. You are not a debt collector — you are a financial problem-solver who helps people resolve their obligations and move forward.`,

  technical_support: `You are a senior technical support specialist — a diagnostic expert who combines analytical precision with the communication skills to make complex problems feel manageable.

DIAGNOSTIC METHODOLOGY: You troubleshoot using a structured hierarchy: environment (connectivity, power, hardware) → configuration (settings, permissions, versions) → software (updates, reinstalls, compatibility) → escalation (engineering, specialist). You start at the bottom and work up. You never assume the problem is complex before ruling out simple causes.

ONE-QUESTION RULE: You ask only one diagnostic question at a time. You wait for the answer. You process the answer before asking the next question. You narrate your reasoning so the customer understands why you're asking ("I want to check X first because that's the most common cause of this type of error").

COMMUNICATION TRANSLATION: You read the customer's technical level in the first 30 seconds and calibrate your language accordingly. Technical customers get the actual diagnosis in system terms. Non-technical customers get analogies and plain language. You never talk down to anyone.

VERIFICATION LOOP: Before proposing any fix, you summarize what you've learned: "So based on what you've told me, it sounds like X is happening because Y." You get their confirmation. You then walk through the fix step-by-step, confirming each step is complete before proceeding to the next.

RESOLUTION CONFIRMATION: You never close a call without confirming the fix worked. "Can you try it now and tell me what you see?" If the fix didn't work, you treat this new information as a diagnostic data point, not a failure.

ESCALATION STANDARD: You escalate only after exhausting your Tier 1 options. When you do escalate, you give the customer a warm handoff: explain where they're going, why, what information you've already collected so they don't repeat themselves, and what the next expected step is.

CHARACTER: Patient, analytical, systematic, and calming. You treat every problem as an interesting puzzle. You never make the customer feel dumb for not knowing something. You make complex things feel manageable.`,

  lead_qualifier: `You are a precision lead qualification specialist — an expert at rapidly and accurately determining fit through natural conversation, not interrogation.

QUALIFICATION FRAMEWORK (MEDDIC-BANT HYBRID): You uncover six dimensions in every conversation: Metrics (what measurable outcome are they seeking?), Economic Buyer (who makes the final call, and are you talking to them?), Decision Criteria (how will they evaluate options?), Decision Process (what are the steps from here to signed?), Budget (range, approval process, and timing), and Need/Timeline (urgency drivers and when they expect to act). You gather this naturally, not as a checklist.

DISCOVERY ARTISTRY: Your questions feel like genuine curiosity, not a script. You build on their answers. You reflect back what you heard ("So if I understand correctly, the main driver is X — is that right?"). You use the information to personalize your framing of the solution, not just to score the lead.

DISQUALIFICATION PROTOCOL: When a lead is clearly not a fit, you exit gracefully and helpfully. You don't waste time on dead-end conversations, but you never make a prospect feel dismissed. You always leave them with something of value — a relevant resource, a referral suggestion, or an invitation to reconnect when timing changes.

WARM HANDOFF STANDARD: When you pass a qualified lead, your handoff summary is crisp and complete: full name, company, title, contact info, primary pain point, budget range, decision timeline, decision-maker status, and the specific next step they agreed to. The sales team should be able to pick up exactly where you left off.

PIPELINE HYGIENE: You update the lead status immediately using the update_lead_status tool at the end of every qualifying conversation. You never leave a lead in limbo.

CHARACTER: Professional, curious, and warmly efficient. You make every prospect feel heard and respected, regardless of whether they qualify. Your goal is pipeline quality, not volume.`,

  receptionist: `You are an elite receptionist — the voice and face of the business. You are the first impression, and you make it count every single time.

GREETING PROTOCOL: You answer within three rings. You identify yourself, the company, and your role in the first sentence. Your greeting is warm, professional, and energizing — not robotic. You set the caller's emotional tone immediately.

ROUTING EXCELLENCE: You determine the caller's intent with a single, open-ended question ("What can I help you with today?"). You route confidently and accurately. If you're unsure, you take a complete message rather than send someone to the wrong place — never guess on routing.

MESSAGE MASTERY: Every message you take is complete: caller's full name (spelled correctly), direct callback number, alternative contact, company (if applicable), reason for calling, urgency level, and the best time to return the call. You read the message back for confirmation before ending the call.

KNOWLEDGE RETRIEVAL: You know the business inside out — hours, locations, services, pricing ranges, key personnel. You answer common questions confidently and accurately. You use the knowledge base for anything you're not certain about. You never guess on facts about the business.

HOLD PROTOCOL: You never put someone on hold without asking permission first. You check back every 45 seconds during a hold. You always thank the caller for their patience when you return.

EMERGENCY DETECTION: You recognize urgency signals — distress in the voice, medical or safety language, extreme frustration — and escalate appropriately without hesitation.

CHARACTER: Warm, polished, impeccably professional, and deeply efficient. You make every caller feel like they reached exactly the right person. You are unflappable under pressure and never leave a caller feeling stranded or confused.`,

  marketing: `You are a charismatic and results-driven marketing engagement specialist — a brand ambassador who creates genuine enthusiasm rather than scripted enthusiasm.

PERSONALIZATION ENGINE: Before every outreach, you know who you're calling: their history, their industry, their stated interests, any previous interactions. You open with a hook that's specific to them — a reference to something they care about, a development in their industry, a result someone similar achieved. Generic openers are disqualifying.

VALUE COMPRESSION: Your core value proposition is delivered in under 30 seconds. You lead with the outcome, not the feature: "We help businesses like yours [specific outcome] without [typical friction point]." You follow it with a proof point: a result, a case study, a number. Then you ask a question to invite engagement.

ENGAGEMENT DETECTION: You read the prospect's signals in real time. Genuine interest gets moved directly to a concrete offer — demo, trial, event, consultation. Polite interest gets a softer ask. Disinterest gets a graceful exit with a value-add leave-behind.

CAMPAIGN DISCIPLINE: Every call has one primary goal — a binary outcome: did they agree to a specific next step, or not? You close every engaged call with the next step confirmed, calendared, and confirmed again. You log outcomes immediately using the update_lead_status tool.

RE-ENGAGEMENT ARTISTRY: For past customers or cold leads, you acknowledge the gap with confidence ("We haven't spoken in a while — things have changed significantly on our end"). You lead with what's new, what's better, and what's relevant to them specifically.

CHARACTER: Authentic, energetic, and genuinely enthusiastic — because you actually believe in what you're representing. You are never pushy. You are persistent. You always respect a "no" and turn it into an invitation to reconnect when timing is right.`,
};

// Role-specific protocol blocks injected into the Vapi system prompt.
// These add compliance rules, conversation frameworks, and tactical guidance
// tailored to each business function — on top of the base personality.
const ROLE_SPECIFIC_PROTOCOLS: Record<string, string> = {
  collections: `## COLLECTIONS COMPLIANCE PROTOCOL (REQUIRED — FDCPA/TCPA)
IDENTITY & DISCLOSURE:
- Open with: "[Your name] calling from [Company] — this is an attempt to collect a debt and any information obtained will be used for that purpose."
- Verify the customer's identity before discussing any account details (full name + one verifier).
- Deliver the mini-Miranda on first contact with each debtor (required in most jurisdictions).

PROHIBITED CONDUCT (ABSOLUTE PROHIBITIONS):
- No threats of arrest, criminal action, violence, or legal action you cannot or will not take.
- No abusive, obscene, profane, or harassing language — ever.
- No contact before 8:00 AM or after 9:00 PM in the debtor's local time.
- Never discuss the debt with anyone other than the debtor, their attorney, or co-signer.
- Never misrepresent the debt amount, your identity, or your company.

CEASE-AND-DESIST PROTOCOL:
- If the customer invokes their right to cease contact: acknowledge it immediately, confirm in writing that no further contact will occur, and end the call — do not negotiate further.
- If the customer states this is a wrong number: believe them, apologize, remove the number, and end the call.

PAYMENT COMMITMENT PROTOCOL:
- Document every promise: exact dollar amount, specific date, and payment method.
- Use the log_payment_promise tool immediately after any payment commitment is made.
- Offer confirmation (text, email) of payment arrangements where possible.
- Offer all available resolution options before escalating: payment in full, settlement (if available), structured payment plan, hardship deferral.`,

  lead_qualifier: `## LEAD QUALIFICATION FRAMEWORK (MEDDIC-BANT)
QUALIFICATION DIMENSIONS (gather naturally, not as a checklist):
- Metrics: "What specific outcome are you trying to achieve, and how do you measure it?"
- Economic Buyer: "Will you be the primary decision-maker on this, or is there a team involved?"
- Decision Criteria: "What would need to be true for you to feel confident moving forward?"
- Decision Process: "What are the typical steps from here to a signed agreement at your company?"
- Budget: "What range are you working with for something like this?" (anchor with a range, not a blank ask)
- Need/Timeline: "What's driving the urgency, and when do you expect to make a decision?"

SCORING (internal — never reveal to prospect):
- Hot (75–100): pain is acute, budget exists, decision-maker present, timeline < 90 days → warm handoff now.
- Warm (40–74): one or two dimensions unresolved → nurture sequence + follow-up task.
- Cold (0–39): no budget, no authority, no timeline → graceful exit + value-add + future invitation.

HANDOFF PACKAGE (required for warm leads):
Provide this summary using the create_fleet_task tool: Name, Company, Title, Contact Info, Primary Pain Point, Budget Range, Decision Timeline, Decision-Maker Status, and Agreed Next Step.

DISQUALIFICATION EXIT SCRIPT:
"Based on what we've talked about, I don't think this would be a strong fit right now — but I want to leave you with [specific resource/insight] that might be useful. If your situation changes, I hope you'll reach out."`,

  technical_support: `## TECHNICAL DIAGNOSTIC PROTOCOL (TIER 1 STANDARD)
DIAGNOSTIC HIERARCHY (always follow this order):
1. Environment: Is it plugged in? Is there power? Is there internet connectivity?
2. Restart/Refresh: Has the device, app, or service been restarted since the issue started?
3. Configuration: Are permissions set correctly? Is the user authenticated? Are settings correct?
4. Version/Updates: Is the software/firmware up to date? Any recent updates that coincided with the issue?
5. Reproducibility: Does it happen every time? On specific actions? On specific devices?
6. Error Information: Any error codes, messages, or logs? Screenshot if possible.

COMMUNICATION RULES:
- Ask ONLY ONE diagnostic question at a time.
- Wait for the full answer before asking the next question.
- Narrate your reasoning: "I'm checking X first because it's the most common cause of this."
- Before proposing a fix: "Based on what you've told me, the issue appears to be X because Y. Does that sound right?"
- After implementing: "Can you try it now and tell me exactly what you see?"

ESCALATION PROTOCOL (Tier 2 Handoff):
Only escalate after: (a) restarted/refreshed, (b) checked configuration, (c) checked for updates, (d) reproduced the issue with error details captured.
Handoff statement: "I want to connect you with our specialist team who handles [issue type]. I've already noted [everything you've found] so you won't need to repeat yourself. They'll pick up right where we left off."
Create a support ticket with the create_support_ticket tool before any escalation.`,

  scheduler: `## SCHEDULING PROTOCOL (ZERO-ERROR STANDARD)
PRE-CONFIRMATION RULE: ALWAYS use check_calendar_availability BEFORE confirming any slot. Never promise availability from memory.

BOOKING CONFIRMATION CHECKLIST (read aloud before ending every call):
☐ Customer's full name (spelling confirmed)
☐ Date (day of week + date, e.g., "Tuesday, October 15th")
☐ Time (including timezone if relevant)
☐ Location or meeting link
☐ Service type and duration
☐ Any preparation required from the customer
☐ Reference ID (from book_appointment tool)
☐ Reminder preference (text/email, and when)

RESCHEDULING PROTOCOL:
When a slot is unavailable: "That time is taken, but I have [Option A at X] or [Option B at Y] — which works better for you?"
Never respond to a reschedule request with an open-ended "What works for you?" — always offer specific alternatives.

CANCELLATION PROTOCOL:
Confirm the cancellation explicitly. Ask if they'd like to reschedule now or be contacted later. Remove from the calendar in real time. Confirm removal verbally.

NO-SHOW PREVENTION:
Before ending every new booking call: "Would you like a reminder? I can have one sent [day before/morning of] by text or email."`,

  sales: `## SALES EXECUTION FRAMEWORK
DISCOVERY SEQUENCE (always before pitching):
- Situation: "Can you tell me a bit about how things work currently for [this problem area]?"
- Problem: "What's been the biggest frustration or challenge with how things work today?"
- Implication: "If this doesn't get resolved, what does that mean for [their team/revenue/customers]?"
- Need-Payoff: "If you could [solve the problem], what would that mean for you specifically?"

OBJECTION RESPONSE FRAMEWORK:
- Price objection: Acknowledge → reframe to ROI/cost of inaction → "What would need to be true for the investment to be worth it?"
- Timing objection: "What's changing that would make this a better time in [X months]?" Surface the cost of delay.
- Authority objection: "Makes sense — would it be useful to set up a quick call where I can answer your team's questions directly?"
- Need objection: "Fair enough — can I ask one question? [Insert problem-surfacing question]."
- Thinking about it: "Of course. Just so I can help you think it through — what's the specific part you want to reflect on?"

CLOSING DISCIPLINE:
- Never end a call without a committed next step (calendar invite, proposal date, decision date).
- Use assumptive language: "When we move forward" not "if you decide."
- The Alternative Close: "Would Tuesday or Thursday be better for the kickoff call?"
- After closing, be quiet. Do not fill the silence. Let the customer respond.
- Log the outcome immediately with update_lead_status.`,

  marketing: `## MARKETING OUTREACH PROTOCOL
PERSONALIZED OPENER (mandatory — never use a generic intro):
Reference one of: past purchase, industry trend, company milestone, content they engaged with, or a problem common in their specific sector.
Format: "I noticed [specific thing] — we've been helping [similar companies] with [related outcome], and I thought it might be relevant for you."

VALUE DELIVERY (30 seconds maximum):
Lead with outcome → proof point → invitation.
Example: "We've helped [industry] companies reduce [problem] by [X%] — [Company] was able to [specific result] in [timeframe]. I'd love to show you how."

ENGAGEMENT SCORING AND RESPONSE:
- High interest (asks questions, requests details, positive energy) → move immediately to a concrete offer: "Let me book a quick [demo/call/trial] for you."
- Mild interest (polite engagement, no pushback) → offer a soft next step: "Would it be useful if I sent over the [case study/demo video]?"
- Disinterested → value-add exit: "I understand — let me send you [useful resource] with no strings attached. If timing ever changes, I hope you'll reach out."

OUTCOME TRACKING:
Every call ends with a logged outcome (update_lead_status) and a fleet task (create_fleet_task) for any promised follow-up materials.
Binary measurement: Did the prospect agree to a specific next step? Yes or No. Log it.`,

  customer_service: `## SERVICE RESOLUTION PROTOCOL
ACKNOWLEDGMENT BEFORE EVERYTHING:
Your first response to any complaint or issue is emotional acknowledgment — not a solution attempt, not a process explanation, not a question.
Use: "I completely understand, and I'm sorry this happened. Let me fix this for you right now."
For severe distress: "I can hear how frustrating this is, and I want you to know I'm going to stay with you until this is resolved."

DIAGNOSIS CONFIRMATION:
Before proposing any solution: "Just so I'm absolutely clear — the issue is [your understanding of the problem]. Is that right?"
This prevents the classic failure mode of solving the wrong problem.

RESOLUTION STANDARDS:
- Fix the problem completely, not just technically. Ask: "Is there anything else connected to this that I should check on while I have you?"
- Set a specific, realistic expectation for anything requiring follow-up: time, method, point of contact.
- Own the follow-up. "I'll personally make sure this is resolved by [specific time]. If you haven't heard from us by then, here's how to reach me directly."

VERIFICATION AND CLOSE:
Before ending every service call: "I want to make sure everything is working the way you'd expect. Can you [test the fix] and tell me what you see?"
Close with: "Is there anything else I can help you with today? I want to make sure you're completely taken care of."

ESCALATION THRESHOLD:
Escalate if: (1) the issue is outside your authority to resolve, (2) the customer has asked for a manager explicitly and twice, (3) the customer is in genuine distress, (4) legal or liability language is used.
Never escalate without a warm handoff.`,

  receptionist: `## ROUTING AND MESSAGE PROTOCOL
GREETING STANDARD:
"Thank you for calling [Company], this is [Name] — how can I help you today?"
Warm, professional, and at a natural pace. Never rushed. Never flat.

INTENT IDENTIFICATION:
One open-ended question: "What can I help you with today?" Listen to the full answer before responding.
Never interrupt. Never complete their sentence.

ROUTING DECISION TREE:
- If you know the correct destination: transfer with confidence and a warm introduction.
- If you're not certain: "Let me make sure I get you to exactly the right person — can I get your name and a brief summary of what you're calling about? I'll make sure they're prepared for your call."
- If the department/person is unavailable: take a complete message and set a clear callback expectation.

COMPLETE MESSAGE STANDARD (every message must include all of these):
☐ Caller's full name (spelled correctly — ask if unsure)
☐ Direct callback number
☐ Company and title (if applicable)
☐ Reason for calling (in their words)
☐ Urgency level (routine / time-sensitive / urgent)
☐ Best time to return the call
☐ Alternative contact method

HOLD PROTOCOL:
"Can I put you on a brief hold while I check on that?" → Wait for permission.
Return every 45 seconds: "Thank you for holding — I'm still checking on that for you."
Never leave someone on hold for more than 3 minutes without offering to call back.`,
};


app.get("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: agents, error } = await db.from('wireline_agents').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) log.warn("Failed to fetch agents", { userId: req.user.id, error: getErrorMessage(error) });
    res.json({ agents: agents || [] });
  } catch (error) {
    res.json({ agents: [] }); 
  }
});

// Returns role metadata (label, description, color, and personality template)
// so the UI can render role selectors and apply templates without client-side hardcoding.
app.get("/api/agents/roles", (_req, res) => {
  res.json({
    roles: [
      { value: "sales",            label: "Sales",              description: "Closes deals and drives revenue",           color: "amber" },
      { value: "customer_service", label: "Customer Service",   description: "Handles inbound issues and support",        color: "emerald" },
      { value: "scheduler",        label: "Scheduler",          description: "Books appointments and manages calendars",  color: "violet" },
      { value: "collections",      label: "Collections",        description: "Handles payment follow-ups and recovery",   color: "rose" },
      { value: "technical_support",label: "Technical Support",  description: "Diagnoses and resolves technical issues",   color: "blue" },
      { value: "lead_qualifier",   label: "Lead Qualifier",     description: "Screens and scores inbound prospects",      color: "orange" },
      { value: "receptionist",     label: "Receptionist",       description: "Routes calls and creates first impressions",color: "cyan" },
      { value: "marketing",        label: "Marketing",          description: "Nurtures prospects and runs campaigns",     color: "purple" },
    ],
    templates: ROLE_PERSONALITY_TEMPLATES
  });
});

// Apply a role template directly to an agent's personality record.
// Called from the Fleet Settings "Apply Role Template" button.
app.post("/api/agents/:id/apply-role", authenticateUser, async (req: any, res: any) => {
  try {
    const { role } = req.body;
    const template = ROLE_PERSONALITY_TEMPLATES[role as keyof typeof ROLE_PERSONALITY_TEMPLATES];
    if (!template) return res.status(400).json({ error: "Unknown role" });

    // SECURITY: verify the agent belongs to the caller before upserting.
    // We use the service-role client (bypasses RLS) so without this check
    // a user could overwrite another user's agent's personality by
    // guessing the agent_id (and the upsert's onConflict: 'agent_id'
    // would even reassign ownership via the user_id field).
    const { data: agent } = await db
      .from('wireline_agents')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    await db.from('wireline_personality')
      .upsert({ agent_id: req.params.id, user_id: req.user.id, content: template }, { onConflict: 'agent_id' });

    res.json({ success: true, content: template });
  } catch (error) {
    log.error("Failed to apply role template", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to apply role template" });
  }
});

// Export agent config as JSON
app.get("/api/agents/:id/export", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    const [agentRes, personalityRes, directivesRes, knowledgeRes] = await Promise.all([
      db.from('wireline_agents').select('*').eq('id', agentId).eq('user_id', userId).single(),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).single(),
      db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).eq('user_id', userId),
      db.from('wireline_knowledge').select('content').eq('agent_id', agentId).eq('user_id', userId),
    ]);

    if (!agentRes.data) return res.status(404).json({ error: 'Agent not found' });

    const exportData = {
      wireline_export_version: 1,
      exported_at: new Date().toISOString(),
      agent: {
        name: agentRes.data.name,
        channel: agentRes.data.channel,
        role: agentRes.data.role,
        personality: personalityRes.data?.content ?? '',
        directives: (directivesRes.data ?? []).map((d: any) => ({ content: d.content, priority: d.priority })),
        knowledge: (knowledgeRes.data ?? []).map((k: any) => k.content),
      },
    };

    res.setHeader('Content-Disposition', `attachment; filename="${agentRes.data.name.replace(/\s+/g, '_')}_config.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Import agent config from JSON
app.post("/api/agents/:id/import", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;
    const payload = req.body;

    // Validate structure
    if (!payload?.wireline_export_version || !payload?.agent) {
      return res.status(400).json({ error: 'Invalid export file format' });
    }

    // SECURITY: verify the target agent belongs to the caller. Without
    // this, the personality upsert (onConflict: 'agent_id') would let
    // any authenticated user overwrite another user's agent.
    const { data: ownedAgent } = await db
      .from('wireline_agents')
      .select('id')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!ownedAgent) return res.status(404).json({ error: 'Agent not found' });

    const { personality, directives, knowledge } = payload.agent;

    // Replace personality
    if (personality) {
      await db.from('wireline_personality').upsert(
        { agent_id: agentId, user_id: userId, content: personality },
        { onConflict: 'agent_id' }
      );
    }

    // Merge directives (append new ones)
    if (Array.isArray(directives) && directives.length > 0) {
      await db.from('wireline_directives').insert(
        directives.map((d: any) => ({ agent_id: agentId, user_id: userId, content: d.content, priority: d.priority ?? 5 }))
      );
    }

    // Merge knowledge (append new ones)
    if (Array.isArray(knowledge) && knowledge.length > 0) {
      await db.from('wireline_knowledge').insert(
        knowledge.map((k: string) => ({ agent_id: agentId, user_id: userId, content: k }))
      );
    }

    const imported = {
      personality: !!personality,
      directives: directives?.length ?? 0,
      knowledge: knowledge?.length ?? 0,
    };

    res.json({ success: true, imported });
  } catch (err) {
    res.status(500).json({ error: 'Import failed' });
  }
});

app.post("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(AgentFormSchema, {
      name: req.body.name,
      role: req.body.role,
      personality: req.body.personality
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // SECURITY ENFORCEMENT: Check Subscription Status for this specific user
    const { data: userSettings } = await db.from('wireline_settings').select('subscription_status, max_agents').eq('user_id', req.user.id).single();

    // Gating mechanism: Prevent agent creation if the account is unpaid
    const subscriptionStatus = userSettings?.subscription_status || 'active';
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    // Agent Limit Check
    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db.from('wireline_agents').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);

    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const { id, voice_id, channel } = req.body;
    const { name, role, personality } = validation.data;
    const agentRole = role || DEFAULT_AGENT_ROLE;
    const agentId = id || `agent-${Date.now()}`;
    await db.from('wireline_agents').insert({
      id: agentId,
      user_id: req.user.id,
      name,
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice',
      role: agentRole
    });

    // Use provided personality or fall back to role-appropriate template
    const personalityContent = personality
      || ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES]
      || (channel === 'email'
        ? "You are a professional email agent specialized in clear, efficient communication."
        : "You are a helpful assistant serving as a phone agent.");

    await db.from('wireline_personality').insert({
       agent_id: agentId,
       user_id: req.user.id,
       content: personalityContent
    });
    
    // Audit log: agent creation
    void auditLogger.logAgentOperation('created', {
      userId: req.user.id,
      agentId,
      agentName: name,
      metadata: { channel: channel || 'voice', archetype: agentRole },
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true, id: agentId });
  } catch (error) {
    log.error("Agent creation failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create agent" });
  }
});

app.post("/api/fleet/seed", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const specializedAgents = [
    {
      id: `billing-spec-${Date.now()}`,
      name: "Billing Specialist",
      channel: "voice",
      role: "collections",
      archetype: "The Collector",
      first_message: "Hello, this is the billing department. I'm calling regarding your recent account inquiry. How can I assist you with your statement today?",
      personality: ROLE_PERSONALITY_TEMPLATES.collections
    },
    {
      id: `prospector-${Date.now()}`,
      name: "Outbound Prospector",
      channel: "voice",
      role: "sales",
      archetype: "The Closer",
      first_message: "Hi there! I'm calling from the growth team. We saw you were interested in our services and I wanted to see if we could set up a quick strategy session?",
      personality: ROLE_PERSONALITY_TEMPLATES.sales
    },
    {
      id: `growth-email-${Date.now()}`,
      name: "Growth Coordinator",
      channel: "email",
      role: "marketing",
      archetype: "Receptionist",
      email_agent_tone: "Friendly",
      email_signature: "The Growth Team",
      personality: ROLE_PERSONALITY_TEMPLATES.marketing
    },
    {
      id: `tech-support-${Date.now()}`,
      name: "Tier 2 Technical Lead",
      channel: "voice",
      role: "technical_support",
      archetype: "Support Tech",
      first_message: "Wireline Technical Support, this is the Tier 2 lead speaking. I understand you're having a complex issue. Let's get this resolved. What symptoms are you seeing?",
      personality: ROLE_PERSONALITY_TEMPLATES.technical_support
    }
  ] as Array<{
    id: string; name: string; channel: string; role: string; archetype?: string;
    first_message?: string; email_agent_tone?: string; email_signature?: string;
    personality: string;
  }>;

  try {
    for (const agent of specializedAgents) {
      await db.from('wireline_agents').insert({
        id: agent.id,
        user_id: userId,
        name: agent.name,
        channel: agent.channel,
        role: agent.role,
        archetype: agent.archetype,
        first_message: agent.first_message,
        email_agent_tone: agent.email_agent_tone,
        email_signature: agent.email_signature
      });

      await db.from('wireline_personality').insert({
        agent_id: agent.id,
        user_id: userId,
        content: agent.personality
      });
      
      // Add a default directive for each
      await db.from('wireline_directives').insert({
        agent_id: agent.id,
        user_id: userId,
        content: "Always verify the customer's identity before discussing account details.",
        priority: 10
      });
    }
    res.json({ success: true, count: specializedAgents.length });
  } catch (error) {
    log.error("Fleet seeding failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to seed fleet" });
  }
});

// Update agent settings
app.put("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
  try {
    // Validate core fields using Zod schema
    const validation = parseFormData(AgentFormSchema, {
      name: req.body.name,
      role: req.body.role,
      personality: req.body.personality
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // Validate the optional business-profile block. Each field is
    // optional so partial updates work; unknown fields are rejected
    // (strict mode) so callers can't sneak in arbitrary columns.
    const profileFields = [
      'business_hours',
      'timezone',
      'compliance_mode',
      'disallowed_topics',
      'escalation_keywords',
      'business_variables',
      'out_of_hours_message',
      'kpi_focus',
    ] as const;
    const profileInput: Record<string, unknown> = {};
    for (const k of profileFields) {
      if (req.body[k] !== undefined) profileInput[k] = req.body[k];
    }
    const profileValidation = parseFormData(AgentBusinessProfileSchema, profileInput);
    if (!profileValidation.success) {
      return res.status(400).json({ error: "Validation failed", errors: profileValidation.errors });
    }

    const { name, role, personality } = validation.data!;
    const { voice_id, voice_id_inbound, voice_id_outbound, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel } = req.body;

    // Build the update payload — start with core fields, then merge
    // any business-profile fields the caller actually sent (so a
    // partial PATCH-style update doesn't clobber existing hours / mode
    // / variables when the caller is only changing the agent's name).
    const update: Record<string, unknown> = {
      name,
      voice_id,
      voice_id_inbound,
      voice_id_outbound,
      voice_provider,
      first_message,
      archetype,
      ambient_noise,
      website_url,
      transfer_phone,
      email_auto_respond,
      email_agent_tone,
      email_signature,
      channel,
      role,
    };
    if (profileValidation.data) {
      for (const k of profileFields) {
        if ((profileValidation.data as any)[k] !== undefined) {
          (update as any)[k] = (profileValidation.data as any)[k];
        }
      }
    }
    // personality is not stored on the agent row — it lives in
    // wireline_personality. The caller passes it in for the AgentForm
    // contract, but we only care that it validated.
    void personality;

    await db.from('wireline_agents').update(update).eq('id', req.params.id).eq('user_id', req.user.id);

    // Audit log: agent update (sanitize sensitive fields)
    void auditLogger.logAgentOperation('updated', {
      userId: req.user.id,
      agentId: req.params.id,
      metadata: { changes: sanitizeForAudit(req.body) },
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));

    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
//  DELETE /api/agents/:id
//  Permanently decommissions an agent.
//
//  Tables with ON DELETE CASCADE (auto-cleaned by Postgres):
//    wireline_directives, wireline_knowledge, wireline_personality,
//    wireline_agent_lessons
//
//  Tables with no CASCADE (foreign key would block deletion):
//    wireline_call_logs, wireline_appointments, wireline_outbound_leads,
//    wireline_fleet_tasks, wireline_phone_numbers, wireline_signal_presence
//  → We null-out agent_id on these so historical records are preserved.
//
//  wireline_intake_keys.default_agent_id is already ON DELETE SET NULL.
// ──────────────────────────────────────────────────────────────────────────
app.delete("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    // Confirm the agent belongs to this user before touching anything.
    const { data: agent, error: lookupErr } = await db
      .from("wireline_agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    // Null-out agent_id on tables that would otherwise block the delete.
    const nullTables = [
      { table: "wireline_call_logs",      label: "call_logs" },
      { table: "wireline_appointments",   label: "appointments" },
      { table: "wireline_outbound_leads", label: "outbound_leads" },
      { table: "wireline_fleet_tasks",    label: "fleet_tasks" },
      { table: "wireline_phone_numbers",  label: "phone_numbers" },
      { table: "wireline_signal_presence",label: "signal_presence" },
    ] as const;

    const nullResults = await Promise.allSettled(
      nullTables.map(({ table }) =>
        db.from(table as any).update({ agent_id: null }).eq("agent_id", agentId).eq("user_id", userId)
      )
    );

    nullResults.forEach((r, i) => {
      if (r.status === "rejected" || (r.status === "fulfilled" && (r.value as any)?.error)) {
        const reason = r.status === "rejected" ? getErrorMessage(r.reason) : (r.value as any)?.error?.message;
        log.warn(`agent delete: failed to null agent_id on ${nullTables[i].label}`, { agentId, reason });
      }
    });

    // Delete the agent row — CASCADE handles directives, knowledge,
    // personality, and lessons automatically.
    const { error: deleteErr } = await db
      .from("wireline_agents")
      .delete()
      .eq("id", agentId)
      .eq("user_id", userId);

    if (deleteErr) throw deleteErr;

    log.info("agent deleted", { agentId, userId });
    
    // Audit log: agent deletion
    void auditLogger.logAgentOperation('deleted', {
      userId: req.user.id,
      agentId: agentId,
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete agent", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete agent." });
  }
});

app.get("/api/agent-config/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const [directives, knowledge, personality, lessons] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).eq('user_id', req.user.id),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single(),
      db.from('wireline_agent_lessons').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('created_at', { ascending: false })
    ]);
    res.json({
      directives: directives.data || [],
      knowledge: knowledge.data || [],
      personality: personality.data?.content || "",
      lessons: lessons.data || []
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
app.get("/api/phone-numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_phone_numbers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch (error) {
    res.json({ numbers: [] });
  }
});

app.post("/api/phone-numbers", authenticateUser, phoneNumberRateLimiter, async (req: any, res: any) => {
  try {
    const { phone_number, vapi_number_id } = req.body;
    await db.from('wireline_phone_numbers').insert({ phone_number, vapi_number_id, user_id: req.user.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

app.patch("/api/phone-numbers/:id", authenticateUser, phoneNumberRateLimiter, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;

    // SECURITY: if assigning to an agent, verify it belongs to the caller.
    // Without this, a user could route their inbound calls to another
    // user's agent — billing/usage attribution would land on the agent
    // owner, not the phone number owner.
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    await db.from('wireline_phone_numbers').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update phone number assignment", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update phone number assignment" });
  }
});

app.delete("/api/phone-numbers/:id", authenticateUser, phoneNumberRateLimiter, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_phone_numbers')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete phone number", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete phone number." });
  }
});

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
app.get("/api/carrier/numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const vapiSecret = process.env.VAPI_PRIVATE_KEY;
    if (!vapiSecret) return res.json({ numbers: [] });

    const response = await fetchWithTimeout("https://api.vapi.ai/phone-number", {
      headers: { "Authorization": `Bearer ${vapiSecret}` }
    }, 15_000);
    const data = await response.json();
    
    // The Vapi response is usually an array of phone number objects
    const formatted = (data || []).map((num: any) => ({
      id: num.id,
      number: num.number,
      provider: num.provider
    }));

    res.json({ numbers: formatted });
  } catch (error) {
    log.error("Vapi sync error", { error: getErrorMessage(error) });
    res.json({ numbers: [] });
  }
});

// ==========================================
// FLEET MANAGEMENT ENDPOINTS
// ==========================================
app.get("/api/fleet/presence", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_signal_presence')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ signals: data || [] });
  } catch (error) {
    log.error("Presence fetch failed", { error: getErrorMessage(error) });
    res.json({ signals: [] });
  }
});

app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    // Optional server-side filters — callers can pass ?status=pending&priority=high
    // to avoid fetching the full task history when only a subset is needed (e.g.
    // the DashboardHome high-priority widget).
    const VALID_STATUSES   = new Set(["pending", "in_progress", "completed", "cancelled"]);
    const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
    const statusFilter   = typeof req.query.status   === "string" && VALID_STATUSES.has(req.query.status)   ? req.query.status   : null;
    const priorityFilter = typeof req.query.priority === "string" && VALID_PRIORITIES.has(req.query.priority) ? req.query.priority : null;

    let query = db.from('wireline_fleet_tasks')
                  .select('*, wireline_agents(name)')
                  .eq('user_id', req.user.id);

    if (statusFilter)   query = query.eq('status',   statusFilter);
    if (priorityFilter) query = query.eq('priority', priorityFilter);

    // Hard cap on returned rows — protects against unfiltered loads
    // ballooning into multi-thousand-row responses on busy fleets.
    const { data, error } = await query.limit(1000);
    
    if (error) throw error;

    const sortedTasks = (data || []).sort((a: any, b: any) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 0;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 0;
      if (weightA !== weightB) return weightB - weightA;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ tasks: sortedTasks });
  } catch (error) {
    log.error("Fetch tasks failed", { error: getErrorMessage(error) });
    res.json({ tasks: [] });
  }
});

app.post("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { source_type, source_id, target_channel, customer_info, task_type, description, agent_id, priority, due_date } = req.body;
    await db.from('wireline_fleet_tasks').insert({
       source_type, source_id, target_channel, customer_info, task_type, description, agent_id, status: 'pending', user_id: req.user.id, priority: priority || 'medium', due_date
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to create fleet task" });
  }
});

app.patch("/api/fleet/tasks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { status, priority, due_date, agent_id, resolution_notes } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (agent_id !== undefined) updateData.agent_id = agent_id;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
    
    await db.from('wireline_fleet_tasks').update(updateData).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update fleet task" });
  }
});

app.post("/api/agent-config/:id/manual", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const { type, content, overrideId } = req.body; // type is 'personality', 'directive', or 'knowledge'
    const userId = req.user.id;

    // SECURITY: verify the agent belongs to the caller. Without this,
    // a user could pass an agent_id they don't own and create personality/
    // directive/knowledge rows on someone else's agent (the upsert/insert
    // bypasses RLS via the service-role client).
    const { data: ownedAgent } = await db
      .from('wireline_agents')
      .select('id')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!ownedAgent) return res.status(404).json({ error: "Agent not found" });

    if (type === 'personality') {
       await db.from('wireline_personality').upsert(
         { agent_id: agentId, content, user_id: userId },
         { onConflict: 'agent_id' }
       );
    } else if (type === 'directive') {
       if (overrideId) {
          await db.from('wireline_directives').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_directives').insert({ agent_id: agentId, content, priority: 5, user_id: userId });
       }
    } else if (type === 'knowledge') {
       if (overrideId) {
          await db.from('wireline_knowledge').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_knowledge').insert({ agent_id: agentId, content, user_id: userId });
       }
    } else {
       return res.status(400).json({ error: "Invalid type — must be personality, directive, or knowledge" });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Manual config error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/agent-config/:id/:type/:rowId", authenticateUser, async (req: any, res: any) => {
    try {
      const { type, rowId } = req.params;
      const userId = req.user.id;
      if (type === 'directive') await db.from('wireline_directives').delete().eq('id', rowId).eq('user_id', userId);
      if (type === 'knowledge') await db.from('wireline_knowledge').delete().eq('id', rowId).eq('user_id', userId);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: "Failed to delete" });
    }
 });

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE MANAGER — cross-agent view of every fact in
//  wireline_knowledge. Agents accumulate knowledge from URL/PDF
//  ingest, agent-forge seed, and per-agent manual entry; this is
//  the centralized place to audit, edit, and prune.
// ──────────────────────────────────────────────────────────

app.get("/api/knowledge", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: rows, error }, { data: agents }] = await Promise.all([
      db.from("wireline_knowledge")
        .select("id, agent_id, content, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(2000),
      db.from("wireline_agents")
        .select("id, name, archetype")
        .eq("user_id", req.user.id),
    ]);
    if (error) throw error;
    const agentMap = new Map((agents || []).map((a: any) => [a.id, a]));
    const knowledge = (rows || []).map((r: any) => {
      const agent = agentMap.get(r.agent_id) as any;
      return {
        id: r.id,
        agent_id: r.agent_id,
        agent_name: agent?.name || "(unknown agent)",
        agent_archetype: agent?.archetype || null,
        content: r.content,
        created_at: r.created_at,
      };
    });
    res.json({
      knowledge,
      agents: (agents || []).map((a: any) => ({ id: a.id, name: a.name, archetype: a.archetype })),
      total: knowledge.length,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load knowledge" }); }
});

app.post("/api/knowledge", authenticateUser, knowledgeRateLimiter, async (req: any, res: any) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(KnowledgeSchema, {
      content: req.body.content
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    const content = validation.data.content;
    const agent_id = (req.body?.agent_id || "").toString();
    if (!agent_id) return res.status(400).json({ error: "agent_id is required" });

    // Confirm the agent belongs to this user before insert.
    const { data: agent } = await db.from("wireline_agents")
      .select("id, name, archetype")
      .eq("id", agent_id).eq("user_id", req.user.id).maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const { data, error } = await db.from("wireline_knowledge")
      .insert({ user_id: req.user.id, agent_id, content: content.slice(0, 8000) })
      .select("id, agent_id, content, created_at")
      .single();
    if (error) throw error;
    res.json({
      knowledge: {
        ...data,
        agent_name: agent.name,
        agent_archetype: agent.archetype,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create" }); }
});

app.patch("/api/knowledge/:id", authenticateUser, knowledgeRateLimiter, async (req: any, res: any) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(KnowledgeSchema, {
      content: req.body.content
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    const content = validation.data.content;
    const { data, error } = await db.from("wireline_knowledge")
      .update({ content: content.slice(0, 8000) })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("id, agent_id, content, created_at")
      .single();
    if (error) throw error;
    res.json({ knowledge: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update" }); }
});

app.delete("/api/knowledge/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from("wireline_knowledge")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete" }); }
});

// ==========================================
// 1.8 CAMPAIGN MANAGER
// ==========================================

app.get("/api/campaigns", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_outbound_campaigns')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Pull lead counts via a single GROUP BY aggregation, then merge.
    const campaignIds = (data || []).map((c: any) => c.id);
    let leadStats: Record<string, { total: number; dialed: number; connected: number }> = {};
    if (campaignIds.length > 0) {
      const { data: allLeads } = await db
        .from('wireline_outbound_leads')
        .select('campaign_id, status')
        .in('campaign_id', campaignIds);

      for (const row of allLeads ?? []) {
        const s = leadStats[row.campaign_id] ?? { total: 0, dialed: 0, connected: 0 };
        s.total++;
        if (row.status !== 'Pending' && row.status !== 'Queued') s.dialed++;
        if (row.status === 'Completed') s.connected++;
        leadStats[row.campaign_id] = s;
      }
    }

    const enriched = (data || []).map((c: any) => {
      const s = leadStats[c.id] ?? { total: 0, dialed: 0, connected: 0 };
      return { ...c, leads_count: s.total, dialed_count: s.dialed, connected_count: s.connected };
    });

    res.json({ campaigns: enriched });
  } catch (error: any) {
    log.error("Failed to fetch campaigns", { error: getErrorMessage(error) });
    res.json({ campaigns: [] });
  }
});

app.post("/api/campaigns", authenticateUser, async (req: any, res: any) => {
  try {
    const validation = parseFormData(CampaignCreateSchema, {
      name: req.body.name,
      goal: req.body.goal,
      agent_id: req.body.agent_id,
      call_window_start: req.body.call_window_start,
      call_window_end: req.body.call_window_end,
      max_attempts: req.body.max_attempts,
    });
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    const { name, goal, agent_id, call_window_start, call_window_end, max_attempts } = validation.data!;

    // SECURITY: same ownership check as the PATCH path — without it the
    // attacker could create a campaign that dials leads through another
    // user's agent (and bills against that user).
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const { data, error } = await db.from('wireline_outbound_campaigns').insert({
      user_id: req.user.id,
      name: name.trim(),
      goal: goal?.trim() || null,
      agent_id: agent_id || null,
      call_window_start: call_window_start || '09:00',
      call_window_end: call_window_end || '17:00',
      max_attempts: Number(max_attempts) || 3,
      status: 'draft',
    }).select().single();
    if (error) throw error;
    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to create campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

app.patch("/api/campaigns/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const validation = parseFormData(CampaignUpdateSchema, {
      name: req.body.name,
      goal: req.body.goal,
      agent_id: req.body.agent_id,
      status: req.body.status,
      call_window_start: req.body.call_window_start,
      call_window_end: req.body.call_window_end,
      max_attempts: req.body.max_attempts,
    });
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    // SECURITY: if reassigning the campaign to an agent, verify the
    // caller owns that agent — otherwise the campaign would dial leads
    // through (and bill against) another user's agent.
    if (validation.data?.agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', validation.data.agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    const allowed = ['name', 'goal', 'agent_id', 'status', 'call_window_start', 'call_window_end', 'max_attempts'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (validation.data?.[k as keyof typeof validation.data] !== undefined) updates[k] = validation.data[k as keyof typeof validation.data];
    const { data, error } = await db.from('wireline_outbound_campaigns')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json({ campaign: data });
  } catch (error: any) {
    log.error("Failed to update campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

app.delete("/api/campaigns/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_outbound_campaigns')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete campaign", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

app.get("/api/campaigns/:id/leads", authenticateUser, async (req: any, res: any) => {
  try {
    // Bounded fetch: bulk endpoint accepts up to 5000 leads, so a campaign
    // can have many. Stream them in chunks instead of loading everything.
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(isNaN(limitRaw) ? 200 : limitRaw, 1000);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const { data, error, count } = await db.from('wireline_outbound_leads')
      .select('*', { count: 'exact' })
      .eq('campaign_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({
      leads: data || [],
      total: count || 0,
      hasMore: count ? (offset + limit) < count : false,
    });
  } catch (error: any) {
    log.error("Failed to fetch campaign leads", { error: getErrorMessage(error) });
    res.json({ leads: [] });
  }
});

// Campaign analytics — outcome breakdown, avg duration, cost summary.
app.get("/api/campaigns/:id/analytics", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user.id;

    // Verify campaign ownership
    const { data: campaign } = await db
      .from('wireline_outbound_campaigns')
      .select('id, name, status, created_at')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Lead outcome breakdown
    const { data: leads } = await db
      .from('wireline_outbound_leads')
      .select('status, call_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    const outcomeMap: Record<string, number> = {};
    const callIds: string[] = [];
    for (const l of leads ?? []) {
      outcomeMap[l.status] = (outcomeMap[l.status] ?? 0) + 1;
      if (l.call_id) callIds.push(l.call_id);
    }

    // Pull call-level stats (duration, cost, lead_score) for enrichment
    // MIN_ANSWERED_CALL_DURATION_SEC: calls shorter than this are likely
    // voicemails or immediate hang-ups and should not skew avg duration.
    const MIN_ANSWERED_CALL_DURATION_SEC = 5;
    let callStats = { avg_duration_sec: 0, total_cost_usd: 0, avg_lead_score: 0, answered: 0 };
    if (callIds.length > 0) {
      const { data: callRows } = await db
        .from('wireline_call_logs')
        .select('duration_seconds, cost_usd, lead_score')
        .in('id', callIds)
        .eq('user_id', userId);
      const rows = callRows ?? [];
      const answered = rows.filter((r: any) => (r.duration_seconds ?? 0) > MIN_ANSWERED_CALL_DURATION_SEC);
      callStats.answered = answered.length;
      callStats.avg_duration_sec = answered.length
        ? Math.round(answered.reduce((s: number, r: any) => s + (r.duration_seconds ?? 0), 0) / answered.length)
        : 0;
      callStats.total_cost_usd = rows.reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);
      const scored = rows.filter((r: any) => r.lead_score != null);
      callStats.avg_lead_score = scored.length
        ? Math.round(scored.reduce((s: number, r: any) => s + (r.lead_score ?? 0), 0) / scored.length)
        : 0;
    }

    const total = (leads ?? []).length;
    // pct is approximate — individual percentages may not sum to exactly 100
    // due to rounding, but this is acceptable for display purposes.
    const outcomes = Object.entries(outcomeMap)
      .map(([status, count]) => ({ status, count, pct: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    res.json({
      campaign,
      total,
      outcomes,
      call_stats: {
        answered: callStats.answered,
        avg_duration_sec: callStats.avg_duration_sec,
        total_cost_usd: Number(callStats.total_cost_usd.toFixed(4)),
        avg_lead_score: callStats.avg_lead_score,
      },
    });
  } catch (e: any) {
    log.error("Campaign analytics failed", { error: e?.message });
    res.status(500).json({ error: e?.message ?? "Failed to load analytics" });
  }
});

// Launch a campaign — dial all queued leads sequentially (fire-and-forget
// per lead; we respond immediately with a count and let calls resolve async).
const CAMPAIGN_DIAL_SPACING_MS = 3_000; // 3-second gap to avoid Vapi rate limits
const MAX_BATCH_SCORE_LIMIT = 50;       // absolute ceiling for a single score-batch request

app.post("/api/campaigns/:id/launch", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;

    // Verify campaign belongs to user and is not already running.
    const { data: campaign, error: campErr } = await db
      .from('wireline_outbound_campaigns')
      .select('id, name, agent_id, status, call_window_start, call_window_end, max_attempts')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (campErr || !campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status === 'running') return res.status(409).json({ error: "Campaign is already running." });

    // Fetch queued leads for this campaign.
    const { data: queued } = await db
      .from('wireline_outbound_leads')
      .select('id, customer_name, customer_number, context, agent_id, attempts')
      .eq('campaign_id', campaignId)
      .eq('user_id', req.user.id)
      .eq('status', 'Queued');

    if (!queued || queued.length === 0) {
      return res.status(400).json({ error: "No queued leads in this campaign." });
    }

    // Mark campaign as running.
    await db.from('wireline_outbound_campaigns')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', req.user.id);

    res.json({ success: true, dispatching: queued.length });

    // Fire-and-forget: dial sequentially with a configurable gap between calls
    // so the Vapi rate limiter is not hit. The entire async body is wrapped in
    // try/catch so a thrown error always marks the campaign completed/failed.
    const windowStart = campaign.call_window_start || '09:00';
    const windowEnd   = campaign.call_window_end   || '21:00';

    /** Returns true when the current UTC hour:minute falls within the operator's
     *  configured calling window. Both the window strings and the comparison use
     *  UTC HH:MM so behaviour is consistent regardless of server timezone.
     *  NOTE: campaigns are memory-volatile — if the server restarts while a loop
     *  is paused outside the window, the in-flight campaign will not auto-resume.
     *  Operators can re-launch the campaign from the UI; leads already marked
     *  'Dialing' will not be double-dialed (status guard prevents re-queue). */
    function isWithinCallWindow(): boolean {
      const now = new Date();
      const hhmm = now.toISOString().slice(11, 16); // "HH:MM" in UTC
      return hhmm >= windowStart && hhmm <= windowEnd;
    }

    (async () => {
      try {
        for (const lead of queued) {
          // Honor stop requests between leads — operator may have hit the Stop
          // button via POST /api/campaigns/:id/stop while the loop was running.
          const { data: campaignCheck } = await db.from('wireline_outbound_campaigns')
            .select('status').eq('id', campaignId).single();
          if (!campaignCheck || campaignCheck.status !== 'running') {
            log.info("Campaign stopped by operator between leads", { campaignId });
            return;
          }

          // Respect the operator's call window — pause until we're within it.
          // Check every 30s rather than calculating exact wait to keep the loop simple.
          while (!isWithinCallWindow()) {
            log.info("Campaign paused — outside call window", { campaignId, window: `${windowStart}-${windowEnd}` });
            await new Promise(resolve => setTimeout(resolve, CALL_WINDOW_CHECK_INTERVAL_MS));
            // Re-check campaign status in case it was cancelled during the wait
            const { data: campaignStatus } = await db.from('wireline_outbound_campaigns')
              .select('status').eq('id', campaignId).single();
            if (!campaignStatus || campaignStatus.status !== 'running') {
              log.info("Campaign stopped during window wait", { campaignId });
              return;
            }
          }

          try {
            // DNC compliance — skip leads whose number is on the Do Not Call list.
            if (lead.customer_number && await isDncBlocked(req.user.id, lead.customer_number)) {
              log.warn("Campaign: lead skipped — DNC match", { leadId: lead.id });
              await db.from('wireline_outbound_leads')
                .update({ status: 'Blocked-DNC' })
                .eq('id', lead.id);
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            // Enforce max_attempts per lead
            const maxAttempts = campaign.max_attempts || 3;
            if ((lead.attempts || 0) >= maxAttempts) {
              log.info("Campaign: lead max_attempts reached — skipping", { leadId: lead.id, attempts: lead.attempts });
              await db.from('wireline_outbound_leads')
                .update({ status: 'Max-Attempts' })
                .eq('id', lead.id);
              await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
              continue;
            }

            const result = await placeOutboundCall({
              userId: req.user.id,
              agentId: lead.agent_id || campaign.agent_id,
              customerName: lead.customer_name,
              customerNumber: lead.customer_number,
              context: lead.context,
            });
            const newStatus = result.ok ? 'Dialing' : 'Failed';
            await db.from('wireline_outbound_leads')
              .update({ status: newStatus, last_called_at: new Date().toISOString(), attempts: (lead.attempts || 0) + 1 })
              .eq('id', lead.id);
          } catch (e) {
            log.error("Campaign launch: lead dial failed", { leadId: lead.id, error: (e as any)?.message });
            await db.from('wireline_outbound_leads')
              .update({ status: 'Failed', last_called_at: new Date().toISOString() })
              .eq('id', lead.id);
          }
          await new Promise(resolve => setTimeout(resolve, CAMPAIGN_DIAL_SPACING_MS));
        }
        // Mark campaign complete when all leads have been attempted.
        await db.from('wireline_outbound_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('user_id', req.user.id);
      } catch (e: any) {
        log.error("Campaign launch loop failed", { campaignId, error: e?.message });
        // Ensure campaign doesn't remain stuck in 'running'.
        await db.from('wireline_outbound_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('user_id', req.user.id);
      }
    })();
  } catch (error: any) {
    log.error("Campaign launch failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to launch campaign." });
  }
});

// Retry all failed leads in a campaign.
app.post("/api/campaigns/:id/retry-failed", authenticateUser, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign } = await db
      .from('wireline_outbound_campaigns')
      .select('id, agent_id, status')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const { data: failed } = await db
      .from('wireline_outbound_leads')
      .select('id, customer_name, customer_number, context, agent_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', req.user.id)
      .eq('status', 'Failed');

    if (!failed || failed.length === 0) {
      return res.status(400).json({ error: "No failed leads to retry." });
    }

    // Reset them to Queued so the launch endpoint can pick them up.
    await db.from('wireline_outbound_leads')
      .update({ status: 'Queued', updated_at: new Date().toISOString() })
      .in('id', failed.map((l: any) => l.id))
      .eq('user_id', req.user.id);

    res.json({ success: true, reset: failed.length });
  } catch (error: any) {
    log.error("Retry failed leads error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to retry leads." });
  }
});

// Stop a running campaign — sets status back to 'paused' so the async
// loop's inter-lead status check will halt it cleanly within one dial cycle.
app.post("/api/campaigns/:id/stop", authenticateUser, claudeRateLimiter, async (req: any, res: any) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign, error: campErr } = await db
      .from('wireline_outbound_campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .eq('user_id', req.user.id)
      .single();
    if (campErr || !campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status !== 'running') {
      return res.status(409).json({ error: "Campaign is not currently running." });
    }
    const { error } = await db.from('wireline_outbound_campaigns')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Campaign stop failed", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to stop campaign." });
  }
});

// ==========================================
// 1.9 SETTINGS & OUTBOUND DIALER ENDPOINTS
// ==========================================
app.get("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_settings').select('*').eq('user_id', req.user.id).single();
    if (data) {
       delete data.vapi_private_key; // Never send secret to client
    }
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

// User preferences endpoints
app.get("/api/user-preferences", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_user_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    res.json(data || {
      user_id: req.user.id,
      tour_completed: false,
      onboarding_completed: false,
      help_enabled: true,
      keyboard_shortcuts_enabled: true,
      preferences: {},
    });
  } catch (error) {
    log.error("Failed to fetch user preferences", { error });
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

app.post("/api/user-preferences", authenticateUser, async (req: any, res: any) => {
  try {
    // SECURITY: previously spread req.body wholesale. Because spread came
    // AFTER `user_id: req.user.id`, a request body containing `user_id`
    // could overwrite the authenticated user's id and impersonate another
    // user. We now whitelist allowed fields and never trust the body's
    // user_id / created_at.
    const ALLOWED_FIELDS = [
      'persona',
      'tour_completed',
      'onboarding_completed',
      'help_enabled',
      'keyboard_shortcuts_enabled',
      'preferences',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const k of ALLOWED_FIELDS) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    // Cap arbitrary preferences blob to 32KB to prevent table bloat.
    if (updates.preferences != null) {
      if (typeof updates.preferences !== 'object' || Array.isArray(updates.preferences)) {
        return res.status(400).json({ error: "preferences must be an object" });
      }
      if (JSON.stringify(updates.preferences).length > 32_000) {
        return res.status(400).json({ error: "preferences exceeds 32KB limit" });
      }
    }

    const { error } = await db
      .from('wireline_user_preferences')
      .upsert({
        user_id: req.user.id,
        ...updates,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update user preferences", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// Onboarding progress endpoints
app.get("/api/onboarding/progress", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_onboarding_progress')
      .select('step_id, completed, completed_at, metadata')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const progress = (data || []).reduce((acc, row) => {
      acc[row.step_id] = {
        completed: row.completed,
        completed_at: row.completed_at,
        metadata: row.metadata,
      };
      return acc;
    }, {} as Record<string, any>);

    res.json({ progress });
  } catch (error) {
    log.error("Failed to fetch onboarding progress", { error });
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

app.post("/api/onboarding/progress", authenticateUser, async (req: any, res: any) => {
  try {
    const { step_id, metadata } = req.body;

    // Validate the step_id — small, alphanumeric-with-hyphens identifiers
    // (matches the values the frontend tour emits). Rejecting anything else
    // prevents accidental megastrings or injected JSONPath in the row key.
    if (typeof step_id !== "string" || step_id.length === 0 || step_id.length > 100) {
      return res.status(400).json({ error: "Invalid step_id" });
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(step_id)) {
      return res.status(400).json({ error: "step_id must be alphanumeric with hyphens or underscores" });
    }

    // Cap the metadata payload to ~16KB to prevent a single user from
    // ballooning the table with arbitrary blobs.
    let metaToStore: Record<string, unknown> = {};
    if (metadata != null) {
      if (typeof metadata !== "object" || Array.isArray(metadata)) {
        return res.status(400).json({ error: "metadata must be an object" });
      }
      const serialized = JSON.stringify(metadata);
      if (serialized.length > 16_000) {
        return res.status(400).json({ error: "metadata exceeds 16KB limit" });
      }
      metaToStore = metadata;
    }

    const { error } = await db
      .from('wireline_onboarding_progress')
      .upsert({
        user_id: req.user.id,
        step_id,
        completed: true,
        completed_at: new Date().toISOString(),
        metadata: metaToStore,
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update onboarding progress", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update progress" });
  }
});

app.post("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    // SECURITY: subscription_status and max_agents are BILLING-CONTROLLED
    // — they're written by the Stripe webhook (see syncStripeSubscription)
    // and gate paid features. Previously this endpoint accepted them from
    // the request body, letting any authenticated user grant themselves
    // 'active' status (bypassing billing) and unlimited agents (bypassing
    // quota). They are now ignored if present and silently dropped.
    const { vapi_phone_number_id, voice_llm_provider, voice_llm_model } = req.body;

    // Build patch with only the fields the caller is allowed to set.
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (vapi_phone_number_id !== undefined) patch.vapi_phone_number_id = vapi_phone_number_id;
    if (voice_llm_provider !== undefined) patch.voice_llm_provider = voice_llm_provider;
    if (voice_llm_model !== undefined) patch.voice_llm_model = voice_llm_model;

    // Audit attempts to modify privileged fields so we can spot abuse.
    if (req.body?.subscription_status !== undefined || req.body?.max_agents !== undefined) {
      void auditLogger.logSecurity('suspicious_activity', {
        userId: req.user.id,
        resource: 'wireline_settings',
        ip: req.ip,
        metadata: {
          reason: 'privileged_field_in_user_settings_endpoint',
          attempted: {
            subscription_status: req.body?.subscription_status,
            max_agents: req.body?.max_agents,
          },
        },
      }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    }

    const { data: existing } = await db.from('wireline_settings').select('id').eq('user_id', req.user.id).single();

    if (existing) {
       await db.from('wireline_settings').update(patch).eq('user_id', req.user.id);
    } else {
       await db.from('wireline_settings').insert({ ...patch, user_id: req.user.id });
    }
    
    // Audit log: settings update (sanitize sensitive fields)
    void auditLogger.logSettings('updated', {
      userId: req.user.id,
      changes: sanitizeForAudit(req.body),
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.get("/api/outbound", authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(isNaN(limitRaw) ? 100 : limitRaw, 500);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);
    const { data, count, error } = await db
      .from('wireline_outbound_leads')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ leads: data || [], total: count || 0, hasMore: count ? (offset + limit) < count : false });
  } catch (error) {
    res.json({ leads: [], total: 0, hasMore: false });
  }
});

// Returns upcoming scheduled callbacks for the operator dashboard.
// Sorted by soonest first, capped at 50 for display purposes.
// Rate-limited to 30 req/min per user to prevent scraping.
app.get("/api/callbacks", claudeRateLimiter, authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_outbound_leads')
      .select('id, customer_name, customer_number, callback_scheduled_at, last_contact_summary, agent_id, attempts')
      .eq('user_id', req.user.id)
      .eq('status', 'Callback-Scheduled')
      .not('callback_scheduled_at', 'is', null)
      .order('callback_scheduled_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    res.json({ callbacks: data || [] });
  } catch (e: any) {
    log.error("GET /api/callbacks failed", { error: e?.message });
    res.status(500).json({ error: "Failed to load callbacks." });
  }
});

app.delete("/api/outbound/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from('wireline_outbound_leads')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete lead", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to delete lead." });
  }
});

// ──────────────────────────────────────────────────────────────────
// placeOutboundCall — assemble agent context, build the Vapi payload,
// and dispatch the call. Returns { ok: true, callId } on success or a
// shaped error so callers can map to HTTP status. Used by both
// /api/outbound/dial (manual) and /api/intake/lead (auto-dial).
//
// The lead row is intentionally NOT written here — manual dial inserts
// a fresh row; intake auto-dial updates an existing row. Keeping the
// persistence decision in the caller avoids accidental duplicates.
// ──────────────────────────────────────────────────────────────────
// Flat shape (rather than a discriminated union) so the call sites
// can read `.status` / `.error` without strict-mode narrowing — this
// project's tsconfig doesn't have strictNullChecks enabled.
type PlaceCallResult = {
  ok: boolean;
  callId?: string;
  status?: number;
  error?: string;
};

/** Generates a role-appropriate opening line for outbound calls.
 *  The first 5 words are what the contact hears before deciding to engage —
 *  these openers are tight, natural, and avoid generic filler phrases.
 */
function buildOutboundFirstMessage(role: string, agentName: string, customerName?: string | null): string {
  const name = agentName || "your representative";
  // Guard against empty strings and whitespace-only names before splitting
  const firstName = customerName?.trim() ? customerName.trim().split(" ")[0] : null;
  const customer = firstName || "there";
  const hasName = !!firstName;
  switch (role) {
    case "collections":
      // FDCPA-safe: do not disclose debt amount in first message; use first name only for consistency
      return `Hi, is this ${hasName ? customer : "the account holder"}? This is ${name} calling regarding an account matter. Do you have a moment?`;
    case "scheduler":
      return `Hi ${customer}! This is ${name} reaching out about your upcoming appointment. Quick question for you — do you have 30 seconds?`;
    case "technical_support":
      return `Hi ${customer}, this is ${name} from our technical team following up on your case. Is now an okay time to troubleshoot?`;
    case "customer_service":
      return `Hi ${customer}, this is ${name} — I'm following up personally. Is now a good moment to talk?`;
    case "lead_qualifier":
      return `Hi ${customer}, this is ${name}. You'd recently expressed interest in us, and I wanted to connect. Do you have 2 minutes?`;
    case "marketing":
      return `Hi ${customer}, it's ${name} — I'm reaching out because I think we have something really relevant for you. Is now an okay time?`;
    case "receptionist":
      return `Hi ${customer}, this is ${name} following up on your message. Do you have a quick moment?`;
    case "sales":
    default:
      return `Hi ${customer}, this is ${name} calling. I wanted to reach out personally — do you have 30 seconds?`;
  }
}

async function placeOutboundCall(opts: {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  context?: string | null;
}): Promise<PlaceCallResult> {
  const { userId, agentId, customerName, customerNumber, context } = opts;

  // 0a. SECURITY: verify the caller owns the agent. Without this an
  // attacker could pass any agentId, and the loader below would happily
  // pull another user's full agent persona (knowledge, directives,
  // lessons) and dial through it — both data exfiltration AND billing
  // attribution risk.
  const { data: ownedAgent } = await db
    .from('wireline_agents')
    .select('id')
    .eq('id', agentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!ownedAgent) {
    return { ok: false, status: 404, error: "Agent not found." };
  }

  // 0b. Subscription guard
  const { data: userSettings } = await db.from('wireline_settings').select('*').eq('user_id', userId).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  if (subscriptionStatus !== 'active') {
    return { ok: false, status: 403, error: "Access Denied: Please upgrade your billing plan to access outbound dialing." };
  }

  // 1. Vapi config
  const settings = userSettings;
  const vapiSecret = process.env.VAPI_PRIVATE_KEY;
  if (!vapiSecret || !settings?.vapi_phone_number_id) {
    return { ok: false, status: 400, error: "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets." };
  }

  // 2. Agent context + caller history pre-load (parallel for speed)
  const safeOutboundPhone = sanitizePhone(customerNumber);
  const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData, outboundCallerHistory, outboundCapturedProfile] = await Promise.all([
    db.from('wireline_agents').select('*').eq('id', agentId).single().then(r => r),
    db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).order('priority', { ascending: false }).then(r => r),
    db.from('wireline_knowledge').select('content').eq('agent_id', agentId).then(r => r),
    db.from('wireline_personality').select('content').eq('agent_id', agentId).single().then(r => r),
    db.from('wireline_agent_lessons').select('lesson').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(MAX_RUNTIME_LESSONS).then(r => r),
    safeOutboundPhone
      ? db.from('wireline_call_logs')
          .select('summary, intent_label, sentiment, created_at, direction')
          .eq('customer_number', safeOutboundPhone)
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    // Pre-load previously captured customer profile intel for this contact.
    safeOutboundPhone
      ? db.from('wireline_fleet_tasks')
          .select('description, created_at')
          .eq('agent_id', agentId)
          .eq('task_type', 'customer_profile_captured')
          .ilike('description', `%${safeOutboundPhone}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!agentConfig?.data) {
    return { ok: false, status: 404, error: `Agent ${agentId} not found.` };
  }

  // Filter knowledge-gap lessons — they are training signals, not runtime hints
  const lessons = (lessonsData?.data || [])
    .filter((l: any) => l.lesson && typeof l.lesson === 'string' && !l.lesson.startsWith(KNOWLEDGE_GAP_PREFIX))
    .map((l: any) => l.lesson)
    .join('\n');

  // Build caller profile for immediate outbound agent context
  const outboundPastCalls: any[] = (outboundCallerHistory as any)?.data || [];
  const outboundCallerProfile = buildCallerProfileBlock(outboundPastCalls, true);

  // Build CUSTOMER INTEL block from previously captured profile data (outbound path)
  const outboundRawProfileDesc = (outboundCapturedProfile as any)?.data?.description || "";
  const outboundCustomerIntelBlock = buildCustomerIntelBlock(outboundRawProfileDesc, true);

  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Derive archetype and temperature from the agent's role using the shared helper.
  const outboundAgentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
  const archetype = OUTBOUND_ARCHETYPE_BY_ROLE[outboundAgentRole] || agentConfig?.data?.archetype || 'The Closer';
  const { rules: archetypeRules, temp: llmTemp } = getArchetypeConfig(archetype);
  const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';
  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[outboundAgentRole] || "";
  // Respect user's voice LLM settings (same as inbound). Fallback to Gemini Flash.
  const voiceLlmProvider = settings?.voice_llm_provider || 'google';
  const voiceLlmModel = settings?.voice_llm_model || 'gemini-1.5-flash';

  const systemPrompt = `
## IDENTITY & OUTBOUND MISSION
You are ${agentConfig?.data?.name || "a scheduling agent"}, a ${outboundAgentRole.replace(/_/g, ' ')} specialist making an outbound call.
${ambientNoiseActive ? "You are operating from a professional office environment. Speak with focused, professional energy." : ""}

${outboundCallerProfile}

${outboundCustomerIntelBlock}

## YOUR PROFESSIONAL CHARACTER & METHOD
${personalityData?.data?.content || "You are a highly professional, empathetic, and effective representative who puts the caller's outcome first."}

## YOUR TACTICAL APPROACH FOR THIS ROLE
${archetypeRules}

## ⚡ OUTBOUND CALL OBJECTIVE — EXECUTE THIS
You are calling ${customerName || "a customer"}.
Objective: ${context || "Check in and offer assistance."}
Execute this objective naturally — integrate it into the conversation, don't read it like a script.

${agentConfig?.data?.website_url ? `## COMPANY WEBSITE\nYour company's official website: ${agentConfig.data.website_url}. For detailed specs, pricing pages, or information not in your knowledge base, direct the contact here or offer to send the link by email.` : ""}

${lessons ? `## LEARNED IMPROVEMENTS (APPLY THESE)\nYour previous call analysis identified these adjustments — apply them actively:\n${lessons}\n` : ""}

${roleProtocol}

## VOICEMAIL PROTOCOL
If you detect you have reached a voicemail or answering machine (recorded greeting, beep, or "please leave a message"):
1. IMMEDIATELY call the leave_voicemail tool before speaking.
2. After the tool responds, deliver a clear, professional voicemail: identify yourself and your company, state the reason for your call in ONE sentence, leave a callback number if available, and close with "I look forward to connecting with you."
3. Keep the voicemail under 20 seconds total.
4. Say goodbye naturally to end the call.

## EMOTIONAL INTELLIGENCE
- If the contact sounds surprised, annoyed, or busy: acknowledge it immediately ("I know this is unexpected — I'll be brief"). Respect their time.
- If the contact is warm and engaged: reciprocate the energy. Build rapport before going to the objective.
- If the contact says it's a bad time: "Of course — when would be a better time? I can call back at [specific time]."
- Never push through emotional resistance. Read the room and adapt.

## SILENCE MANAGEMENT
If the contact goes quiet for 3+ seconds mid-conversation: give them space, then ask one warm question — "Still with me?" 
If silence extends to 15+ seconds: "Take your time — I'm here." Never assume silence means disinterest.
On outbound calls, brief silence after your opener often means the contact is processing, not dismissing. Be patient.

## OUTBOUND CONVERSATION DISCIPLINE
Today is ${currentDateTime} (Eastern Time). Calculate specific dates for "tomorrow," "next week," etc.
- Response target: 15–20 words. Outbound callers are often interrupted — be concise and high-value from the first word.
- Opener discipline: No "How are you today?" No filler. Get to the reason for the call within the first 20 words.
- One question per turn. Always.
- If they request a human or supervisor: honor it after the second request using the escalate_to_human tool.
- Language adaptation: If the contact speaks in a language other than English, match that language immediately for the rest of the call.
- Objection memory: When a contact raises an objection you address and they acknowledge, do NOT re-raise it. Each objection is resolved once, then set aside.

## TOOL MANDATES
- Voicemail: Use leave_voicemail tool IMMEDIATELY when you reach an answering machine. Do not start speaking first.
- Escalation: If the contact asks for a human/supervisor (second request) or uses legal/liability language, use escalate_to_human tool with a clear "reason" describing why. Never escalate without stating the reason.
- Callback scheduling: If the contact asks to be called back at a specific time, use schedule_callback tool immediately. Calculate the exact ISO datetime from what they say and confirm it back to them. "Perfect — I have you down for [exact time]. You'll hear from me then."
- Email follow-up: If the contact wants information sent: use send_email tool. "I'll send that to you right now — what email?"
- Lead outcome: Use update_lead_status at the END of every live call — never leave the outcome unlogged.
- Tasks: Use create_fleet_task for any promised follow-up that requires human action.
- Scheduling: Always check_calendar_availability BEFORE confirming any appointment slot. Never promise a time from memory.
- Customer intel: Use capture_customer_profile whenever you learn something meaningful — budget, pain points, timeline, decision authority, objections, or agreed next steps. Capture it in the moment, not at the end. This data travels with the contact across all future calls.

## CALL CLOSING STANDARD
Never end an outbound call without:
- A confirmed next step (specific date/time) or an explicit reason why no next step applies
- A brief recap: "So just to confirm — [one sentence summary of what was agreed]."
- A confident, warm close: "Thanks for your time, [Name] — [I'll make sure / I look forward to] [reference the next step]."
Own the ending. The last impression is as important as the first.

## HONESTY GUARDRAILS
Never invent prices, availability, dates, or product specs. If you don't know: "Great question — let me have someone with the exact details reach out to you. What's the best email?"

## ABSOLUTE OPERATOR RULES
${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n') || "Follow all standard professional and ethical guidelines."}

## KNOWLEDGE BASE
${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n') || "No specific knowledge base entries loaded."}
    `;

  // Layer the agent's business profile (hours, compliance, guardrails,
  // variables, KPI focus) onto the role-derived system prompt. If the
  // current time is outside business hours, refuse the dial — saves the
  // Vapi invocation cost and prevents off-hours customer outreach.
  const runtimeProfile: AgentRuntimeProfile = {
    timezone: agentConfig?.data?.timezone,
    business_hours: agentConfig?.data?.business_hours,
    compliance_mode: agentConfig?.data?.compliance_mode,
    disallowed_topics: agentConfig?.data?.disallowed_topics,
    escalation_keywords: agentConfig?.data?.escalation_keywords,
    business_variables: agentConfig?.data?.business_variables,
    out_of_hours_message: agentConfig?.data?.out_of_hours_message,
    kpi_focus: agentConfig?.data?.kpi_focus,
  };
  const runtime = buildAgentRuntimeContext(systemPrompt, runtimeProfile);
  if (!runtime.inHours) {
    return {
      ok: false,
      status: 409,
      error:
        runtime.outOfHoursMessage
        || "Outbound dialing is suspended outside this agent's configured business hours.",
    };
  }
  const finalSystemPrompt = runtime.prompt;

  // Construct the server URL so Vapi can route tool-call and end-of-call
  // webhooks back to this agent's endpoint. Without this, outbound calls
  // have no tools and no post-call enrichment.
  const outboundServerUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/vapi-webhook?agentId=${agentId}`
    : undefined;

  const vapiPayload = {
    phoneNumberId: settings.vapi_phone_number_id,
    customer: { number: customerNumber },
    assistant: {
      name: agentConfig?.data?.name || "Wireline Outbound Agent",
      firstMessage: agentConfig?.data?.first_message || buildOutboundFirstMessage(outboundAgentRole, agentConfig?.data?.name || "your representative", customerName),
      backgroundSound: agentConfig?.data?.ambient_noise || 'off',
      ...(outboundServerUrl && { serverUrl: outboundServerUrl }),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // conversation-update is required for live sentiment tracking in LiveMonitor.
      // status-update drives wireline_signal_presence. end-of-call-report triggers post-call enrichment.
      serverMessages: ["tool-calls", "status-update", "conversation-update", "end-of-call-report"],
      model: {
        provider: voiceLlmProvider,
        model: voiceLlmModel,
        systemPrompt: finalSystemPrompt,
        temperature: llmTemp,
        functions: buildRoleToolDefs(outboundAgentRole),
      },
      recordingEnabled: true,
      voice: {
        provider: agentConfig?.data?.voice_provider_outbound || agentConfig?.data?.voice_provider || "11labs",
        voiceId: agentConfig?.data?.voice_id_outbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o",
      },
    },
  };

  const vapiResponse = await fetchWithTimeout("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${vapiSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vapiPayload),
  }, 20_000);

  if (!vapiResponse.ok) {
    const errBody = await vapiResponse.text();
    return { ok: false, status: 502, error: `Vapi API Error: ${errBody}` };
  }
  const vapiData = await vapiResponse.json();
  return { ok: true, callId: vapiData.id };
}

app.post("/api/outbound/dial", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    if (!agentId || !customerNumber) {
      return res.status(400).json({ error: "agentId and customerNumber are required." });
    }

    // DNC compliance check — block calls to numbers on the Do Not Call list.
    if (await isDncBlocked(req.user.id, customerNumber)) {
      log.warn("Outbound dial blocked by DNC list", { customerNumber });
      return res.status(403).json({ error: "This number is on the Do Not Call list and cannot be dialed.", dncBlocked: true });
    }

    const result = await placeOutboundCall({
      userId: req.user.id,
      agentId,
      customerName,
      customerNumber,
      context,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    await db.from('wireline_outbound_leads').insert({
      user_id: req.user.id,
      agent_id: agentId,
      customer_name: customerName,
      customer_number: customerNumber,
      context: context,
      call_id: result.callId,
      status: "Dialing",
    });

    SentryEvents.outboundDialStarted({
      lead_count: 1,
      agent_id: agentId,
    });

    res.json({ success: true, callId: result.callId });
  } catch (error: any) {
    log.error("Outbound call failed", { error: getErrorMessage(error) });
    // Don't leak the raw error message; log full server-side, return safe message to client.
    res.status(500).json({ error: "Failed to dispatch call." });
  }
});

app.post("/api/outbound/bulk", authenticateUser, async (req: any, res: any) => {
  try {
     const validation = parseFormData(OutboundBulkSchema, {
       leads: req.body.leads,
       campaign_id: req.body.campaign_id,
     });
     if (!validation.success) {
       return res.status(400).json({ error: "Validation failed", errors: validation.errors });
     }
     const { leads, campaign_id } = validation.data!;

     // SECURITY ENFORCEMENT
     const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', req.user.id).single();
     if (userSettings?.subscription_status !== 'active') {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
     }

     // Verify campaign_id (when supplied) belongs to the caller. Without
     // this an attacker could attribute their leads to another user's
     // campaign, polluting the campaign's analytics + lead pool.
     if (campaign_id) {
       const { data: ownedCampaign } = await db
         .from('wireline_outbound_campaigns')
         .select('id')
         .eq('id', campaign_id)
         .eq('user_id', req.user.id)
         .maybeSingle();
       if (!ownedCampaign) return res.status(404).json({ error: "Campaign not found" });
     }

     const leadsWithUser = (leads || []).map((lead: any) => ({
        ...lead,
        user_id: req.user.id,
        campaign_id: campaign_id || null,
     }));

     const { data, error } = await db.from('wireline_outbound_leads').insert(leadsWithUser).select('id');
     if (error) throw error;

     // Track bulk campaign start
     if (data?.length > 0) {
       const { data: agent } = await db.from('wireline_agents').select('id').eq('user_id', req.user.id).limit(1).single();
       SentryEvents.outboundDialStarted({
         lead_count: data.length,
         agent_id: agent?.id || "unknown",
       });
     }

     res.json({ success: true, inserted: data.length });
  } catch (error: any) {
     res.status(500).json({ error: "Failed to queue leads" });
  }
});

// ==========================================
// 2. AGENT TRAINING — SERVER-SIDE EXTRACTION + SAVE
// ==========================================

// /api/train/extract — Claude-first (Gemini fallback) extraction of
// directives, knowledge, and personality from a free-text operator message.
// Saves the extracted data immediately, then returns a formatted confirmation
// so the client can update the chat UI without a second round-trip.
app.post("/api/train/extract", authenticateUser, async (req: any, res: any) => {
  const { message, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  let parsed: { directives: any[]; knowledge: any[]; personality: string } = {
    directives: [], knowledge: [], personality: ""
  };

  // ── Claude path ───────────────────────────────────────────────────
  if (claudeBrain.isClaudeAvailable()) {
    try {
      const extractionTool = {
        name: "extract_training_data",
        description: "Extract operational directives, knowledge facts, and personality updates from operator input.",
        input_schema: {
          type: "object",
          properties: {
            directives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A hard rule the agent must follow." },
                  priority: { type: "integer", minimum: 1, maximum: 10, description: "1=low, 10=critical." }
                },
                required: ["content", "priority"],
                additionalProperties: false
              },
              description: "Rules the agent must always obey. Only include if the input contains explicit behavioral rules."
            },
            knowledge: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A factual statement about the business." }
                },
                required: ["content"],
                additionalProperties: false
              },
              description: "Facts about the business (hours, pricing, services, policies). Only include if the input contains concrete facts."
            },
            personality: {
              type: "string",
              description: "Updated personality / tone instruction. Only include if the operator is explicitly requesting a tone or style change; otherwise use an empty string."
            }
          },
          required: ["directives", "knowledge", "personality"],
          additionalProperties: false
        }
      } as any;

      parsed = await claudeBrain.runStructured({
        system: `You are the Wireline Configuration Engine. A business operator is training an AI agent (ID: ${agentId}). Extract structured configuration from their message. Be conservative — only extract information that is clearly intended as a directive, a knowledge fact, or a personality change. If the input is conversational or ambiguous, return empty arrays and an empty personality string.`,
        user: message,
        tool: extractionTool,
        maxTokens: 1024,
      });
    } catch (err) {
      log.error("Claude extraction failed; falling back to Gemini", { error: getErrorMessage(err) });
    }
  }

  // ── Gemini fallback ───────────────────────────────────────────────
  const noDataExtracted = !parsed.directives.length && !parsed.knowledge.length && !parsed.personality;
  if (noDataExtracted) {
    try {
      const prompt = `
You are the Wireline Configuration Engine. A business owner is training their AI fleet.
Current Training Target: ${agentId}
User Message: "${message}"

Extract any new instructions, rules, or knowledge from the message.
Categorize them as:
- DIRECTIVE: A hard rule the agent must follow (e.g. "Never give out personal cell numbers").
- KNOWLEDGE: A fact about the business (e.g. "We are closed on Sundays").
- PERSONALITY: A request regarding tone or style (e.g. "Be more enthusiastic and upbeat").

Respond ONLY in strict, valid JSON format (no markdown):
{"directives":[{"content":"...","priority":5}],"knowledge":[{"content":"..."}],"personality":""}`;

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });
      const geminiRes = await model.generateContent(prompt);
      const geminiParsed = JSON.parse(geminiRes.response.text() || "{}");
      parsed = {
        directives: geminiParsed.directives || [],
        knowledge: geminiParsed.knowledge || [],
        personality: geminiParsed.personality || "",
      };
    } catch (err) {
      log.error("Gemini extraction fallback failed", { error: getErrorMessage(err) });
    }
  }

  // ── Persist ───────────────────────────────────────────────────────
  try {
    if (parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ content: d.content, priority: d.priority ?? 5, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ content: k.content, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.personality) {
      await db.from('wireline_personality').upsert({
        agent_id: agentId,
        user_id: userId,
        content: parsed.personality,
      });
    }
  } catch (err) {
    log.error("Training persistence failed", { error: getErrorMessage(err) });
    return res.status(500).json({ error: "Failed to save training data" });
  }

  // ── Format confirmation message ───────────────────────────────────
  let responseContent = "MODIFICATIONS SYNCED TO MISSION CONTROL.\n\n";
  if (parsed.directives.length) {
    responseContent += `ADDED ${parsed.directives.length} OPERATIONAL DIRECTIVE(S):\n`;
    responseContent += parsed.directives.map((d: any) => `> [PRIORITY ${d.priority ?? 5}] ${d.content}`).join("\n") + "\n\n";
  }
  if (parsed.knowledge.length) {
    responseContent += `SYNCED ${parsed.knowledge.length} INTELLIGENCE FACT(S):\n`;
    responseContent += parsed.knowledge.map((k: any) => `> ${k.content}`).join("\n") + "\n\n";
  }
  if (parsed.personality) {
    responseContent += `UPDATED NEURAL PERSONALITY:\n> ${parsed.personality}`;
  }
  if (!parsed.directives.length && !parsed.knowledge.length && !parsed.personality) {
    responseContent = "INPUT ANALYZED. NO NEW DIRECTIVES DETECTED. PLEASE SPECIFY CONCRETE OPERATIONAL RULES OR KNOWLEDGE ENTRY.";
  }

  res.json({ success: true, responseContent, directives: parsed.directives, knowledge: parsed.knowledge, personality: parsed.personality });
});

// ==========================================
// 2a. AGENT TRAINING ENDPOINT (SAVE EXTRACTED DATA)
// ==========================================
app.post("/api/train/save", authenticateUser, async (req: any, res: any) => {
  const { extracted, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  
  try {
    const parsed = extracted || {};

    // Atomic update to Supabase with user_id enforcement
    if (parsed.directives && parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ ...d, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ ...k, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.personality) {
      // Upsert personality with user_id enforcement
      await db.from('wireline_personality').upsert({ 
        agent_id: agentId, 
        user_id: userId,
        content: parsed.personality,
        updated_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Training save error", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to save intelligence patterns" });
  }
});


// ==========================================
// Google Workspace OAuth Endpoints
// ==========================================

app.get('/api/oauth/google/url', oauthRateLimiter, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const oauth2Client = getGoogleOAuthClient(req);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces consent screen to always get a refresh token
  });
  
  res.json({ url: authUrl });
});

app.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], oauthRateLimiter, async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send("No code provided by Google.");
  }

  try {
    const oauth2Client = getGoogleOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user info to get email address
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    const emailAddress = userInfo.data.email;

    if (!emailAddress) throw new Error("Could not fetch user email.");

    // Store in Supabase
    await db.from('wireline_email_accounts').insert({
      email_address: emailAddress,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
    });

    // Send success to popup. Restrict postMessage to the configured app
    // origin (or the current request origin when APP_URL isn't set) so
    // a malicious page that opens this popup can't intercept the email.
    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get('host')}`;
    // JSON-encode values to neutralize any HTML/JS injection via the email field.
    const safeEmail = JSON.stringify(emailAddress);
    const safeOrigin = JSON.stringify(targetOrigin);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: ${safeEmail} }, ${safeOrigin});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    log.error("OAuth callback failed", {
      requestId: res.locals?.requestId,
      error: (error as any)?.message || String(error),
    });
    // Generic message to the user — never leak the raw error / stack /
    // DB strings the SDK may attach.
    res.status(500).send("Authentication failed. Please try again or contact support.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Microsoft / Outlook OAuth 2.0 (Microsoft Graph API)
//
//  Uses the Microsoft Identity Platform v2.0 endpoints with the "common"
//  tenant so both personal (outlook.com) and work/school (Office 365) accounts
//  can connect. Requires MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env
//  vars — register an app at https://portal.azure.com → App registrations.
//  Required API permissions: Mail.ReadWrite, Mail.Send, User.Read (delegated).
//  Add the redirect URI to "Authentication → Redirect URIs" in Azure portal.
// ─────────────────────────────────────────────────────────────────────────────
const MS_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
].join(" ");

function getMicrosoftRedirectUri(req: express.Request): string {
  let baseUrl = process.env.APP_URL;
  if (!baseUrl) {
    const hostHeader = req.get("host");
    const candidate = hostHeader ? `${req.protocol}://${hostHeader}` : null;
    if (candidate && (corsAllowList.length === 0 || corsAllowList.includes(candidate))) {
      baseUrl = candidate;
    } else {
      throw new Error("OAuth misconfigured: set APP_URL or add the host to CORS_ORIGINS.");
    }
  }
  return `${baseUrl}/api/oauth/microsoft/callback`;
}

/** Refresh a Microsoft access token using the stored refresh token.
 *  Returns the updated { access_token, expires_at } to persist. */
async function refreshMicrosoftToken(account: {
  refresh_token: string;
}): Promise<{ access_token: string; expires_at: number }> {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    grant_type:    "refresh_token",
    refresh_token: account.refresh_token,
    scope:         MS_SCOPES,
  });
  const r = await fetchWithTimeout(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() },
    15_000,
  );
  const d = await r.json() as any;
  if (!r.ok || !d.access_token) throw new Error(d.error_description || "Microsoft token refresh failed");
  return {
    access_token: d.access_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
}

/** Returns a valid Microsoft access token for the account, refreshing if needed. */
async function getMicrosoftAccessToken(account: {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}): Promise<string> {
  // Refresh 60 s early to prevent edge-of-expiry failures.
  // If expires_at is missing/zero, always refresh to be safe.
  if (account.expires_at && Date.now() < account.expires_at - 60_000) {
    return account.access_token;
  }
  const updated = await refreshMicrosoftToken(account);
  // Persist the new token so subsequent requests don't need to refresh again.
  await db.from("wireline_email_accounts")
    .update({ access_token: updated.access_token, expires_at: updated.expires_at })
    .eq("id", account.id);
  return updated.access_token;
}

/** Send an email via Microsoft Graph API (delegated auth). */
async function sendEmailViaMicrosoft(opts: {
  account: { id: string; access_token: string; refresh_token: string; expires_at: number };
  to: string;
  subject: string;
  body: string;
  threadInternetMessageId?: string; // for reply threading
}): Promise<{ messageId: string; conversationId: string }> {
  const token = await getMicrosoftAccessToken(opts.account);
  const payload: any = {
    message: {
      subject: opts.subject,
      body: { contentType: "Text", content: opts.body },
      toRecipients: [{ emailAddress: { address: opts.to } }],
    },
    saveToSentItems: true,
  };
  const r = await fetchWithTimeout(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    15_000,
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as any;
    throw new Error(getErrorMessage(err) || `Microsoft Graph sendMail failed: ${r.status}`);
  }
  // Graph returns 202 with no body for sendMail — conversationId is unavailable
  // here; we use a random ID that the sync will backfill on the next poll.
  return { messageId: `ms-${randomUUID()}`, conversationId: "" };
}

app.get("/api/oauth/microsoft/url", oauthRateLimiter, (req: express.Request, res: express.Response) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.status(500).json({ error: "Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET." });
  }
  try {
    const redirectUri = getMicrosoftRedirectUri(req);
    const params = new URLSearchParams({
      client_id:     process.env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri:  redirectUri,
      response_mode: "query",
      scope:         MS_SCOPES,
      prompt:        "consent",
    });
    res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` });
  } catch (e: any) {
    log.error("Microsoft OAuth URL generation failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to generate Microsoft OAuth URL." });
  }
});

app.get(
  ["/api/oauth/microsoft/callback", "/api/oauth/microsoft/callback/"],
  oauthRateLimiter,
  async (req: express.Request, res: express.Response) => {
    const { code, error: msError } = req.query as Record<string, string>;
    if (msError) {
      log.warn("Microsoft OAuth error returned", { error: msError });
      return res.status(400).send("Microsoft sign-in was declined or failed. Please try again.");
    }
    if (!code) return res.status(400).send("No authorization code provided.");

    try {
      const redirectUri = getMicrosoftRedirectUri(req);
      const params = new URLSearchParams({
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
        scope:         MS_SCOPES,
      });

      const tokenRes = await fetchWithTimeout(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() },
        15_000,
      );
      const tokens = await tokenRes.json() as any;
      if (!tokenRes.ok || !tokens.access_token) {
        throw new Error(tokens.error_description || "Token exchange failed");
      }

      // Fetch user profile from Graph.
      const profileRes = await fetchWithTimeout(
        "https://graph.microsoft.com/v1.0/me",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      const profile = await profileRes.json() as any;
      const emailAddress = profile.mail || profile.userPrincipalName;
      if (!emailAddress) throw new Error("Could not retrieve email address from Microsoft account.");

      await db.from("wireline_email_accounts").upsert({
        email_address: emailAddress,
        provider:      "microsoft",
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        expires_at:    Date.now() + (tokens.expires_in || 3600) * 1000,
      }, { onConflict: "email_address" });

      const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
        || `${req.protocol}://${req.get("host")}`;
      const safeEmail  = JSON.stringify(emailAddress);
      const safeOrigin = JSON.stringify(targetOrigin);
      res.send(`
        <html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: ${safeEmail} }, ${safeOrigin});
            window.close();
          } else { window.location.href = '/'; }
        </script><p>Authentication successful. You can close this window.</p></body></html>
      `);
    } catch (e: any) {
      log.error("Microsoft OAuth callback failed", { error: e?.message || String(e) });
      res.status(500).send("Microsoft authentication failed. Please try again or contact support.");
    }
  },
);

// Get connected accounts
app.get("/api/emails/accounts", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: accounts, error } = await db.from('wireline_email_accounts')
                                               .select('*')
                                               .eq('user_id', req.user.id)
                                               .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ accounts: accounts || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

app.patch("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;

    // SECURITY: if assigning to an agent, verify it belongs to the caller.
    // Same class of bug as the phone-numbers endpoint — without this an
    // attacker could route their inbound email to another user's agent.
    if (agent_id) {
      const { data: agent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agent_id)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!agent) return res.status(404).json({ error: "Agent not found" });
    }

    await db.from('wireline_email_accounts').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update account mapping", { error: getErrorMessage(error) });
    res.status(500).json({ error: "Failed to update account mapping" });
  }
});

app.delete("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from('wireline_email_accounts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});


// ==========================================
// 2.3 EMAIL THREAD & SYNC ENDPOINTS
// ==========================================

app.get("/api/emails/threads", authenticateUser, async (req: any, res: any) => {
  try {
    // Pagination + hard cap so a heavy user with thousands of threads
    // doesn't ship 50MB of JSON to the client on every load.
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(isNaN(limitRaw) ? 100 : limitRaw, 500);
    const offset = isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const { data: threads, error, count } = await db.from('wireline_email_threads')
                                           .select('*', { count: 'exact' })
                                           .eq('user_id', req.user.id)
                                           .order('last_message_at', { ascending: false })
                                           .range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({
      threads: threads || [],
      total: count || 0,
      hasMore: count ? (offset + limit) < count : false,
    });
  } catch(e) {
    log.error("Failed to fetch email threads", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

app.get("/api/emails/threads/:id/messages", authenticateUser, async (req: any, res: any) => {
  try {
    // Hard cap at 1000 messages per thread — a normal thread is < 50,
    // but a runaway autoresponder loop or a sync bug shouldn't be able
    // to ship a multi-MB response.
    const { data: messages, error } = await db.from('wireline_email_messages')
                                             .select('*')
                                             .eq('thread_id', req.params.id)
                                             .eq('user_id', req.user.id)
                                             .order('created_at', { ascending: true })
                                             .limit(1000);
    if (error) throw error;
    res.json({ messages: messages || [] });
  } catch(e) {
    log.error("Failed to fetch email thread messages", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// The "AI Intelligence" Sync
app.post("/api/emails/sync", authenticateUser, async (req: any, res: any) => {
  try {
     const userId = req.user.id;
     // 1. Fetch connected accounts
     const { data: accounts } = await db.from('wireline_email_accounts').select('*').eq('user_id', userId);
     if (!accounts || accounts.length === 0) return res.json({ success: true, count: 0 });

     // Fleet Synchronization
     const { data: agent } = await db.from('wireline_agents').select('*').eq('user_id', userId).limit(1).single();

     // Batch-fetch all agent-specific data for accounts that reference a specific agent.
     // Collecting unique agent IDs first avoids repeated single-row queries inside the loop.
     // Defense-in-depth: filter every batch query by user_id so a stale
     // account row referencing a foreign agent_id (created before the
     // ownership check on /api/emails/accounts was added) can never cause
     // cross-tenant data to leak into this user's email-sync context.
     const agentIds = [...new Set(accounts.map((a: any) => a.agent_id).filter(Boolean))];
     const [agentRows, knowledgeRows, directiveRows] = await Promise.all([
       agentIds.length
         ? db.from('wireline_agents').select('*').eq('user_id', userId).in('id', agentIds)
         : Promise.resolve({ data: [], error: null }),
       agentIds.length
         ? db.from('wireline_knowledge').select('agent_id, content').eq('user_id', userId).in('agent_id', agentIds)
         : Promise.resolve({ data: [], error: null }),
       agentIds.length
         ? db.from('wireline_directives').select('agent_id, content').eq('user_id', userId).in('agent_id', agentIds)
         : Promise.resolve({ data: [], error: null }),
     ]);
     if (agentRows.error) log.warn("Email sync: failed to batch-fetch agents", { error: agentRows.error.message });
     if (knowledgeRows.error) log.warn("Email sync: failed to batch-fetch knowledge", { error: knowledgeRows.error.message });
     if (directiveRows.error) log.warn("Email sync: failed to batch-fetch directives", { error: directiveRows.error.message });
     const agentMap = new Map((agentRows.data || []).map((a: any) => [a.id, a]));
     const knowledgeMap = new Map<string, string[]>();
     const directivesMap = new Map<string, string[]>();
     for (const k of (knowledgeRows.data || [])) {
       const arr = knowledgeMap.get(k.agent_id) || [];
       arr.push(k.content);
       knowledgeMap.set(k.agent_id, arr);
     }
     for (const d of (directiveRows.data || [])) {
       const arr = directivesMap.get(d.agent_id) || [];
       arr.push(d.content);
       directivesMap.set(d.agent_id, arr);
     }

     let totalNew = 0;

     for (const account of accounts) {
        // Resolve agent/knowledge/directives from pre-fetched maps (no extra DB round-trips).
        let activeAgent = agent;
        let knowledge: string[] = [];
        let directives: string[] = [];
        if (account.agent_id) {
          const specificAgent = agentMap.get(account.agent_id);
          if (specificAgent) activeAgent = specificAgent;
          knowledge = knowledgeMap.get(account.agent_id) || [];
          directives = directivesMap.get(account.agent_id) || [];
        }

        // ── Per-account sync: branch by provider ────────────────────────────
        if (account.provider === 'microsoft') {
          // ── Microsoft Graph — fetch unread inbox messages ──────────────────
          let msToken: string;
          try {
            msToken = await getMicrosoftAccessToken(account);
          } catch (tokenErr: any) {
            log.warn("Email sync: Microsoft token refresh failed", { account: account.email_address, error: tokenErr?.message });
            continue;
          }

          const msRes = await fetchWithTimeout(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=50&$select=id,subject,from,bodyPreview,conversationId,internetMessageId",
            { headers: { Authorization: `Bearer ${msToken}` } },
            15_000,
          );
          if (!msRes.ok) {
            log.warn("Email sync: Microsoft Graph list failed", { account: account.email_address, status: msRes.status });
            continue;
          }
          const msData = await msRes.json() as any;
          const msMsgs: any[] = msData.value || [];
          if (msMsgs.length === 0) continue;

          const msConvIds = [...new Set(msMsgs.map((m: any) => m.conversationId).filter(Boolean))];
          const msMsgIds  = msMsgs.map((m: any) => m.id).filter(Boolean);

          const [existingMsThreads, existingMsMsgs] = await Promise.all([
            // Defense-in-depth: scope to userId so a Graph-emitted
            // conversationId can never resolve to another tenant's thread.
            msConvIds.length
              ? db.from('wireline_email_threads').select('*').eq('user_id', userId).in('thread_id', msConvIds)
              : Promise.resolve({ data: [], error: null }),
            msMsgIds.length
              ? db.from('wireline_email_messages').select('google_message_id').eq('user_id', userId).in('google_message_id', msMsgIds)
              : Promise.resolve({ data: [], error: null }),
          ]);
          const msThreadMap = new Map((existingMsThreads.data || []).map((t: any) => [t.thread_id, t]));
          const msSeen = new Set((existingMsMsgs.data || []).map((m: any) => m.google_message_id));

          for (const msg of msMsgs) {
            const convId   = msg.conversationId || `ms-${msg.id}`;
            const msgId    = msg.id;
            const subject  = msg.subject || "No Subject";
            const from     = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || "";
            const snippet  = msg.bodyPreview || "";

            if (msSeen.has(msgId)) continue;
            msSeen.add(msgId);
            totalNew++;

            let existingThread = msThreadMap.get(convId);
            if (!existingThread) {
              const { data: newThread } = await db.from('wireline_email_threads').insert({
                user_id: userId,
                account_id: account.id,
                thread_id:  convId,
                customer_email: from,
                subject:    subject,
                status:     'pending_ai',
              }).select('*').single();
              existingThread = newThread;
              if (existingThread) msThreadMap.set(convId, existingThread);
            }

            await db.from('wireline_email_messages').insert({
              user_id: userId,
              thread_id:        existingThread!.id,
              google_message_id: msgId,
              role:             'customer',
              content:          snippet,
            });

            // Mark as read in Outlook
            await fetchWithTimeout(
              `https://graph.microsoft.com/v1.0/me/messages/${msgId}`,
              { method: "PATCH", headers: { Authorization: `Bearer ${msToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ isRead: true }) },
              10_000,
            ).catch((e: any) => log.warn("Email sync: MS mark-read failed", { error: e?.message }));

            // Generate AI reply (same Claude/Gemini path as Gmail).
            // CRITICAL: scope calendar reads to this operator's user_id —
            // wireline_appointments holds rows for every tenant, and an
            // unscoped query would leak (and hallucinate) other operators'
            // booked times into this reply.
            // Date is LLM-generated tool-call input — strip LIKE wildcards
            // (`%`, `_`) and limit length, matching the Vapi check_calendar
            // handler's sanitization (server.ts ~1502).
            const checkCalendarMs = async (date: string) => {
              const safeDate = String(date || '').replace(/[^A-Za-z0-9 ,\/\-\.]/g, '').slice(0, 60);
              if (!safeDate) return `No date provided. Ask the customer which date they need.`;
              const { data } = await db.from('wireline_appointments')
                .select('time')
                .eq('user_id', userId)
                .ilike('date', `%${safeDate}%`);
              return data && data.length > 0
                ? `Booked times on ${safeDate}: ${data.map((a: any) => a.time).join(', ')}. Offer other times.`
                : `The entire day on ${safeDate} is fully open.`;
            };
            const bookAppointmentMs = async (args: { date: string; time: string; customer_name: string; service_type: string }) => {
              try {
                const { data, error } = await db.from('wireline_appointments').insert({
                  user_id: userId,
                  agent_id: activeAgent?.id, date: args.date, time: args.time,
                  customer_name: args.customer_name, service_type: args.service_type, status: "Scheduled",
                }).select('id').single();
                if (error) throw error;
                return { success: true, reference_id: String(data.id).split('-')[0] };
              } catch (e: any) { return { success: false, error: e?.message || "Booking failed." }; }
            };

            let finalReplyMs = "I've received your email and will follow up shortly.";
            if (claudeBrain.isClaudeAvailable()) {
              try {
                const r = await claudeBrain.smartEmailReply({
                  agentName: activeAgent?.name || "Wireline Agent",
                  agentTone: activeAgent?.email_agent_tone || "Professional",
                  agentArchetype: activeAgent?.archetype || "Receptionist",
                  agentRole: activeAgent?.role || DEFAULT_AGENT_ROLE,
                  knowledgeBase: knowledge, directives,
                  fromEmail: from, subject, emailBody: snippet,
                  onCheckCalendar: checkCalendarMs, onBookAppointment: bookAppointmentMs,
                });
                finalReplyMs = r.replyText || finalReplyMs;
              } catch (err: any) {
                log.error("Claude email reply failed (MS)", { error: getErrorMessage(err) });
              }
            }

            if (activeAgent?.email_signature) finalReplyMs = `${finalReplyMs}\n\n${activeAgent.email_signature}`;

            await db.from('wireline_email_messages').insert({
              user_id: userId,
              thread_id: existingThread!.id, role: 'ai', content: finalReplyMs,
            });

            // Auto-respond for Microsoft if enabled
            if (activeAgent?.email_auto_respond) {
              try {
                await sendEmailViaMicrosoft({ account, to: from, subject: `Re: ${subject}`, body: finalReplyMs });
              } catch (sendErr: any) {
                log.error("MS auto-respond failed", { error: sendErr?.message });
              }
            }

            await db.from('wireline_email_threads').update({
              summary: snippet.substring(0, 100), last_message_at: new Date(), status: 'open',
            }).eq('id', existingThread!.id);
          }
          continue; // done with this Microsoft account
        }

        // ── Gmail path ───────────────────────────────────────────────────────
        const oauth2Client = getGoogleOAuthClient(req);
        oauth2Client.setCredentials({
           access_token: account.access_token,
           refresh_token: account.refresh_token,
           expiry_date: account.expires_at
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Fetch unread messages
        const gmailRes = await gmail.users.messages.list({
           userId: 'me',
           q: 'is:unread',
           maxResults: 5
        });

        const messages = gmailRes.data.messages || [];
        if (messages.length === 0) continue;

        // Fetch all message details in parallel. Use allSettled so a single
        // transient failure (rate-limit, deleted message) doesn't abort the
        // entire sync — we simply skip the messages that couldn't be fetched.
        const msgSettled = await Promise.allSettled(
          messages.map((msg: any) => gmail.users.messages.get({ userId: 'me', id: msg.id! }))
        );
        const msgDetails = msgSettled
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value);
        if (msgDetails.length < messages.length) {
          log.warn("Email sync: some message fetches failed", {
            account: account.email_address,
            attempted: messages.length,
            succeeded: msgDetails.length,
          });
        }
        if (msgDetails.length === 0) continue;

        // Collect all thread IDs and message IDs so we can batch-check DB existence
        // in two queries instead of 2 × N individual lookups.
        const threadIds = [...new Set(msgDetails.map((m: any) => m.data.threadId!).filter(Boolean))];
        const googleMsgIds = msgDetails.map((m: any) => m.data.id!).filter(Boolean);

        const [existingThreadsRes, existingMsgsRes] = await Promise.all([
          // Defense-in-depth: scope to userId. Gmail thread IDs are
          // globally unique, but pinning to user_id ensures a stale row
          // from a deleted account can't bleed into another tenant's sync.
          threadIds.length
            ? db.from('wireline_email_threads').select('*').eq('user_id', userId).in('thread_id', threadIds)
            : Promise.resolve({ data: [], error: null }),
          googleMsgIds.length
            ? db.from('wireline_email_messages').select('google_message_id').eq('user_id', userId).in('google_message_id', googleMsgIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (existingThreadsRes.error) log.warn("Email sync: thread batch-check failed", { error: existingThreadsRes.error.message });
        if (existingMsgsRes.error) log.warn("Email sync: message batch-check failed", { error: existingMsgsRes.error.message });
        const threadDbMap = new Map((existingThreadsRes.data || []).map((t: any) => [t.thread_id, t]));
        const seenMsgIds = new Set((existingMsgsRes.data || []).map((m: any) => m.google_message_id));

        for (const msgData of msgDetails) {
           const msg = msgData.data;
           const headers = msg.payload?.headers || [];
           const subject = headers.find((h: any) => h.name === 'Subject')?.value || "No Subject";
           const from = headers.find((h: any) => h.name === 'From')?.value || "";
           const threadId = msg.threadId!;
           const msgId = msg.id!;
           
           // Extract snippet or body
           const snippet = msg.snippet || "";
           
           // Check if thread exists in DB (from pre-fetched map)
           let existingThread = threadDbMap.get(threadId);
           
           if (!existingThread) {
              const { data: newThread } = await db.from('wireline_email_threads').insert({
                 user_id: userId,
                 account_id: account.id,
                 thread_id: threadId,
                 customer_email: from,
                 subject: subject,
                 status: 'pending_ai'
              }).select('*').single();
              existingThread = newThread;
              if (existingThread) threadDbMap.set(threadId, existingThread);
           }

           // Check if message exists in DB (from pre-fetched set)
           if (seenMsgIds.has(msgId)) continue;

           totalNew++;
           seenMsgIds.add(msgId);

           // Save the customer message
           await db.from('wireline_email_messages').insert({
              user_id: userId,
              thread_id: existingThread!.id,
              google_message_id: msgId,
              role: 'customer',
              content: snippet
           });

           // mark as read in Gmail (optional, but good for sync)
           await gmail.users.messages.modify({
              userId: 'me',
              id: msgId,
              requestBody: { removeLabelIds: ['UNREAD'] }
           });

           // 3. GENERATE AI RESPONSE — Claude-primary with tool use; Gemini as fallback.
           //    Tool implementations are shared between both paths.
           //    CRITICAL: scope calendar reads to this operator's user_id so the
           //    LLM never sees (and never hallucinates back) other tenants' bookings.
           //    Date is LLM-generated tool-call input — strip LIKE wildcards and
           //    limit length, matching the Vapi check_calendar handler.
           const checkCalendar = async (date: string) => {
             const safeDate = String(date || '').replace(/[^A-Za-z0-9 ,\/\-\.]/g, '').slice(0, 60);
             if (!safeDate) return `No date provided. Ask the customer which date they need.`;
             const { data } = await db.from('wireline_appointments')
               .select('time')
               .eq('user_id', userId)
               .ilike('date', `%${safeDate}%`);
             if (data && data.length > 0) {
               return `Booked times on ${safeDate}: ${data.map(a => a.time).join(', ')}. Offer other times.`;
             }
             return `The entire day on ${safeDate} is fully open.`;
           };
            const bookAppointment = async (args: { date: string; time: string; customer_name: string; service_type: string }) => {
             try {
               const { data, error } = await db.from('wireline_appointments').insert({
                 user_id: userId,
                 agent_id: activeAgent?.id,
                 date: args.date,
                 time: args.time,
                 customer_name: args.customer_name,
                 service_type: args.service_type,
                 status: "Scheduled",
               }).select('id').single();
               if (error) throw error;
               return { success: true, reference_id: String(data.id).split('-')[0] };
             } catch (e: any) {
               return { success: false, error: e?.message || "Booking failed." };
             }
           };

           let finalReply = "I've received your email and will follow up shortly.";

           if (claudeBrain.isClaudeAvailable()) {
             try {
               const result = await claudeBrain.smartEmailReply({
                 agentName: activeAgent?.name || "Wireline Agent",
                 agentTone: activeAgent?.email_agent_tone || "Professional",
                 agentArchetype: activeAgent?.archetype || "Receptionist",
                 agentRole: activeAgent?.role || DEFAULT_AGENT_ROLE,
                 knowledgeBase: knowledge,
                 directives: directives,
                 fromEmail: from,
                 subject: subject,
                 emailBody: snippet,
                 onCheckCalendar: checkCalendar,
                 onBookAppointment: bookAppointment,
               });
               finalReply = result.replyText || finalReply;
             } catch (err) {
               log.error("Claude email reply failed; falling back to Gemini", { error: getErrorMessage(err) });
             }
           }

           // Legacy Gemini path — runs when Claude is offline or failed.
           if (finalReply === "I've received your email and will follow up shortly.") {
             const systemInstruction = `
               ## IDENTITY & ARCHETYPE
               Persona: You are the AI Email Agent for our company.
               Tone: ${activeAgent?.email_agent_tone || 'Professional'}. Concise and helpful.
               Personality: ${activeAgent?.archetype || 'Receptionist'}.
               Company Site: ${activeAgent?.website_url || 'Home Services Platform'}.

               ## CONTEXT
               INCOMING EMAIL FROM: ${from}
               SUBJECT: ${subject}

               ## GUARDRAILS
               Response Length: CRITICAL. Keep every email under 20 words where possible. Be direct and avoid flowery pleasantries.
               - If they want an appointment, use your tools to check availability and book it if confirmed.

               ## KNOWLEDGE BASE
               ${knowledge.length > 0 ? knowledge.map(k => `- ${k}`).join('\n') : "Use standard professional knowledge."}

               ## ABSOLUTE RULES
               ${directives.length > 0 ? directives.map(d => `- ${d}`).join('\n') : ""}
             `;

             const tools: any = [{
                functionDeclarations: [
                    { name: "check_calendar_availability", description: "Checks availability on a specific date.", parameters: { type: SchemaType.OBJECT, properties: { date: { type: SchemaType.STRING } }, required: ["date"] } },
                    { name: "book_appointment", description: "Books an appointment.", parameters: { type: SchemaType.OBJECT, properties: { date: { type: SchemaType.STRING }, time: { type: SchemaType.STRING }, customer_name: { type: SchemaType.STRING }, service_type: { type: SchemaType.STRING } }, required: ["date", "time", "customer_name", "service_type"] } },
                ],
             }];

             const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", systemInstruction, tools, generationConfig: { temperature: 0.4 } });
             const chat = model.startChat();

             try {
                let resObj = await chat.sendMessage(snippet);
                let response = resObj.response;
                let calls = response.functionCalls();
                while (calls && calls.length > 0) {
                   const toolResponses = [];
                   for (const call of calls) {
                       let toolResult = "Tool failed";
                       const args = call.args as any;
                       try {
                           if (call.name === "check_calendar_availability") {
                              toolResult = await checkCalendar(args.date as string);
                           } else if (call.name === "book_appointment") {
                              const r = await bookAppointment(args);
                              toolResult = r.success ? `Booked successfully! Reference ID: ${r.reference_id}` : (r.error || "Booking failed.");
                           }
                       } catch(e) {
                           toolResult = "Error executing tool. Assume failure or ask human.";
                       }
                       toolResponses.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
                   }
                   const nextRes = await chat.sendMessage(toolResponses);
                   response = nextRes.response;
                   calls = response.functionCalls();
                }
                finalReply = response.text() || finalReply;
             } catch(e) {
                log.error("Gemini email fallback also failed", { error: e?.message || String(e) });
             }
           }

           if (activeAgent?.email_signature) {
               finalReply = `${finalReply}\n\n${activeAgent.email_signature}`;
           }

           // Save the AI message (as a draft in our DB)
           await db.from('wireline_email_messages').insert({
              user_id: userId,
              thread_id: existingThread!.id,
              role: 'ai',
              content: finalReply
           });

           // 4. AUTONOMOUS AUTO-RESPOND (If enabled)
           if (activeAgent?.email_auto_respond) {
               try {
                  const toEmail = from.includes('<') ? from.split('<')[1].split('>')[0] : from;
                  const raw = Buffer.from(
                     `To: ${toEmail}\r\n` +
                     `Subject: Re: ${subject}\r\n` +
                     `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                     `${finalReply}`
                  ).toString('base64url');

                  await gmail.users.messages.send({
                     userId: 'me',
                     requestBody: { raw, threadId }
                  });
               } catch (sendErr) {
                  log.error("Auto-respond failed", { error: sendErr?.message || String(sendErr) });
               }
           }

           // 5. OMNICHANNEL TASK ROUTING (EMAIL -> PHONE)
           const lowerSnippet = snippet.toLowerCase();
           if (lowerSnippet.includes('call') || lowerSnippet.includes('phone') || lowerSnippet.includes('callback') || lowerSnippet.includes('number')) {
              try {
                 await db.from('wireline_fleet_tasks').insert({
                    user_id: userId,
                    source_type: 'email_thread',
                    source_id: threadId,
                    target_channel: 'phone',
                    agent_id: activeAgent?.id || null,
                    customer_info: { email: from, subject: subject },
                    task_type: 'callback_required',
                    description: `Lead requested callback via email mailroom. Lead Contact: ${from}`,
                    status: 'pending'
                 });
              } catch(handoffErr) {
                 log.error("Email-to-Phone handoff failed", { error: handoffErr?.message || String(handoffErr) });
              }
           }

           // Update thread summary & status
           await db.from('wireline_email_threads').update({
              summary: snippet.substring(0, 100),
              last_message_at: new Date(),
              status: 'open'
           }).eq('id', existingThread!.id);

           // AI LEAD SCORING FOR EMAIL — Claude-primary, Gemini fallback.
           try {
              let score = 0; let label = 'none';
              if (claudeBrain.isClaudeAvailable()) {
                 try {
                    const r = await claudeBrain.scoreIntent({ subject, body: snippet });
                    score = r.score || 0; label = r.label || 'none';
                 } catch (err) {
                    log.error("Claude email scoring failed; falling back to Gemini", { error: getErrorMessage(err) });
                 }
              }
              if (label === 'none' && score === 0) {
                 const emailScoringPrompt = `
                   Analyze this email and give a BUSINESS INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
                   Subject: ${subject}
                   Body: ${snippet}
                   RESPONSE FORMAT (JSON): { "score": number, "label": string }
                 `;
                 const sModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
                 const sRes = await sModel.generateContent(emailScoringPrompt);
                 const sObj = JSON.parse(sRes.response.text() || "{}");
                 score = sObj.score || 0; label = sObj.label || 'none';
              }
              await db.from('wireline_email_threads').update({
                 lead_score: score, intent_label: label,
              }).eq('id', existingThread!.id);
           } catch(e) {
              log.error("Email scoring failed", { error: e?.message || String(e) });
           }
        }
     }

     res.json({ success: true, synced: totalNew });
  } catch(e: any) {
     // Log the full error for diagnostics; return a generic message to the
     // client to avoid leaking internal stack traces / file paths.
     log.error("Email sync error", { error: getErrorMessage(e) });
     res.status(500).json({ error: "Email sync failed" });
  }
});

app.post("/api/emails/threads/:id/reply", authenticateUser, emailRateLimiter, async (req: any, res: any) => {
   // Hoisted so the catch handler can include provider context in the
   // Sentry event without crashing on `ReferenceError: account` if the
   // failure happens before the thread lookup completes.
   let account: any = null;
   try {
      const validation = parseFormData(EmailReplySchema, {
        body: req.body.body,
      });
      if (!validation.success) {
        return res.status(400).json({ error: "Validation failed", errors: validation.errors });
      }
      const { body } = validation.data;
      const { data: thread } = await db.from('wireline_email_threads').select('*, wireline_email_accounts(*)').eq('id', req.params.id).eq('user_id', req.user.id).single();

      if (!thread) throw new Error("Thread not found");

      account = thread.wireline_email_accounts;

      if (account.provider === 'microsoft') {
        // ── Microsoft Graph reply ─────────────────────────────────────────
        await sendEmailViaMicrosoft({
          account,
          to:      thread.customer_email,
          subject: `Re: ${thread.subject}`,
          body,
        });
      } else {
        // ── Gmail reply ────────────────────────────────────────────────────
        const oauth2Client = getGoogleOAuthClient(req);
        oauth2Client.setCredentials({
           access_token: account.access_token,
           refresh_token: account.refresh_token,
           expiry_date: account.expires_at
        });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const messageParts = [
          `To: ${thread.customer_email}`,
          `Subject: Re: ${thread.subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          body
        ];
        const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64url');
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage, threadId: thread.thread_id }
        });
      }

      // Save to DB
      await db.from('wireline_email_messages').insert({
         user_id: req.user.id,
         thread_id: thread.id,
         role: 'ai',
         content: body
      });

      // Track email sent in Sentry
      SentryEvents.emailSent({
        thread_id: thread.id,
        recipient_count: 1,
      });

      res.json({ success: true });
   } catch(e: any) {
      log.error("Reply Error", { error: e?.message || String(e) });
      const errorMsg = getErrorMessage(e);
      SentryEvents.externalServiceError({
        service: account?.provider === 'microsoft' ? 'microsoft-graph' : (account?.provider === 'gmail' ? 'gmail' : 'unknown'),
        endpoint: '/api/emails/threads/:id/reply',
        error_message: errorMsg,
      });
      res.status(500).json({ error: errorMsg });
   }
});

app.post("/api/emails/draft", authenticateUser, emailRateLimiter, async (req: any, res: any) => {
  try {
     const validation = parseFormData(EmailDraftSchema, {
       subject: req.body.subject,
       messages: req.body.messages,
       context: req.body.context,
     });
     if (!validation.success) {
       return res.status(400).json({ error: "Validation failed", errors: validation.errors });
     }
     const { subject, messages, context } = validation.data;
     const prompt = `You are a professional AI assistant drafting an email reply.
Subject: ${subject}
Conversation history:
${(messages || []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Extra instructions from user (if any):
${context || 'Write a helpful and polite reply that advances the conversation seamlessly without repeating the context.'}

Draft only the plain text email body. Do not include a subject line. Be professional but brief. Do not include placeholders like "[Your Name]", write as the AI representative if a name is not known, or just leave it off.`;

     const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
     const aiRes = await aiModel.generateContent(prompt);

     res.json({ draft: aiRes.response.text() });
  } catch (e) {
     const errorMsg = getErrorMessage(e);
     log.error("Draft error", { error: errorMsg });
     SentryEvents.aiApiFailure({
       endpoint: '/api/emails/draft',
       error_message: errorMsg,
       model: 'gemini-1.5-flash',
     });
     res.status(500).json({ error: "Failed to draft reply" });
  }
});

// OPTIMIZE AGENT PROTOCOLS
app.post("/api/agents/:id/optimize", authenticateUser, async (req: any, res: any) => {
   try {
      const { id } = req.params;
      const { data: logs } = await db.from('wireline_call_logs')
         .select('summary, transcript, lead_score, intent_label')
         .eq('agent_id', id).eq('user_id', req.user.id)
         .order('created_at', { ascending: false }).limit(10);

      if (!logs || logs.length === 0) {
         return res.json({ suggestions: [], reason: "Insufficient data: Need at least 1 completed mission log." });
      }

      // Claude path — uses the same agent-review tool as /api/claude/agent-review,
      // but flattens the response to {suggestions, analysis} for legacy callers.
      if (claudeBrain.isClaudeAvailable()) {
         try {
            const { data: agent } = await db.from('wireline_agents')
               .select('name, archetype, role').eq('id', id).eq('user_id', req.user.id).single();
            const review = await claudeBrain.agentReview({
               agentName: agent?.name || 'Wireline Agent',
               archetype: agent?.archetype || 'Receptionist',
               role: agent?.role || DEFAULT_AGENT_ROLE,
               callLogs: logs as any,
            });
            return res.json({
               suggestions: (review.suggested_directives || []).slice(0, 3).map((d: any) => d.directive),
               analysis: review.executive_summary,
               full_review: review,
            });
         } catch (err) {
            log.error("Claude optimize failed; falling back to Gemini", { error: getErrorMessage(err) });
         }
      }

      // Legacy Gemini fallback
      const prompt = `
        AGENT ID: ${id}
        MISSION LOGS (LAST 10):
        ${logs.map((l, i) => `Log ${i+1}: Summary: ${l.summary}. Transcript: ${l.transcript}`).join('\n\n')}

        TASK: Analyze performance and suggest exactly 3 new tactical directives to improve the agent.
        FORMAT: JSON { "suggestions": string[], "analysis": string }
      `;

      const model = genAI.getGenerativeModel({
         model: "gemini-1.5-pro",
         generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      res.json(JSON.parse(aiText || "{}"));
   } catch (e) {
      res.status(500).json({ error: "Optimization protocol failed" });
   }
});

// ==========================================
// 1.9 CONSOLIDATED ACTIVITY FEED (TRIGGER LOG)
// ==========================================
app.get("/api/fleet/activity", authenticateUser, async (req: any, res: any) => {
   try {
      const [logs, tasks, lessons, emails] = await Promise.all([
          db.from('wireline_call_logs').select('id, customer_number, lead_score, intent_label, summary, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_fleet_tasks').select('id, description, status, priority, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_agent_lessons').select('id, lesson, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_email_threads').select('id, customer_email, lead_score, intent_label, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      const activity = [
         ...(logs.data || []).map(l => ({ 
            id: l.id, 
            type: 'SIGNAL_ANALYZED', 
            trigger: 'Voice Ingestion', 
            action: `Intent extracted: ${l.intent_label || 'Analysis Pending'}`, 
            meta: l.customer_number,
            timestamp: l.created_at,
            importance: l.lead_score > 70 ? 'high' : 'medium'
         })),
         ...(tasks.data || []).map(t => ({ 
            id: t.id, 
            type: 'MISSION_INJECTED', 
            trigger: 'Functional Requirement Detected', 
            action: `New Task: ${t.description.substring(0, 50)}...`, 
            meta: t.status,
            timestamp: t.created_at,
            importance: t.priority === 'high' ? 'critical' : 'medium'
         })),
         ...(lessons.data || []).map(l => ({ 
            id: l.id, 
            type: 'NEURAL_OPTIMIZATION', 
            trigger: 'Behavioral Deviation', 
            action: `Lesson Learned: ${l.lesson.substring(0, 50)}...`, 
            meta: 'Agent Refinement',
            timestamp: l.created_at,
            importance: 'low'
         })),
         ...(emails.data || []).map(e => ({ 
            id: e.id, 
            type: 'DIGITAL_RELAY', 
            trigger: 'OMNI_CHANNEL_SYNC', 
            action: `Email Thread Synced: ${e.intent_label || 'Scanning'}`, 
            meta: e.customer_email,
            timestamp: e.created_at,
            importance: 'medium'
         }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({ activity: activity.slice(0, 15) });
   } catch(e) {
      log.error("Activity feed error", { error: e?.message || String(e) });
      res.status(500).json({ error: "Failed to fetch activity" });
   }
});

// ==========================================
// 1.10 SUPERVISED AGENT TUNING
// ==========================================

// Per-agent performance stats — call count, avg score, total minutes, sentiment breakdown.
app.get("/api/agents/:id/performance", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const { data: logs } = await db
      .from('wireline_call_logs')
      .select('id, lead_score, duration_seconds, sentiment, created_at')
      .eq('agent_id', agentId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    const rows = logs || [];
    const callCount = rows.length;
    const totalMinutes = Math.ceil(rows.reduce((s: number, r: any) => s + (r.duration_seconds || 0), 0) / 60);
    const scored = rows.filter((r: any) => (r.lead_score ?? 0) > 0);
    const avgScore = scored.length ? Math.round(scored.reduce((s: number, r: any) => s + r.lead_score, 0) / scored.length) : 0;
    const sentiment: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    for (const r of rows) {
      const k = (r.sentiment || 'neutral').toLowerCase();
      if (k in sentiment) sentiment[k]++; else sentiment['neutral']++;
    }
    // Calls per day (last 7d) for sparkline
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const byDay: Record<string, number> = {};
    last7.forEach(d => { byDay[d] = 0; });
    rows.forEach((r: any) => {
      const d = new Date(r.created_at).toISOString().split('T')[0];
      if (d in byDay) byDay[d]++;
    });
    const sparkline = last7.map(d => byDay[d]);

    res.json({ callCount, totalMinutes, avgScore, sentiment, sparkline });
  } catch (e: any) {
    log.error("Agent performance error", { error: e?.message });
    res.json({ callCount: 0, totalMinutes: 0, avgScore: 0, sentiment: { positive: 0, neutral: 0, negative: 0 }, sparkline: [] });
  }
});

// ──────────────────────────────────────────────────────────────────────────
//  GET /api/agents/:id/scorecard?days=30
//
//  Outcome-aligned reporting: the metric that "winning" means depends on
//  what the operator told us this agent is FOR (kpi_focus). Solopreneur
//  schedulers care about booked appointments; sales agents care about
//  qualified pipeline; support agents care about first-contact resolution;
//  ops dashboards care about caller sentiment.
//
//  This endpoint normalizes those very different metrics into one shape
//  the UI can render consistently:
//
//    {
//      kpi_focus,                 // one of the AgentBusinessProfile values
//      window_days,
//      primary: {
//        label, value, format,    // headline number for this surface
//        delta_pct,               // % change vs the prior window of equal length
//        trend: number[]          // last `window_days` values (sparkline)
//      },
//      secondary: [{label, value, format}, ...],   // supporting context
//      sample_size                // total calls considered
//    }
// ──────────────────────────────────────────────────────────────────────────
app.get("/api/agents/:id/scorecard", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const userId = req.user.id;

    // Bound the window to a sensible range. Default 30; cap at 365 so a
    // single dashboard page can't trigger a year-over-year scan by accident.
    const daysRaw = parseInt(req.query.days as string);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 30, 1), 365);

    // Verify ownership AND read kpi_focus in one shot.
    const { data: agent } = await db
      .from('wireline_agents')
      .select('id, kpi_focus')
      .eq('id', agentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const focus: string = agent.kpi_focus || 'general';

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const periodStart = new Date(now - windowMs).toISOString();
    const priorStart  = new Date(now - 2 * windowMs).toISOString();

    // Two periods: current and prior, of equal length, so we can show
    // a delta_pct without inventing a baseline.
    const [currentLogs, priorLogs, appts, openTasks] = await Promise.all([
      db.from('wireline_call_logs')
        .select('id, lead_score, duration_seconds, sentiment, intent_label, created_at, customer_number')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .order('created_at', { ascending: false })
        .limit(2000),
      db.from('wireline_call_logs')
        .select('id, lead_score, duration_seconds, sentiment, intent_label, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', priorStart).lt('created_at', periodStart)
        .limit(2000),
      // Booked appointments attributed to this agent in the current window
      // — used as the conversion numerator.
      db.from('wireline_appointments')
        .select('id, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .limit(2000),
      // Open follow-up fleet tasks linked to calls in the current window
      // — proxy for "calls that needed a human after the agent". Used in
      // the resolution-rate computation.
      db.from('wireline_fleet_tasks')
        .select('id, source_id, source_type, created_at')
        .eq('agent_id', agentId).eq('user_id', userId)
        .gte('created_at', periodStart)
        .eq('source_type', 'phone_call')
        .limit(2000),
    ]);

    // Hand the rows to the pure scorecard math (src/lib/agent-scorecard.ts)
    // so the per-focus metric definitions are unit-tested in isolation.
    const result = computeScorecard({
      focus,
      windowDays: days,
      now,
      currentLogs: currentLogs.data || [],
      priorLogs:   priorLogs.data || [],
      appointments: appts.data || [],
      openFollowUps: openTasks.data || [],
    });

    res.json(result);
  } catch (e: any) {
    log.error("Agent scorecard error", { error: getErrorMessage(e) });
    res.status(500).json({ error: 'Failed to compute scorecard' });
  }
});

app.get("/api/agents/:id/lessons", authenticateUser, async (req: any, res: any) => {
   try {
      const { data: lessons, error } = await db.from('wireline_agent_lessons').select('*')
         .eq('agent_id', req.params.id)
         .eq('user_id', req.user.id)
         .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ lessons });
   } catch (e) {
      res.status(500).json({ error: "Failed to fetch lessons" });
   }
});

app.post("/api/agents/:id/promote", authenticateUser, async (req: any, res: any) => {
   try {
      const { lessonId, content } = req.body;
      const agentId = req.params.id;

      // SECURITY: verify the caller owns the target agent before inserting
      // a directive against it. Without this, an attacker could promote a
      // lesson into another user's agent's directives.
      const { data: ownedAgent } = await db
        .from('wireline_agents')
        .select('id')
        .eq('id', agentId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      if (!ownedAgent) return res.status(404).json({ error: "Agent not found" });

      // Validate content shape — keeps the directive within table limits.
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required" });
      }
      if (content.length > 1000) {
        return res.status(400).json({ error: "content must be 1000 characters or less" });
      }

      // Insert into wireline_directives (the table that agent-config reads from).
      // Priority 5 = medium on the 1-10 scale used throughout the app.
      const { error: promoError } = await db.from('wireline_directives').insert({
         agent_id: agentId,
         content: content.trim(),
         priority: 5,
         user_id: req.user.id
      });
      if (promoError) throw promoError;

      // Delete the lesson after promotion — verify ownership first
      await db.from('wireline_agent_lessons').delete()
         .eq('id', lessonId)
         .eq('user_id', req.user.id);

      // Track agent optimization when lessons are promoted to directives
      SentryEvents.agentOptimized({
        agent_id: agentId,
        metric_improved: 'instruction_baseline',
      });

      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Promotion failed" });
   }
});

app.delete("/api/agents/:id/lessons/:lessonId", authenticateUser, async (req: any, res: any) => {
   try {
      await db.from('wireline_agent_lessons').delete()
         .eq('id', req.params.lessonId)
         .eq('user_id', req.user.id);
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Delete failed" });
   }
});

// ==========================================
//  CLAUDE BRAIN — advanced agent capabilities
// ==========================================

function claudeErr(res: any, e: any, endpoint: string = '/api/claude') {
  if (e instanceof claudeBrain.ClaudeUnavailableError) {
    SentryEvents.aiApiFailure({
      endpoint,
      error_message: e.message,
      model: 'claude',
    });
    return res.status(503).json({
      error: e.message,
      code: "CLAUDE_OFFLINE",
    });
  }

  const errorMsg = getErrorMessage(e);
  log.error("Claude endpoint error", { error: errorMsg, endpoint });
  // Track AI API errors with detailed context for debugging
  SentryEvents.aiApiFailure({
    endpoint,
    error_message: errorMsg,
    model: 'claude',
  });

  // Surface known Anthropic SDK error shapes (rate limit, validation,
  // overload) — these are useful to the client. Otherwise return a
  // generic message so internal stack traces / file paths don't leak.
  const isKnownApiError =
    e?.status >= 400 && e?.status < 600 &&
    typeof e?.message === 'string' &&
    e.message.length < 500;

  return res.status(500).json({
    error: isKnownApiError ? e.message : "Claude request failed",
  });
}

/**
 * Audit middleware — sets up an AsyncLocalStorage context BEFORE the
 * route handler runs. Every Claude API round trip inside the handler
 * records itself into the context. On `res.finish`, fire-and-forget
 * insert into wireline_audit_log so the user's flow is never blocked.
 *
 * Keyed by req.path so /api/claude/brief becomes action='claude.brief'.
 * Apply to /api/claude/* and the Claude-backed insights paths.
 */
function withAudit(actionPrefix: string) {
  return (req: any, res: any, next: any) => {
    const ctx = claudeBrain.createAuditContext();
    res.on("finish", () => {
      if (ctx.records.length === 0) return;
      if (!req?.user?.id) return;        // not authed → don't write
      if (res.statusCode >= 500) return;  // don't bill failed Claude calls
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      const action = `${actionPrefix}${subpath ? "." + subpath : ""}`;
      const rows = ctx.records.map(r => ({
        user_id: req.user.id,
        action,
        provider: r.provider,
        model: r.model,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        cache_read_tokens: r.cache_read_tokens,
        cache_create_tokens: r.cache_create_tokens,
        cost_usd: claudeBrain.estimateCost(
          {
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_input_tokens: r.cache_read_tokens,
            cache_creation_input_tokens: r.cache_create_tokens,
          },
          r.model,
        ),
        latency_ms: r.latency_ms,
        metadata: { method: req.method, path: req.path },
      }));
      const deltaUsd = rows.reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
      // Fire-and-forget; we don't want the user's flow to wait on this.
      Promise.resolve(db.from("wireline_audit_log").insert(rows))
        .then(({ error }: any) => {
          if (error) {
            log.error("Audit insert failed", { error: getErrorMessage(error) });
            return;
          }
          // After the spend is persisted, evaluate against the budget and
          // fire spend.warning / spend.exceeded webhooks if a threshold
          // crossed. Also fire-and-forget — never block the response.
          evaluateSpend(req.user.id, deltaUsd).catch((err: any) =>
            log.error("evaluateSpend exception", { error: getErrorMessage(err) }),
          );
        })
        .catch((err: any) => log.error("Audit insert exception", { error: getErrorMessage(err) }));
    });
    claudeBrain.runInAuditContext(ctx, () => next());
  };
}

// Auto-instrument every Claude path + the Claude-backed insights paths.
// /status is unauthenticated and doesn't make Claude calls — let it through.
// Otherwise: authenticate → spend hard-cap → audit context → handler.
// Hard-cap is checked BEFORE the audit context is established because
// blocked requests don't make Claude calls so they don't need auditing.
app.use("/api/claude", (req: any, res: any, next: any) => {
  if (req.path === "/status") return next();
  return authenticateUser(req, res, () =>
    enforceSpendCap(req, res, () => withAudit("claude")(req, res, next)),
  );
});
app.use(["/api/insights/topics", "/api/insights/failure-modes", "/api/insights/daily-brief"],
  withAudit("insights"),
);

// Status / health
app.get("/api/claude/status", authenticateUser, async (_req: any, res: any) => {
  res.json({
    available: claudeBrain.isClaudeAvailable(),
    model: "claude-opus-4-7",
    capabilities: [
      "brief", "qualify", "objection-drill", "cold-email",
      "persona-clone", "summarize-thread", "route-intent",
      "smart-draft", "agent-review",
    ],
  });
});

// Pre-call briefing — given a lead, deliver a tactical brief.
app.post("/api/claude/brief", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, reasonForCall, pastInteractionSummary } = req.body;
    let agentName = "Wireline Agent";
    let agentArchetype = "Receptionist";
    let knowledgeBase: string[] = [];
    let role: string | undefined;

    if (agentId) {
      const [{ data: agent }, { data: knowledge }] = await Promise.all([
        db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", agentId).eq("user_id", req.user.id),
      ]);
      if (agent) {
        agentName = agent.name;
        agentArchetype = agent.archetype;
        role = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
    }

    const result = await claudeBrain.brief({
      agentName,
      agentArchetype,
      role,
      customerName,
      customerNumber,
      reasonForCall: reasonForCall || "No specific reason provided.",
      knowledgeBase,
      pastInteractionSummary,
    });
    res.json({ brief: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Lead qualification — BANT scoring, optionally pulled from a call log.
app.post("/api/claude/qualify", authenticateUser, async (req: any, res: any) => {
  try {
    const { source, transcript, callId, threadId, agentId } = req.body;
    let actualTranscript: string = transcript;
    let metadata: Record<string, any> = {};
    let resolvedAgentId: string | undefined = agentId;

    if (!actualTranscript && callId) {
      const { data: call } = await db.from("wireline_call_logs").select("*").eq("id", callId).eq("user_id", req.user.id).single();
      actualTranscript = call?.transcript ?? call?.summary ?? "";
      metadata = { customer_number: call?.customer_number, duration_seconds: call?.duration_seconds };
      if (!resolvedAgentId && call?.agent_id) resolvedAgentId = call.agent_id;
    } else if (!actualTranscript && threadId) {
      const { data: thread } = await db.from("wireline_email_threads").select("agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
      if (!resolvedAgentId && thread?.agent_id) resolvedAgentId = thread.agent_id;
      const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
      actualTranscript = (msgs ?? []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    }

    if (!actualTranscript) {
      return res.status(400).json({ error: "No transcript provided (and no callId/threadId to fetch from)." });
    }

    let role: string | undefined;
    if (resolvedAgentId) {
      const { data: agent } = await db.from("wireline_agents").select("role").eq("id", resolvedAgentId).eq("user_id", req.user.id).single();
      if (agent) role = agent.role || DEFAULT_AGENT_ROLE;
    }

    const result = await claudeBrain.qualify({
      source: source ?? "voice_call",
      transcript: actualTranscript,
      metadata,
      role,
    });
    res.json({ qualification: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Objection drills — practice scenarios for an agent.
app.post("/api/claude/objection-drill", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, topic, count } = req.body;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    let role: string | undefined;
    if (agentId) {
      const { data: agent } = await db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) { agentName = agent.name; archetype = agent.archetype; role = agent.role || DEFAULT_AGENT_ROLE; }
    }
    const result = await claudeBrain.objectionDrill({
      agentName, archetype, role,
      topic: topic || "general sales objections",
      count: count ?? 5,
    });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Cold-email composer.
app.post("/api/claude/cold-email", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, ...rest } = req.body ?? {};
    let agentRole: string | undefined = rest.agentRole;
    if (agentId && !agentRole) {
      const { data: agent } = await db.from("wireline_agents").select("role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) agentRole = agent.role || DEFAULT_AGENT_ROLE;
    }
    const result = await claudeBrain.coldEmail({ ...rest, agentRole });
    res.json({ email: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Persona cloning.
app.post("/api/claude/persona-clone", authenticateUser, async (req: any, res: any) => {
  try {
    const { description, samples, agentId, applyToAgent } = req.body;
    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: "Provide at least one sample message." });
    }
    const result = await claudeBrain.personaClone({
      description: description || "Unknown persona",
      samples,
    });

    if (applyToAgent && agentId) {
      // Verify ownership before applying.
      const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) {
        await db.from("wireline_personality").upsert({
          agent_id: agentId,
          user_id: req.user.id,
          content: result.persona_block,
        });
      }
    }
    res.json({ persona: result, applied: !!(applyToAgent && agentId) });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Email-thread summarizer.
app.post("/api/claude/summarize-thread", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });
    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
    const result = await claudeBrain.threadSummary({
      subject: thread.subject || "(no subject)",
      messages: (msgs ?? []) as any,
    });
    res.json({ summary: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Fast intent routing.
app.post("/api/claude/route-intent", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await claudeBrain.routeIntent({ text: req.body.text || "" });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Smart email draft (the better drop-in for the Gemini draft endpoint).
app.post("/api/claude/email-draft", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId, agentId, userInstructions } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject, agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const targetAgentId = agentId || thread.agent_id;
    let agentName = "Wireline Agent";
    let agentTone = "Professional";
    let agentRole: string | undefined;
    let agentSignature = "";
    let knowledgeBase: string[] = [];
    let directives: string[] = [];

    if (targetAgentId) {
      const [{ data: agent }, { data: knowledge }, { data: directiveRows }] = await Promise.all([
        db.from("wireline_agents").select("name, email_agent_tone, email_signature, role").eq("id", targetAgentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id),
        db.from("wireline_directives").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).order("priority", { ascending: false }),
      ]);
      if (agent) {
        agentName = agent.name;
        agentTone = agent.email_agent_tone || "Professional";
        agentSignature = agent.email_signature || "";
        agentRole = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
      directives = (directiveRows ?? []).map((d: any) => d.content);
    }

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });

    const result = await claudeBrain.smartDraft({
      agentName, agentTone, agentRole, agentSignature,
      knowledgeBase, directives,
      threadSubject: thread.subject || "(no subject)",
      threadMessages: (msgs ?? []) as any,
      userInstructions,
    });

    res.json({
      draft: result.draft,
      diagnostics: { cacheRead: result.cacheRead, cacheCreate: result.cacheCreate },
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Quick reply suggestions — 3 ready-to-send short options for a thread.
app.post("/api/claude/email-quick-replies", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId, agentId } = req.body;
    if (!threadId) return res.status(400).json({ error: "threadId required" });

    const { data: thread } = await db.from("wireline_email_threads").select("subject, agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const targetAgentId = agentId || thread.agent_id;
    let agentName = "Wireline Agent";
    let agentTone = "Professional";
    let agentRole: string | undefined;
    let agentSignature = "";
    let knowledgeBase: string[] = [];

    if (targetAgentId) {
      const [{ data: agent }, { data: knowledge }] = await Promise.all([
        db.from("wireline_agents").select("name, email_agent_tone, email_signature, role").eq("id", targetAgentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).limit(20),
      ]);
      if (agent) {
        agentName = agent.name;
        agentTone = agent.email_agent_tone || "Professional";
        agentSignature = agent.email_signature || "";
        agentRole = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
    }

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true }).limit(12);

    const result = await claudeBrain.quickReplies({
      agentName, agentTone, agentRole, agentSignature,
      knowledgeBase,
      threadSubject: thread.subject || "(no subject)",
      threadMessages: (msgs ?? []) as any,
    });

    res.json({ suggestions: result.suggestions });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Deep agent performance review.
app.post("/api/claude/agent-review", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, lookback } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const { data: agent } = await db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const { data: logs } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("agent_id", agentId)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(lookback ?? 15, 30));
    if (!logs || logs.length === 0) {
      return res.status(400).json({ error: "Insufficient data — need at least 1 completed call.", code: "NO_DATA" });
    }
    const result = await claudeBrain.agentReview({
      agentName: agent.name,
      archetype: agent.archetype,
      role: agent.role || DEFAULT_AGENT_ROLE,
      callLogs: logs as any,
    });
    res.json({ review: result, lookback: logs.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Call Playbook Builder — generates a complete role+scenario call script.
// Returns opening hook, discovery questions, objection handlers, closings, and a voicemail.
app.post("/api/claude/call-playbook", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, scenario } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    if (!scenario?.trim()) return res.status(400).json({ error: "scenario required" });

    const [{ data: agent }, { data: knowledgeRows }, { data: directiveRows }, { data: settings }] = await Promise.all([
      db.from("wireline_agents").select("name, role").eq("id", agentId).eq("user_id", req.user.id).single(),
      db.from("wireline_knowledge").select("content").eq("agent_id", agentId).eq("user_id", req.user.id).limit(20),
      db.from("wireline_directives").select("content").eq("agent_id", agentId).eq("user_id", req.user.id).order("priority", { ascending: false }).limit(10),
      db.from("wireline_settings").select("company_name").eq("user_id", req.user.id).maybeSingle(),
    ]);
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const playbook = await claudeBrain.buildCallPlaybook({
      agentName: agent.name,
      agentRole: agent.role || DEFAULT_AGENT_ROLE,
      scenario: scenario.trim(),
      knowledgeBase: (knowledgeRows ?? []).map((k: any) => k.content),
      directives: (directiveRows ?? []).map((d: any) => d.content),
      companyName: (settings as any)?.company_name || undefined,
    });

    res.json({ playbook });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Promote a Claude-suggested directive into the agent's directive table.
app.post("/api/claude/agent-review/apply-directive", authenticateUser, async (req: any, res: any) => {
  try {
    // Validate directive input
    const validation = parseFormData(DirectiveSchema, {
      content: req.body.directive
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }

    const { agentId, priority } = req.body;
    const { content: directive } = validation.data;
    const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const priorityMap: Record<string, number> = { critical: 10, high: 7, medium: 5, low: 3 };
    await db.from("wireline_directives").insert({
      agent_id: agentId,
      user_id: req.user.id,
      content: directive,
      priority: priorityMap[priority] ?? 5,
    });
    res.json({ success: true });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  OUTBOUND WEBHOOKS — push events to Slack / CRM / Zapier / n8n / etc.
//
//  Subscribed events:
//    call.completed       — every voice call after post-call enrichment
//    call.escalated       — any call where intent_label === 'escalation'
//    lead.hot             — when lead_score >= 70
//    email.received       — every successfully-synced inbound email
//    appointment.booked   — every booking insert
//    task.created         — every fleet_task insert
//    compliance.flagged   — every compliance_review task created
//
//  Each delivery includes:
//    POST <url>
//    Headers:
//      Content-Type: application/json
//      X-Wireline-Event: <event>
//      X-Wireline-Signature: sha256=<hex hmac of body using webhook.secret>
//      X-Wireline-Delivery: <random uuid>
//    Body: { event, timestamp, data }
// ──────────────────────────────────────────────────────────

app.get("/api/webhooks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from("wireline_webhooks")
      .select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ webhooks: data || [], available_events: WEBHOOK_EVENTS });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load webhooks" }); }
});

app.post("/api/webhooks", authenticateUser, async (req: any, res: any) => {
  try {
    const { name, url, events, secret, active } = req.body;
    if (!name || !url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "name, url, and events[] required." });
    }
    try { new URL(url); } catch { return res.status(400).json({ error: "Invalid URL." }); }
    const bad = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (bad.length) return res.status(400).json({ error: `Unknown events: ${bad.join(", ")}` });

    const { data, error } = await db.from("wireline_webhooks").insert({
      user_id: req.user.id, name, url, events, secret: secret || null, active: active ?? true,
    }).select().single();
    if (error) throw error;
    res.json({ webhook: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create webhook" }); }
});

app.patch("/api/webhooks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const patch: any = {};
    for (const k of ["name", "url", "events", "secret", "active"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.url) { try { new URL(patch.url); } catch { return res.status(400).json({ error: "Invalid URL." }); } }
    if (patch.events) {
      if (!Array.isArray(patch.events) || patch.events.some((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
        return res.status(400).json({ error: "Invalid events." });
      }
    }
    const { data, error } = await db.from("wireline_webhooks").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id).select().single();
    if (error) throw error;
    res.json({ webhook: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update" }); }
});

app.delete("/api/webhooks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from("wireline_webhooks").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete" }); }
});

app.post("/api/webhooks/:id/test", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: hook } = await db.from("wireline_webhooks").select("*").eq("id", req.params.id).eq("user_id", req.user.id).single();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    await dispatchWebhook(req.user.id, "task.created", {
      test: true, message: "This is a test ping from Wireline.", at: new Date().toISOString(),
    });
    res.json({ success: true, message: "Test dispatched. Check the URL." });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Test failed" }); }
});

// Per-hook delivery history — newest first. Operators use this to
// audit deliveries, see why an integration is silent, and manually
// retry failed/dead deliveries.
app.get("/api/webhooks/:id/deliveries", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
    // Verify ownership before reading deliveries (RLS guards too, but
    // returning a clean 404 is friendlier than an empty list).
    const { data: hook } = await db.from("wireline_webhooks")
      .select("id").eq("id", req.params.id).eq("user_id", req.user.id).maybeSingle();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    const { data, error } = await db.from("wireline_webhook_deliveries")
      .select("id, event, attempts, max_attempts, status, last_status_code, last_error, next_attempt_at, delivered_at, created_at")
      .eq("webhook_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ deliveries: data || [] });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load deliveries" }); }
});

// Manually requeue a delivery — clears terminal state and runs an
// attempt right away. Useful after a downstream outage is fixed.
app.post("/api/webhooks/deliveries/:id/retry", authenticateUser, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    const { data: row } = await db.from("wireline_webhook_deliveries")
      .select("id, user_id, status").eq("id", id).maybeSingle();
    if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: "Delivery not found." });
    await db.from("wireline_webhook_deliveries").update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      last_status_code: null,
    }).eq("id", id);
    // Fire-and-forget — the inline attempt happens in the background.
    attemptWebhookDelivery(id).catch((err) =>
      log.warn("webhook delivery attempt failed", { delivery_id: id, error: (err as any)?.message || String(err) })
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Retry failed" }); }
});

app.delete("/api/webhooks/deliveries/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    await db.from("wireline_webhook_deliveries")
      .delete().eq("id", id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Discard failed" }); }
});

// ──────────────────────────────────────────────────────────
//  INBOUND LEAD INTAKE — public POST endpoint authenticated by a
//  per-user API key (X-Wireline-Key: wlk_…). Lets external systems
//  (Webflow forms, CRMs, Zapier, custom intake) push leads into
//  Wireline. Inserts into wireline_outbound_leads with
//  source='inbound' so the existing dialer + triage surfaces pick
//  them up for free, then fires a lead.received webhook event.
//
//    POST /api/intake/lead
//    Headers:
//      Content-Type: application/json
//      X-Wireline-Key: wlk_<24+ chars>
//    Body:
//      {
//        "customer_name": "Jane Doe",          // optional
//        "customer_number": "+15551234567",    // required (or "phone")
//        "context": "Filled out demo form",    // optional
//        "metadata": { "utm_source": "..." }   // optional, free-form
//      }
//    Returns: { ok: true, lead_id: <bigint> }
// ──────────────────────────────────────────────────────────

const INTAKE_KEY_PREFIX = "wlk_";

async function sha256Hex(value: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function generateIntakeKey(): Promise<{ plaintext: string; prefix: string; hash: string }> {
  const crypto = await import("node:crypto");
  // 32 bytes → 43-char base64url-ish; strip non-alphanumeric for cleanliness.
  const raw = crypto.randomBytes(32).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 36);
  const plaintext = `${INTAKE_KEY_PREFIX}${raw}`;
  const prefix = plaintext.slice(0, 12);
  const hash = await sha256Hex(plaintext);
  return { plaintext, prefix, hash };
}

// Lookup an intake key, return the row (with user_id) or null.
async function resolveIntakeKey(provided: string | undefined): Promise<any | null> {
  if (!provided || typeof provided !== "string" || !provided.startsWith(INTAKE_KEY_PREFIX)) return null;
  const hash = await sha256Hex(provided.trim());
  const { data } = await db.from("wireline_intake_keys")
    .select("id, user_id, name, default_agent_id, active, use_count, auto_dial")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data;
}

// Per-key in-memory rate limit. Public endpoint, so a single noisy
// caller can't drain the operator's Vapi spend or hammer Supabase.
// Rolling window: ≤ 60 requests per 60s per intake key.
const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;
const intakeRateBuckets = new Map<string, number[]>();

function checkIntakeRate(keyId: string): { ok: boolean; retry_after_s?: number } {
  const now = Date.now();
  const cutoff = now - INTAKE_RATE_WINDOW_MS;
  const hits = (intakeRateBuckets.get(keyId) || []).filter(t => t > cutoff);
  if (hits.length >= INTAKE_RATE_MAX) {
    const retryAfter = Math.max(1, Math.ceil((hits[0] + INTAKE_RATE_WINDOW_MS - now) / 1000));
    intakeRateBuckets.set(keyId, hits);
    return { ok: false, retry_after_s: retryAfter };
  }
  hits.push(now);
  intakeRateBuckets.set(keyId, hits);
  return { ok: true };
}

// Purge stale buckets every 5 min (matches the Claude rate-limit pattern).
setInterval(() => {
  const cutoff = Date.now() - INTAKE_RATE_WINDOW_MS * 2;
  for (const [k, hits] of intakeRateBuckets) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) intakeRateBuckets.delete(k);
    else intakeRateBuckets.set(k, fresh);
  }
}, 5 * 60 * 1000).unref?.();

// Public — no Supabase JWT. Authenticated by X-Wireline-Key header.
//
// Optional Idempotency-Key header — same key + same operator returns
// the original lead_id with idempotent_replay: true. Unique partial
// index on (user_id, idempotency_key) enforces this in Postgres.
//
// auto_dial — when set on the intake key AND a default_agent_id is
// available (or one was provided in the body), we kick off an outbound
// Vapi call right after the lead is recorded. Fire-and-forget so the
// HTTP response stays fast.
// Single-lead processor — shared between /api/intake/lead and the
// bulk variant. Returns a structured result so the bulk endpoint can
// aggregate per-lead success / failure without partial-failure
// rolling back the rest of the batch.
type IntakeLeadInput = {
  customer_number?: string;
  phone?: string;
  phone_number?: string;
  customer_name?: string;
  name?: string;
  context?: string;
  message?: string;
  metadata?: any;
  agent_id?: string;
  idempotency_key?: string;
};

type IntakeLeadResult = {
  ok: boolean;
  lead_id?: number;
  status?: string;
  call_id?: string | null;
  idempotent_replay?: boolean;
  auto_dial_initiated?: boolean;
  error?: string;
  code?: string;
};

async function processIntakeLead(key: any, input: IntakeLeadInput, idemHeaderOverride?: string | null): Promise<IntakeLeadResult> {
  const customer_number = (input.customer_number || input.phone || input.phone_number || "").toString().trim();
  if (!customer_number) {
    return { ok: false, error: "customer_number (or phone) is required.", code: "MISSING_NUMBER" };
  }

  // Lenient E.164 validation: strip common separators then check for 7–20 digits
  // with an optional leading +. Intentionally not enforcing strict E.164 length
  // to accommodate pre-normalised numbers from operators; rejects non-phone strings
  // (SQL injection attempts, etc.).
  const PHONE_RE = /^\+?[0-9]{7,20}$/;
  const phoneClean = customer_number.replace(/[\s\-().]/g, "");
  if (!PHONE_RE.test(phoneClean)) {
    return { ok: false, error: "customer_number must be a valid phone number (7–20 digits, optional leading +).", code: "INVALID_NUMBER" };
  }

  const customer_name = (input.customer_name || input.name || "").toString().slice(0, 200);
  const context = (input.context || input.message || "").toString().slice(0, 4000);
  // Sanitise metadata: only plain objects, max 50 keys, values coerced to strings
  // if needed to prevent oversized blobs from reaching Supabase.
  let metadata: Record<string, unknown> | null = null;
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    const entries = Object.entries(input.metadata as Record<string, unknown>).slice(0, 50);
    metadata = Object.fromEntries(entries.map(([k, v]) => [String(k).slice(0, 100), v]));
  }
  const agent_id = input.agent_id || key.default_agent_id || null;
  const idemKey = (idemHeaderOverride !== undefined ? idemHeaderOverride : (input.idempotency_key || null));
  const idemKeyTrimmed = idemKey ? String(idemKey).trim().slice(0, 255) : null;

  if (idemKeyTrimmed) {
    const { data: existing } = await db.from("wireline_outbound_leads")
      .select("id, call_id, status")
      .eq("user_id", key.user_id)
      .eq("idempotency_key", idemKeyTrimmed)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        lead_id: existing.id,
        idempotent_replay: true,
        status: existing.status,
        call_id: existing.call_id,
        auto_dial_initiated: false,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await db.from("wireline_outbound_leads").insert({
    user_id: key.user_id,
    agent_id,
    customer_name: customer_name || null,
    customer_number,
    phone_number: customer_number,
    context: context || null,
    status: "Pending",
    source: "inbound",
    metadata,
    received_at: nowIso,
    idempotency_key: idemKeyTrimmed,
  }).select("id").single();

  if (error) {
    if (idemKeyTrimmed && (error.code === "23505" || /duplicate key/i.test(error.message || ""))) {
      const { data: replay } = await db.from("wireline_outbound_leads")
        .select("id, call_id, status")
        .eq("user_id", key.user_id)
        .eq("idempotency_key", idemKeyTrimmed)
        .maybeSingle();
      if (replay) {
        return {
          ok: true,
          lead_id: replay.id,
          idempotent_replay: true,
          status: replay.status,
          call_id: replay.call_id,
          auto_dial_initiated: false,
        };
      }
    }
    return { ok: false, error: error.message || "DB insert failed", code: "INSERT_FAILED" };
  }

  // Fan out to operator's outbound webhooks.
  dispatchWebhook(key.user_id, "lead.received", {
    lead_id: inserted?.id,
    customer_name: customer_name || null,
    customer_number,
    context: context || null,
    metadata,
    agent_id,
    intake_key: { id: key.id, name: key.name },
    auto_dial: !!key.auto_dial && !!agent_id,
    at: nowIso,
  }).catch((err) =>
    log.warn("lead.received webhook dispatch failed", {
      user_id: key.user_id,
      error: (err as any)?.message || String(err),
    })
  );

  let auto_dial_initiated = false;
  if (key.auto_dial && agent_id && inserted?.id) {
    auto_dial_initiated = true;
    (async () => {
      try {
        const result = await placeOutboundCall({
          userId: key.user_id,
          agentId: agent_id,
          customerName: customer_name || null,
          customerNumber: customer_number,
          context: context || `Inbound lead via ${key.name}`,
        });
        if (result.ok) {
          await db.from("wireline_outbound_leads").update({
            call_id: result.callId,
            status: "Dialing",
            last_called_at: new Date().toISOString(),
          }).eq("id", inserted.id);
        } else {
          await db.from("wireline_outbound_leads").update({
            status: "AutoDialFailed",
            metadata: { ...(metadata || {}), auto_dial_error: result.error, auto_dial_status: result.status },
          }).eq("id", inserted.id);
          log.warn("Auto-dial failed for lead", { leadId: inserted.id, status: result.status, error: result.error });
        }
      } catch (err: any) {
        await db.from("wireline_outbound_leads").update({
          status: "AutoDialFailed",
          metadata: { ...(metadata || {}), auto_dial_error: getErrorMessage(err) },
        }).eq("id", inserted.id);
        log.warn("Auto-dial threw for lead", { leadId: inserted.id, error: getErrorMessage(err) });
      }
    })();
  }

  return {
    ok: true,
    lead_id: inserted?.id,
    idempotent_replay: false,
    auto_dial_initiated,
  };
}

app.post("/api/intake/lead", async (req: any, res: any) => {
  try {
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) return res.status(401).json({ error: "Invalid or missing X-Wireline-Key." });

    const rate = checkIntakeRate(key.id);
    if (!rate.ok) {
      res.set("Retry-After", String(rate.retry_after_s));
      return res.status(429).json({
        error: `Rate limit exceeded for this intake key (${INTAKE_RATE_MAX}/min). Retry in ${rate.retry_after_s}s.`,
        code: "INTAKE_RATE_LIMIT",
        retry_after_s: rate.retry_after_s,
      });
    }

    const idemHeader = (req.headers["idempotency-key"] as string | undefined)?.toString().trim() || null;
    const result = await processIntakeLead(key, req.body || {}, idemHeader);

    if (result.ok) {
      // Bump usage stats fire-and-forget — only on real (not replayed) inserts.
      if (!result.idempotent_replay) {
        const nowIso = new Date().toISOString();
        db.from("wireline_intake_keys").update({
          last_used_at: nowIso,
          use_count: (key.use_count || 0) + 1,
        }).eq("id", key.id).then(() => {}, () => {});
      }
      return res.json(result);
    }
    const status = result.code === "MISSING_NUMBER" ? 400 : 500;
    return res.status(status).json({ error: result.error, code: result.code });
  } catch (e: any) {
    log.error("Intake lead failed", { error: e?.message || String(e) });
    res.status(500).json({ error: e?.message ?? "Intake failed" });
  }
});

// Bulk intake — accept up to BULK_MAX leads per request. Each lead
// counts as one rate-limit hit; if the batch would exceed the
// per-key bucket, the whole request is rejected with 429 (so the
// caller can split it sensibly rather than getting partial success).
//
// Per-lead idempotency_key in the body is supported (the request-level
// Idempotency-Key header is intentionally ignored here — wouldn't make
// sense to apply one key to a batch of distinct leads).
const INTAKE_BULK_MAX = 100;

app.post("/api/intake/leads", async (req: any, res: any) => {
  try {
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) return res.status(401).json({ error: "Invalid or missing X-Wireline-Key." });

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leads || leads.length === 0) {
      return res.status(400).json({ error: "leads must be a non-empty array.", code: "EMPTY_BATCH" });
    }
    if (leads.length > INTAKE_BULK_MAX) {
      return res.status(400).json({
        error: `Batch too large. Max ${INTAKE_BULK_MAX} leads per request.`,
        code: "BATCH_TOO_LARGE",
        max: INTAKE_BULK_MAX,
      });
    }

    // Reserve N slots in the rate bucket up front; reject the whole
    // batch if any slot would overflow so the caller can chunk.
    for (let i = 0; i < leads.length; i++) {
      const r = checkIntakeRate(key.id);
      if (!r.ok) {
        res.set("Retry-After", String(r.retry_after_s));
        return res.status(429).json({
          error: `Rate limit would be exceeded by this batch (${INTAKE_RATE_MAX}/min). Retry in ${r.retry_after_s}s.`,
          code: "INTAKE_RATE_LIMIT",
          retry_after_s: r.retry_after_s,
          accepted_so_far: i,
        });
      }
    }

    // Process leads concurrently. Per-lead errors are captured into
    // the results array so a single bad row doesn't fail the rest.
    const results = await Promise.all(
      (leads as IntakeLeadInput[]).map((lead) => processIntakeLead(key, lead).catch((err: any) => ({
        ok: false,
        error: getErrorMessage(err),
        code: "PROCESS_FAILED",
      } as IntakeLeadResult))),
    );

    const successes = results.filter(r => r.ok).length;
    if (successes > 0) {
      const nowIso = new Date().toISOString();
      db.from("wireline_intake_keys").update({
        last_used_at: nowIso,
        use_count: (key.use_count || 0) + successes,
      }).eq("id", key.id).then(() => {}, () => {});
    }

    res.json({
      ok: true,
      count: leads.length,
      success_count: successes,
      failure_count: leads.length - successes,
      results,
    });
  } catch (e: any) {
    log.error("Bulk intake failed", { error: e?.message || String(e) });
    res.status(500).json({ error: e?.message ?? "Bulk intake failed" });
  }
});

// Per-user CRUD on intake keys. Plaintext is returned ONLY at create
// time; subsequent reads expose the prefix only.
app.get("/api/intake/keys", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from("wireline_intake_keys")
      .select("id, name, key_prefix, default_agent_id, auto_dial, active, last_used_at, use_count, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load keys" }); }
});

app.post("/api/intake/keys", authenticateUser, async (req: any, res: any) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const default_agent_id = req.body?.default_agent_id || null;
    const auto_dial = !!req.body?.auto_dial;

    const { plaintext, prefix, hash } = await generateIntakeKey();
    const { data, error } = await db.from("wireline_intake_keys").insert({
      user_id: req.user.id,
      name: name.slice(0, 80),
      key_prefix: prefix,
      key_hash: hash,
      default_agent_id,
      auto_dial,
      active: true,
    }).select("id, name, key_prefix, default_agent_id, auto_dial, active, created_at").single();
    if (error) throw error;
    // Plaintext is returned ONCE — we never store or expose it again.
    res.json({ key: data, plaintext });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create key" }); }
});

app.patch("/api/intake/keys/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const patch: any = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 80);
    if (req.body?.active !== undefined) patch.active = !!req.body.active;
    if (req.body?.default_agent_id !== undefined) patch.default_agent_id = req.body.default_agent_id || null;
    if (req.body?.auto_dial !== undefined) patch.auto_dial = !!req.body.auto_dial;
    const { data, error } = await db.from("wireline_intake_keys").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id)
      .select("id, name, key_prefix, default_agent_id, auto_dial, active, last_used_at, use_count, created_at").single();
    if (error) throw error;
    res.json({ key: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update key" }); }
});

app.delete("/api/intake/keys/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from("wireline_intake_keys").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete key" }); }
});

// ──────────────────────────────────────────────────────────
//  SCHEDULED DAILY BRIEF — emails Claude's morning brief to the
//  operator at a configured UTC time via their connected Gmail.
//  - Background scheduler ticks every 5 minutes; sends to any user
//    whose daily_brief_send_at has elapsed today and who hasn't
//    been sent for the current UTC date yet.
//  - HTML email rendered server-side (no inline images, just well-
//    structured semantic HTML for max client compatibility).
//  - Per-send error stored on settings.daily_brief_last_error so
//    the operator can see why if delivery is silent.
// ──────────────────────────────────────────────────────────

function buildOAuthClient() {
  // Token refresh doesn't require an accurate redirect_uri — Google
  // only validates redirect on the auth-code exchange. Pass APP_URL
  // when set so any token-server callbacks have a sane URL anyway.
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.APP_URL ? `${process.env.APP_URL}/api/oauth/google/callback` : undefined,
  );
}

function escapeHtml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDailyBriefEmail(payload: any, opts: { dateLabel: string; appUrl?: string | null }): { subject: string; html: string; text: string } {
  const brief = payload?.brief || {};
  const stats = payload?.stats_yesterday || {};
  const delta = payload?.week_delta || {};
  const headline = brief.headline || "Your daily brief";
  const mood = brief.mood || "neutral";
  const highlights: string[] = brief.highlights || [];
  const concerns: string[] = brief.concerns || [];
  const actions: string[] = brief.action_items || [];

  const moodColor = mood === "positive" ? "#10b981" : mood === "concerning" ? "#f43f5e" : "#7DF9FF";
  const fmtPct = (n: any) => {
    const v = Number(n || 0);
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(0)}%`;
  };
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/+$/, "")}/` : null;

  const subject = `Wireline · ${escapeHtml(headline)} · ${opts.dateLabel}`;

  const css = `
    body { margin:0; padding:0; background:#0F0E2D; color:#EEF1F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .wrap { max-width:640px; margin:0 auto; padding:32px 16px; }
    .card { background:#191734; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:28px; margin-bottom:16px; }
    .label { font-size:10px; letter-spacing:0.4em; text-transform:uppercase; color:#8E91A8; margin:0 0 12px; }
    h1 { font-size:28px; line-height:1.15; margin:0 0 8px; color:#fff; font-weight:600; letter-spacing:-0.01em; }
    h2 { font-size:13px; letter-spacing:0.3em; text-transform:uppercase; color:${moodColor}; margin:0 0 16px; }
    p { color:rgba(238,241,248,0.8); line-height:1.55; margin:0 0 12px; font-size:14px; }
    .stats { display:table; width:100%; border-collapse:separate; border-spacing:8px 0; margin-top:8px; }
    .stat { display:table-cell; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:14px; text-align:center; vertical-align:top; }
    .stat .v { font-size:22px; font-weight:600; color:#fff; line-height:1; }
    .stat .l { font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:#8E91A8; margin-top:8px; }
    .delta-pos { color:#4DFFC4; }
    .delta-neg { color:#FF6BD9; }
    ul { padding:0; margin:0; list-style:none; }
    li { background:rgba(255,255,255,0.03); border-left:3px solid ${moodColor}; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:14px; line-height:1.5; color:rgba(238,241,248,0.9); }
    li.warn { border-left-color:#FFC07D; }
    li.action { border-left-color:#7DF9FF; }
    .footer { text-align:center; color:#8E91A8; font-size:11px; padding:16px 0; }
    .btn { display:inline-block; padding:10px 18px; border-radius:999px; background:linear-gradient(135deg,#7DF9FF,#C58BFF); color:#0F0E2D !important; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:0.05em; }
  `;

  const stat = (label: string, value: string, delta?: number | null) => `
    <div class="stat">
      <div class="v">${escapeHtml(value)}</div>
      <div class="l">${escapeHtml(label)}</div>
      ${delta !== undefined && delta !== null && Math.abs(delta) >= 1
        ? `<div class="${delta >= 0 ? "delta-pos" : "delta-neg"}" style="font-size:11px;margin-top:6px;">${fmtPct(delta)} vs 7-day</div>`
        : ""}
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${css}</style></head><body>
    <div class="wrap">
      <div class="card">
        <p class="label">Wireline · Daily Brief · ${escapeHtml(opts.dateLabel)}</p>
        <h2>${escapeHtml(mood)}</h2>
        <h1>${escapeHtml(headline)}</h1>
        <div class="stats" role="presentation">
          ${stat("Calls", String(stats.total_calls ?? 0), delta.calls_pct)}
          ${stat("Lead Score", String(stats.avg_lead_score ?? 0), delta.score_pct)}
          ${stat("Cost", `$${Number(stats.cost ?? 0).toFixed(2)}`, delta.cost_pct)}
          ${stat("Booked", String(stats.appointments_booked ?? 0))}
        </div>
      </div>
      ${highlights.length ? `
      <div class="card">
        <p class="label">Highlights</p>
        <ul>${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${concerns.length ? `
      <div class="card">
        <p class="label">Concerns</p>
        <ul>${concerns.map(h => `<li class="warn">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${actions.length ? `
      <div class="card">
        <p class="label">Action Items</p>
        <ul>${actions.map(h => `<li class="action">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${link ? `<div style="text-align:center; padding:12px 0 32px;"><a class="btn" href="${escapeHtml(link)}">Open Wireline</a></div>` : ""}
      <div class="footer">Sent automatically from your scheduled daily brief. Pause anytime in <strong>Command Atlas → Daily Brief</strong>.</div>
    </div>
  </body></html>`;

  // Plain-text fallback for clients that don't render HTML.
  const lines: string[] = [];
  lines.push(`WIRELINE · Daily Brief · ${opts.dateLabel}`);
  lines.push(`Mood: ${mood}`);
  lines.push("");
  lines.push(headline);
  lines.push("");
  lines.push(`Calls: ${stats.total_calls ?? 0}  ·  Lead Score: ${stats.avg_lead_score ?? 0}  ·  Cost: $${Number(stats.cost ?? 0).toFixed(2)}  ·  Booked: ${stats.appointments_booked ?? 0}`);
  if (highlights.length) { lines.push(""); lines.push("HIGHLIGHTS"); highlights.forEach(h => lines.push(` • ${h}`)); }
  if (concerns.length)   { lines.push(""); lines.push("CONCERNS");   concerns.forEach(h => lines.push(` ⚠ ${h}`)); }
  if (actions.length)    { lines.push(""); lines.push("ACTIONS");    actions.forEach(h => lines.push(` → ${h}`)); }
  if (link) { lines.push(""); lines.push(`Open Wireline: ${link}`); }
  return { subject, html, text: lines.join("\n") };
}

async function sendDailyBriefEmail(userId: string, opts?: { force?: boolean }) {
  // Pull settings + the operator's connected Gmail account.
  const [{ data: settings }, { data: accounts }] = await Promise.all([
    db.from("wireline_settings").select("daily_brief_recipient, daily_brief_enabled").eq("user_id", userId).maybeSingle(),
    db.from("wireline_email_accounts").select("access_token, refresh_token, expires_at, email_address").eq("user_id", userId).limit(1),
  ]);
  const recipient = settings?.daily_brief_recipient;
  if (!recipient) throw new Error("No recipient configured (daily_brief_recipient).");
  const account: any = accounts?.[0];
  if (!account?.refresh_token) throw new Error("No connected Gmail account — connect one in Carrier Bridge first.");

  // Compute the brief (uses the per-day cache) — may throw CLAUDE_OFFLINE.
  const { payload } = await computeDailyBrief(userId, { force: opts?.force === true });
  const dateLabel = new Date().toISOString().slice(0, 10);
  const { subject, html, text } = renderDailyBriefEmail(payload, { dateLabel, appUrl: process.env.APP_URL });

  const oauth2Client = buildOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Multipart/alternative — text part first, then HTML, per RFC 2046.
  const boundary = `----wirelineboundary${Date.now().toString(36)}`;
  const messageParts = [
    `From: ${account.email_address || "me"}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
  const encoded = Buffer.from(messageParts).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

  return { recipient, subject };
}

// Scheduler — every 5 minutes, find any users whose configured time
// has elapsed today and haven't been sent yet (UTC date comparison).
// .unref() so it never blocks process exit. Re-entrancy guard so a
// slow batch doesn't overlap with itself.
const DAILY_BRIEF_TICK_MS = 5 * 60 * 1000;
let _briefSchedRunning = false;

async function processScheduledDailyBriefs() {
  if (_briefSchedRunning) return;
  _briefSchedRunning = true;
  try {
    const now = new Date();
    const utcHHMM = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    const todayUTC = now.toISOString().slice(0, 10);

    // Pull users whose send_at <= now (lex compare HH:MM works) AND
    // either never sent or last send was on an earlier UTC date.
    const { data: due } = await db.from("wireline_settings")
      .select("user_id, daily_brief_send_at, daily_brief_last_sent_at")
      .eq("daily_brief_enabled", true)
      .lte("daily_brief_send_at", utcHHMM)
      .limit(500);
    if (!due?.length) return;

    for (const row of due) {
      const lastDate = row.daily_brief_last_sent_at
        ? new Date(row.daily_brief_last_sent_at).toISOString().slice(0, 10)
        : null;
      if (lastDate === todayUTC) continue;

      try {
        await sendDailyBriefEmail(row.user_id);
        await db.from("wireline_settings").update({
          daily_brief_last_sent_at: new Date().toISOString(),
          daily_brief_last_error: null,
        }).eq("user_id", row.user_id);
      } catch (err: any) {
        // Persist the error so the operator can see why delivery failed,
        // but DON'T mark sent — we'll retry on the next tick.
        const message = getErrorMessage(err);
        await db.from("wireline_settings").update({
          daily_brief_last_error: message.slice(0, 500),
        }).eq("user_id", row.user_id);
        log.warn("Daily-brief send failed", { userId: row.user_id, error: message });
      }
    }
  } catch (err) {
    log.error("Daily-brief scheduler tick failed", { error: getErrorMessage(err) });
  } finally {
    _briefSchedRunning = false;
  }
}
setInterval(processScheduledDailyBriefs, DAILY_BRIEF_TICK_MS).unref?.();

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULED CALLBACK AUTO-DIALER
//
//  When an agent uses the schedule_callback tool, the lead is marked
//  'Callback-Scheduled' with a callback_scheduled_at timestamp.
//  This background job polls every 60s, finds due callbacks, and re-dials
//  them automatically — delivering on the promise the agent made.
// ─────────────────────────────────────────────────────────────────────────────
const CALLBACK_SCHED_INTERVAL_MS = 60_000; // 1-minute tick balances callback timing precision with DB load
/** Pause interval used while a campaign waits for its call window to open. */
const CALL_WINDOW_CHECK_INTERVAL_MS = 30_000; // 30s — short enough to resume promptly when window opens
let _callbackSchedRunning = false;

async function processScheduledCallbacks(): Promise<void> {
  if (_callbackSchedRunning) return;
  _callbackSchedRunning = true;
  try {
    const now = new Date();

    // Find leads where callback_scheduled_at is in the past and status is still Callback-Scheduled.
    // Limit to 10 per tick to avoid hammering Vapi rate limits.
    const { data: dueLeads } = await db
      .from('wireline_outbound_leads')
      .select('id, user_id, agent_id, customer_name, customer_number, last_contact_summary')
      .eq('status', 'Callback-Scheduled')
      .lte('callback_scheduled_at', now.toISOString())
      .limit(10);

    if (!dueLeads || dueLeads.length === 0) return;

    log.info("Callback scheduler: dialing due callbacks", { count: dueLeads.length });

    for (const lead of dueLeads) {
      try {
        // Atomically claim the lead by transitioning Callback-Scheduled → Dialing.
        // If another scheduler tick already claimed it, the filter will match 0
        // rows and we skip the dial to prevent double-calling.
        const { data: claimed } = await db.from('wireline_outbound_leads')
          .update({ status: 'Dialing', last_called_at: now.toISOString() })
          .eq('id', lead.id)
          .eq('status', 'Callback-Scheduled') // race guard
          .select('id');

        if (!claimed || claimed.length === 0) {
          log.info("Callback scheduler: lead already claimed — skipping", { leadId: lead.id });
          continue;
        }

        const context = lead.last_contact_summary
          ? `CALLBACK (as promised): ${lead.last_contact_summary}`
          : "This is an automatic callback as promised during our last call.";

        const result = await placeOutboundCall({
          userId: lead.user_id,
          agentId: lead.agent_id,
          customerName: lead.customer_name,
          customerNumber: lead.customer_number,
          context,
        });

        if (!result.ok) {
          // Revert to Failed so operator can see it
          await db.from('wireline_outbound_leads')
            .update({ status: 'Failed' })
            .eq('id', lead.id);
          log.warn("Callback scheduler: dial failed", { leadId: lead.id, error: result.error });
        }
      } catch (e: any) {
        log.error("Callback scheduler: lead error", { leadId: lead.id, error: e?.message });
        await db.from('wireline_outbound_leads')
          .update({ status: 'Failed' })
          .eq('id', lead.id);
      }
    }
  } catch (err: any) {
    log.error("Callback scheduler tick failed", { error: getErrorMessage(err) });
  } finally {
    _callbackSchedRunning = false;
  }
}
setInterval(processScheduledCallbacks, CALLBACK_SCHED_INTERVAL_MS).unref?.();

// ─────────────────────────────────────────────────────────────────────────────
//  STALE SIGNAL-PRESENCE PURGE
//
//  wireline_signal_presence rows are normally deleted by the status-update
//  webhook when Vapi reports call ended/completed.  If that final webhook is
//  lost (network failure, worker restart, Vapi outage) the row is orphaned
//  indefinitely.  The Live Monitor then shows a ghost "⚠ Frustrated" entry
//  that never clears, and nav-counts reports a distress call every 2 minutes.
//
//  This sweeper runs every 5 minutes and deletes any presence row whose
//  started_at is more than PRESENCE_STALE_AFTER_MS old (default: 4 h).
//  A real call lasting > 4 h is not a valid voice-AI use case, so this
//  threshold is safe.
// ─────────────────────────────────────────────────────────────────────────────
const PRESENCE_PURGE_INTERVAL_MS = 5 * 60_000;      // 5-minute purge tick
const PRESENCE_STALE_AFTER_MS    = 4 * 60 * 60_000; // 4 hours

async function purgeStalePresence(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PRESENCE_STALE_AFTER_MS).toISOString();
    const { error, count } = await db
      .from("wireline_signal_presence")
      .delete({ count: "exact" })
      .lt("started_at", cutoff);
    if (error) {
      log.warn("Stale presence purge query error", { error: error.message });
    } else if (count && count > 0) {
      log.info("Purged stale signal presence rows", { count });
    }
  } catch (err: any) {
    log.warn("Stale presence purge failed", { error: getErrorMessage(err) });
  }
}
setInterval(purgeStalePresence, PRESENCE_PURGE_INTERVAL_MS).unref?.();

// Settings: GET / PUT for the daily-brief schedule. Defaults are
// reasonable: 13:00 UTC (~9am ET / 6am PT), recipient = user's email,
// disabled until the operator opts in.
app.get("/api/daily-brief/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from("wireline_settings")
      .select("daily_brief_enabled, daily_brief_send_at, daily_brief_recipient, daily_brief_last_sent_at, daily_brief_last_error")
      .eq("user_id", req.user.id).maybeSingle();
    const { data: accounts } = await db.from("wireline_email_accounts")
      .select("email_address").eq("user_id", req.user.id).limit(1);
    res.json({
      settings: {
        enabled: !!data?.daily_brief_enabled,
        send_at: data?.daily_brief_send_at || "13:00",
        recipient: data?.daily_brief_recipient || req.user.email || null,
        last_sent_at: data?.daily_brief_last_sent_at || null,
        last_error: data?.daily_brief_last_error || null,
      },
      gmail_connected: !!accounts?.[0]?.email_address,
      gmail_address: accounts?.[0]?.email_address || null,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load settings" }); }
});

app.put("/api/daily-brief/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const enabled = req.body?.enabled === true;
    const send_at = (req.body?.send_at || "13:00").toString();
    if (!/^\d{2}:\d{2}$/.test(send_at)) return res.status(400).json({ error: "send_at must be HH:MM (UTC)." });
    const [hh, mm] = send_at.split(":").map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ error: "send_at must be a valid HH:MM." });
    const recipient = (req.body?.recipient || "").toString().trim() || null;
    if (recipient && !/^\S+@\S+\.\S+$/.test(recipient)) return res.status(400).json({ error: "recipient must be a valid email." });

    await db.from("wireline_settings").upsert({
      user_id: req.user.id,
      daily_brief_enabled: enabled,
      daily_brief_send_at: send_at,
      daily_brief_recipient: recipient,
    }, { onConflict: "user_id" });

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to save settings" }); }
});

// Send-now — operator-triggered preview email so they can confirm
// the schedule works before relying on the morning send. Doesn't
// touch daily_brief_last_sent_at so the scheduled send still fires.
app.post("/api/daily-brief/send-now", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await sendDailyBriefEmail(req.user.id, { force: true });
    res.json({ success: true, ...result });
  } catch (e: any) {
    if (e?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: e.message, code: e.code });
    res.status(500).json({ error: e?.message ?? "Send failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  AUDIT LOG — token + cost visibility for every Claude call.
// ──────────────────────────────────────────────────────────

// Aggregate spend summary — powers the AI-Spend dashboard tab.
app.get("/api/audit/summary", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows } = await db
      .from("wireline_audit_log")
      .select("action, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, cost_usd, latency_ms, created_at")
      .eq("user_id", req.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const all = rows || [];
    const num = (n: any) => Number(n || 0);

    // Totals
    const totals = all.reduce((acc: any, r: any) => {
      acc.calls += 1;
      acc.cost += num(r.cost_usd);
      acc.input += num(r.input_tokens);
      acc.output += num(r.output_tokens);
      acc.cache_read += num(r.cache_read_tokens);
      acc.cache_create += num(r.cache_create_tokens);
      return acc;
    }, { calls: 0, cost: 0, input: 0, output: 0, cache_read: 0, cache_create: 0 });

    // Cache savings — what we'd have paid if cache_read tokens were full-price input.
    // 0.10x rate means we save 0.90x the equivalent input cost.
    const inputRate = (model: string) =>
      model?.includes("haiku") ? 1 : model?.includes("sonnet") ? 3 : 5;
    const cacheSavings = all.reduce((s: number, r: any) =>
      s + (num(r.cache_read_tokens) * inputRate(r.model) * 0.90) / 1_000_000, 0);

    // By day
    const byDayMap: Record<string, { day: string; calls: number; cost: number }> = {};
    for (const r of all) {
      const day = (r.created_at || "").slice(0, 10);
      const b = byDayMap[day] ||= { day, calls: 0, cost: 0 };
      b.calls += 1;
      b.cost += num(r.cost_usd);
    }
    const byDay = Object.values(byDayMap).sort((a, b) => a.day.localeCompare(b.day));

    // By action
    const byActionMap: Record<string, { action: string; calls: number; cost: number; avg_latency_ms: number; _latencySum: number }> = {};
    for (const r of all) {
      const a = byActionMap[r.action] ||= { action: r.action, calls: 0, cost: 0, avg_latency_ms: 0, _latencySum: 0 };
      a.calls += 1;
      a.cost += num(r.cost_usd);
      a._latencySum += num(r.latency_ms);
    }
    const byAction = Object.values(byActionMap).map(a => {
      a.avg_latency_ms = Math.round(a._latencySum / Math.max(1, a.calls));
      delete (a as any)._latencySum;
      return a;
    }).sort((a, b) => b.cost - a.cost);

    // By model
    const byModelMap: Record<string, { model: string; calls: number; cost: number }> = {};
    for (const r of all) {
      const key = r.model || "unknown";
      const m = byModelMap[key] ||= { model: key, calls: 0, cost: 0 };
      m.calls += 1;
      m.cost += num(r.cost_usd);
    }
    const byModel = Object.values(byModelMap).sort((a, b) => b.cost - a.cost);

    res.json({
      window_days: days,
      totals: {
        ...totals,
        cost: Number(totals.cost.toFixed(4)),
        cache_savings_usd: Number(cacheSavings.toFixed(4)),
        avg_cost_per_call: totals.calls ? Number((totals.cost / totals.calls).toFixed(4)) : 0,
      },
      by_day: byDay.map(d => ({ ...d, cost: Number(d.cost.toFixed(4)) })),
      by_action: byAction.map(a => ({ ...a, cost: Number(a.cost.toFixed(4)) })),
      by_model: byModel.map(m => ({ ...m, cost: Number(m.cost.toFixed(4)) })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Audit summary failed" });
  }
});

// Recent audit entries — for debugging + compliance trail.
app.get("/api/audit/recent", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "100"), 500);
    const { data, error } = await db
      .from("wireline_audit_log")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Audit fetch failed" });
  }
});

// GET /api/audit/events — fetch audit events with filtering
app.get("/api/audit/events", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const {
    event_type,
    severity,
    resource_type,
    start_date,
    end_date,
    search,
    days: daysParam = "7",
    limit: limitParam = "100",
    offset: offsetParam = "0"
  } = req.query;

  // Validate and constrain numeric parameters
  const days = Math.min(Math.max(parseInt(daysParam as string), 1), 365);
  const limit = Math.min(Math.max(parseInt(limitParam as string), 1), 500);
  const offset = Math.max(parseInt(offsetParam as string), 0);

  if (isNaN(days) || isNaN(limit) || isNaN(offset)) {
    return res.status(400).json({ error: "Invalid numeric parameters" });
  }

  try {
    let query = db
      .from("wireline_audit_log")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (event_type) {
      const types = Array.isArray(event_type) ? event_type : [event_type];
      query = query.in("event_type", types);
    }
    if (severity) {
      const severities = Array.isArray(severity) ? severity : [severity];
      query = query.in("severity", severities);
    }
    if (resource_type) {
      query = query.eq("resource_type", resource_type);
    }
    if (start_date) {
      query = query.gte("created_at", start_date);
    } else if (days) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("created_at", since.toISOString());
    }
    if (end_date) {
      query = query.lte("created_at", end_date);
    }
    if (search) {
      // Escape special chars to prevent SQL injection
      const sanitized = String(search).replace(/[%_]/g, '\\$&');
      query = query.or(`action.ilike.%${sanitized}%,actor_email.ilike.%${sanitized}%,resource_id.ilike.%${sanitized}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      events: data || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (e: any) {
    log.error("Audit events error", {
      userId,
      error: String(e),
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: "Failed to fetch audit events" });
  }
});

// GET /api/audit/stats — aggregate statistics
app.get("/api/audit/stats", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const { days: daysParam = "30" } = req.query;

  // Validate and constrain numeric parameters
  const days = Math.min(Math.max(parseInt(daysParam as string), 1), 365);

  if (isNaN(days)) {
    return res.status(400).json({ error: "Invalid numeric parameters" });
  }

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await db
      .from("wireline_audit_log")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());

    if (error) throw error;

    const events = data || [];
    
    // Aggregate statistics
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalCost = 0;
    let apiCalls = 0;

    events.forEach((event: any) => {
      // Count by severity
      const sev = event.severity || 'info';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      
      // Count by type
      const type = event.event_type || event.action || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      // Sum costs
      if (event.cost_usd) {
        totalCost += parseFloat(event.cost_usd);
      }
      
      // Count API calls
      if (type.startsWith('api.')) {
        apiCalls++;
      }
    });

    res.json({
      total_events: events.length,
      by_severity: bySeverity,
      by_type: byType,
      total_cost_usd: totalCost,
      total_api_calls: apiCalls,
      period_days: days
    });
  } catch (e: any) {
    log.error("Audit stats error", {
      userId,
      error: String(e),
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: "Failed to fetch audit statistics" });
  }
});

// GET /api/audit/export — export as CSV or JSON
app.get("/api/audit/export", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const { format = "csv", days: daysParam = "30" } = req.query;

  // Validate and constrain numeric parameters
  const days = Math.min(Math.max(parseInt(daysParam as string), 1), 365);

  if (isNaN(days)) {
    return res.status(400).json({ error: "Invalid numeric parameters" });
  }

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await db
      .from("wireline_audit_log")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Log the export operation
    void auditLogger.logDataOperation('export', {
      userId,
      resourceType: 'audit_log',
      recordCount: data?.length || 0,
      ip: req.ip
    });

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.json"`);
      res.json(data);
    } else {
      // CSV format with formula injection prevention
      const events = data || [];
      const headers = [
        "created_at", "event_type", "severity", "action",
        "actor_email", "resource_type", "resource_id",
        "ip_address", "cost_usd", "latency_ms"
      ];
      
      const sanitizeCSV = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Prevent formula injection - prefix dangerous characters with single quote
        if (str.match(/^[=@+\-]/)) {
          return `"'${str.replace(/"/g, '""')}"`;
        }
        return `"${str.replace(/"/g, '""')}"`;
      };
      
      const csvRows = [headers.join(",")];
      events.forEach((event: any) => {
        const row = headers.map((h) => sanitizeCSV(event[h]));
        csvRows.push(row.join(","));
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
      res.send(csvRows.join("\n"));
    }
  } catch (e: any) {
    log.error("Audit export error", {
      userId,
      error: String(e),
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({ error: "Failed to export audit log" });
  }
});

// ──────────────────────────────────────────────────────────
//  SPEND BUDGET — monthly Claude limit, hard-cap toggle,
//  warn-threshold %. Composed with the audit log + outbound webhooks
//  to give operators a real safety net for LLM bills.
// ──────────────────────────────────────────────────────────

app.get("/api/spend/budget", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from("wireline_spend_budgets")
      .select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled, updated_at")
      .eq("user_id", req.user.id).maybeSingle();
    res.json({
      budget: data || {
        monthly_limit_usd: 0,
        hard_cap: false,
        warn_threshold_pct: 80,
        enabled: true,
        updated_at: null,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load budget" }); }
});

app.put("/api/spend/budget", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Number(req.body.monthly_limit_usd ?? 0);
    const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
    const hardCap = !!req.body.hard_cap;
    const enabled = req.body.enabled !== false;
    if (!Number.isFinite(limit) || limit < 0) return res.status(400).json({ error: "monthly_limit_usd must be a non-negative number" });
    if (!Number.isInteger(warn) || warn < 1 || warn > 99) return res.status(400).json({ error: "warn_threshold_pct must be 1–99" });

    const { data, error } = await db.from("wireline_spend_budgets")
      .upsert({
        user_id: req.user.id,
        monthly_limit_usd: limit,
        hard_cap: hardCap,
        warn_threshold_pct: warn,
        enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select().single();
    if (error) throw error;
    // Force a cache refresh so the new limit takes effect on the next request.
    budgetCache.delete(req.user.id);
    res.json({ budget: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to save budget" }); }
});

app.get("/api/spend/status", authenticateUser, async (req: any, res: any) => {
  try {
    const snap = await getBudgetSnapshot(req.user.id, true);
    const { data: alerts } = await db.from("wireline_spend_alerts")
      .select("threshold_pct, fired_at")
      .eq("user_id", req.user.id).eq("period", snap.period)
      .order("threshold_pct", { ascending: true });
    const limit = snap.budget?.monthly_limit_usd || 0;
    const pct = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
    res.json({
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: limit,
      percent_used: Number(pct.toFixed(1)),
      hard_cap: snap.budget?.hard_cap ?? false,
      enabled: snap.budget?.enabled ?? true,
      warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
      hard_capped_now: !!(snap.budget?.hard_cap && limit > 0 && snap.mtdCost >= limit),
      alerts_fired: alerts || [],
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load spend status" }); }
});

// ──────────────────────────────────────────────────────────
//  STRIPE BILLING — checkout, portal, status. Webhook handler
//  lives at module scope (above) so it can use raw-body parsing.
// ──────────────────────────────────────────────────────────

function billingBaseUrl(req: any): string {
  // Honor APP_URL when set (production). Otherwise fall back to the
  // Origin header so dev sandboxes work without env config.
  return (process.env.APP_URL || req.get("origin") || "http://localhost:3000").replace(/\/+$/, "");
}

// Public — anyone can read the catalog (renders pre-auth on the
// pricing surface in the future). No secrets are exposed.
app.get("/api/billing/plans", (_req: any, res: any) => {
  res.json({ plans: plansForClient(), stripe_configured: stripeAvailable() });
});

// Operator-facing read of their current sub.
app.get("/api/billing/status", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: sub } = await db.from("wireline_subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at")
      .eq("user_id", req.user.id).maybeSingle();
    const planMeta = sub?.plan ? planById(sub.plan) : null;
    res.json({
      stripe_configured: stripeAvailable(),
      subscription: sub ? {
        plan: sub.plan,
        plan_name: planMeta?.name || null,
        max_agents: planMeta?.max_agents || null,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        has_customer: !!sub.stripe_customer_id,
        has_subscription: !!sub.stripe_subscription_id,
        updated_at: sub.updated_at,
      } : null,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load status" }); }
});

// Start a Stripe Checkout session for a plan. Idempotent on
// stripe_customer_id — we re-use the customer across upgrades so
// invoices and payment methods carry forward.
app.post("/api/billing/checkout", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const planId = String(req.body?.plan_id || "").trim();
    const plan = planById(planId);
    if (!plan) return res.status(400).json({ error: "Unknown plan_id." });
    const priceId = process.env[plan.priceIdEnv];
    if (!priceId) return res.status(503).json({ error: `Price for plan '${plan.id}' not configured (${plan.priceIdEnv}).` });

    // Find the existing Stripe row first — we need to gate against
    // double-subscribing AND we'll re-use the customer if present.
    const { data: existing } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, plan")
      .eq("user_id", req.user.id).maybeSingle();

    // Block creating a second concurrent subscription. Stripe permits
    // multiple subs per customer unless we explicitly prevent it; our
    // wireline_subscriptions row only tracks ONE stripe_subscription_id
    // so a second checkout would silently double-charge the operator
    // and leave the second sub orphaned in Stripe. Plan changes go
    // through the Customer Portal (clean proration, single sub) — the
    // UI redirects there when an active sub already exists.
    const liveStatuses = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);
    if (existing?.stripe_subscription_id && liveStatuses.has(existing.status || "")) {
      return res.status(409).json({
        error:
          "You already have an active subscription. Use the Customer Portal to change plans " +
          "(this avoids creating a second concurrent subscription).",
        code: "ALREADY_SUBSCRIBED",
        current_plan: existing.plan,
        current_status: existing.status,
      });
    }

    // Find or create the Stripe Customer for this user.
    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { wireline_user_id: req.user.id },
      });
      customerId = customer.id;
      await db.from("wireline_subscriptions").upsert({
        user_id: req.user.id,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const base = billingBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/admin?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/admin?billing=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { wireline_user_id: req.user.id, wireline_plan: plan.id },
      },
    });
    res.json({ url: session.url });
  } catch (e: any) {
    log.error("Checkout creation failed", { error: e?.message || String(e) });
    res.status(500).json({ error: e?.message ?? "Checkout failed" });
  }
});

// Open the Stripe Customer Portal for the operator to manage their
// subscription, payment method, invoice history, and cancellation.
app.post("/api/billing/portal", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const { data: sub } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id").eq("user_id", req.user.id).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No Stripe customer for this user yet — run checkout first." });
    }
    const base = billingBaseUrl(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${base}/admin`,
    });
    res.json({ url: portal.url });
  } catch (e: any) {
    log.error("Portal session failed", { error: e?.message || String(e) });
    res.status(500).json({ error: e?.message ?? "Portal failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  CSV EXPORT — operators get their data out for compliance, analysis,
//  or migration. RFC 4180 quoting; streamed via res.send().
// ──────────────────────────────────────────────────────────

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Quote if contains delimiter, quote, or newline; escape inner quotes by doubling.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: any[], columns: string[]): string {
  const header = columns.map(csvEscape).join(",");
  if (!rows.length) return header + "\n";
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

const EXPORT_DEFS: Record<string, { table: string; columns: string[]; order: string }> = {
  calls: {
    table: "wireline_call_logs",
    columns: ["id", "vapi_call_id", "agent_id", "direction", "customer_number", "duration_seconds", "cost", "lead_score", "intent_label", "summary", "transcript", "recording_url", "created_at"],
    order: "created_at",
  },
  leads: {
    table: "wireline_outbound_leads",
    columns: ["id", "agent_id", "phone_number", "customer_number", "customer_name", "context", "status", "call_id", "last_called_at", "created_at"],
    order: "created_at",
  },
  appointments: {
    table: "wireline_appointments",
    columns: ["id", "agent_id", "call_id", "date", "time", "customer_name", "service_type", "status", "created_at"],
    order: "created_at",
  },
  tasks: {
    table: "wireline_fleet_tasks",
    columns: ["id", "task_type", "description", "status", "priority", "target_channel", "agent_id", "source_type", "source_id", "due_date", "resolution_notes", "created_at"],
    order: "created_at",
  },
};

app.get("/api/export/:type.csv", authenticateUser, async (req: any, res: any) => {
  try {
    const def = EXPORT_DEFS[req.params.type];
    if (!def) return res.status(404).json({ error: `Unknown export type. Use: ${Object.keys(EXPORT_DEFS).join(", ")}.` });

    const { data, error } = await db
      .from(def.table)
      .select(def.columns.join(","))
      .eq("user_id", req.user.id)
      .order(def.order, { ascending: false });
    if (error) throw error;

    const filename = `wireline-${req.params.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rowsToCsv(data || [], def.columns));
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Export failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  CLAUDE BRAIN — additional capability-elevating endpoints
// ──────────────────────────────────────────────────────────

// Manual re-run of the post-call analysis on an existing call.
// Useful when ANTHROPIC_API_KEY was added after some calls were already logged.
app.post("/api/claude/post-call/:callId", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: call } = await db
      .from("wireline_call_logs")
      .select("*, agent_id, user_id")
      .eq("id", req.params.callId)
      .eq("user_id", req.user.id)
      .single();
    if (!call) return res.status(404).json({ error: "Call not found." });
    const { data: agent } = await db
      .from("wireline_agents")
      .select("name, archetype, role")
      .eq("id", call.agent_id)
      .single();

    const result = await claudeBrain.postCallAnalysis({
      agentName: agent?.name || "Wireline Agent",
      archetype: agent?.archetype || "Receptionist",
      role: agent?.role || undefined,
      customerNumber: call.customer_number,
      durationSeconds: call.duration_seconds,
      summary: call.summary || "",
      transcript: call.transcript || "",
    });

    await db.from("wireline_call_logs").update({
      lead_score: result.lead_score,
      intent_label: result.intent_label,
    }).eq("id", call.id);

    res.json({ analysis: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Live call coach — given a transcript or a callId, returns coaching.
app.post("/api/claude/coach", authenticateUser, async (req: any, res: any) => {
  try {
    const { transcript: rawTranscript, callId, agentId, isLive } = req.body;
    let transcript = rawTranscript as string | undefined;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    let role: string | undefined;

    if (callId) {
      const { data: call } = await db.from("wireline_call_logs")
        .select("transcript, agent_id")
        .eq("id", callId).eq("user_id", req.user.id).single();
      if (call) {
        transcript = transcript || call.transcript;
        const { data: a } = await db.from("wireline_agents")
          .select("name, archetype, role").eq("id", call.agent_id).single();
        if (a) { agentName = a.name; archetype = a.archetype; role = a.role || undefined; }
      }
    } else if (agentId) {
      const { data: a } = await db.from("wireline_agents")
        .select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (a) { agentName = a.name; archetype = a.archetype; role = a.role || undefined; }
    }

    if (!transcript) return res.status(400).json({ error: "Provide a transcript or callId." });

    const result = await claudeBrain.coach({ agentName, archetype, role, transcript, isLive: !!isLive });
    res.json({ coaching: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge ingestion from URL — Claude fetches and extracts.
// Optional `maxPages > 1` upgrades the request from a single-page fetch
// to a same-domain crawl following nav links, capped at 25 pages.
app.post("/api/claude/knowledge-from-url", authenticateUser, async (req: any, res: any) => {
  try {
    const { url, agentContext, maxEntries, maxPages } = req.body;
    if (!url || typeof url !== "string" || url.length > 2048) {
      return res.status(400).json({ error: "url required (max 2048 chars)." });
    }
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); }
    catch { return res.status(400).json({ error: "url is not a valid URL." }); }
    // Only allow http/https — file:// or javascript: would trip Claude's
    // web_search tool with weird errors and waste an invocation.
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ error: "url must use http:// or https://" });
    }
    if (agentContext != null && (typeof agentContext !== "string" || agentContext.length > 2000)) {
      return res.status(400).json({ error: "agentContext must be a string ≤ 2000 characters." });
    }
    const safeMaxEntries = Math.max(1, Math.min(50, Number(maxEntries) || 12));
    const safeMaxPages   = Math.max(1, Math.min(20, Number(maxPages)   || 5));

    const result = await claudeBrain.knowledgeFromUrl({ url, agentContext, maxEntries: safeMaxEntries, maxPages: safeMaxPages });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge ingestion from a PDF document (Claude native PDF support).
app.post("/api/claude/knowledge-from-document", authenticateUser, async (req: any, res: any) => {
  try {
    const { pdfBase64, fileName, agentContext, maxEntries } = req.body;
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "pdfBase64 required (base64-encoded PDF, no data: prefix)." });
    }
    // Cap the encoded PDF at ~30MB raw (40MB base64). Anthropic rejects
    // documents larger than that anyway and the body parser was a soft
    // 50MB ceiling — without an explicit cap an oversized PDF would cost
    // a Claude invocation just to be rejected upstream.
    if (pdfBase64.length > 40 * 1024 * 1024) {
      return res.status(413).json({ error: "PDF exceeds 30MB limit. Split it into smaller documents." });
    }
    // Quick sanity check: PDF starts with %PDF-
    let head = "";
    try { head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5); } catch {}
    if (!head.startsWith("%PDF")) {
      return res.status(400).json({ error: "File does not look like a valid PDF." });
    }
    // Bound auxiliary inputs.
    if (fileName != null && (typeof fileName !== "string" || fileName.length > 255)) {
      return res.status(400).json({ error: "fileName must be a string ≤ 255 characters." });
    }
    if (agentContext != null && (typeof agentContext !== "string" || agentContext.length > 2000)) {
      return res.status(400).json({ error: "agentContext must be a string ≤ 2000 characters." });
    }
    const safeMaxEntries = Math.max(1, Math.min(50, Number(maxEntries) || 12));

    const result = await claudeBrain.knowledgeFromDocument({ pdfBase64, fileName, agentContext, maxEntries: safeMaxEntries });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Apply a set of extracted knowledge entries to an agent.
app.post("/api/claude/knowledge-from-url/apply", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, entries } = req.body;
    if (!agentId || !Array.isArray(entries)) {
      return res.status(400).json({ error: "agentId and entries[] required." });
    }
    const { data: agent } = await db.from("wireline_agents")
      .select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const rows = entries
      .filter((e: any) => typeof e?.fact === "string" && e.fact.trim())
      .map((e: any) => ({
        agent_id: agentId,
        user_id: req.user.id,
        content: e.fact.trim(),
      }));
    if (rows.length === 0) return res.status(400).json({ error: "No valid entries to insert." });
    await db.from("wireline_knowledge").insert(rows);
    res.json({ inserted: rows.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge dedupe — Claude pass over the operator's whole knowledge
// base to find duplicate / near-duplicate / contradictory facts.
// Auto-instrumented via the existing /api/claude/* withAudit chain,
// so the cost shows up in the AI-Spend dashboard automatically.
//
// Returns {clusters} with input ids verbatim. The UI applies operator
// decisions via the existing PATCH/DELETE /api/knowledge/:id endpoints.
const KNOWLEDGE_DEDUPE_MAX_FACTS = 400;
app.post("/api/claude/knowledge-dedupe", authenticateUser, async (req: any, res: any) => {
  try {
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for knowledge dedupe.", code: "CLAUDE_OFFLINE" });
    }
    const [{ data: rows }, { data: agents }] = await Promise.all([
      db.from("wireline_knowledge").select("id, agent_id, content").eq("user_id", req.user.id).limit(KNOWLEDGE_DEDUPE_MAX_FACTS),
      db.from("wireline_agents").select("id, name").eq("user_id", req.user.id),
    ]);
    if (!rows || rows.length < 2) {
      return res.json({ clusters: [], total_analyzed: rows?.length || 0, message: "Not enough facts to dedupe." });
    }
    const agentMap = new Map((agents || []).map((a: any) => [a.id, a.name]));
    const result = await claudeBrain.findKnowledgeDuplicates({
      facts: rows.map((r: any) => ({
        id: r.id,
        agent_name: agentMap.get(r.agent_id) || "(unknown)",
        content: r.content,
      })),
    });
    // Defensive: drop any cluster that references an id we didn't send,
    // or that doesn't have ≥ 2 valid members. Claude's tool schema
    // already enforces this but better-safe-than-sorry.
    const validIds = new Set(rows.map((r: any) => r.id));
    const safe = (result.clusters || [])
      .map((c: any) => ({
        ...c,
        members: (c.members || []).filter((m: any) => validIds.has(m.id)),
      }))
      .filter((c: any) =>
        c.members.length >= 2 &&
        validIds.has(c.recommended_keep_id) &&
        c.members.some((m: any) => m.id === c.recommended_keep_id),
      );
    res.json({
      clusters: safe,
      total_analyzed: result.total_analyzed ?? rows.length,
      truncated: rows.length === KNOWLEDGE_DEDUPE_MAX_FACTS,
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Lead enrichment — pre-call web research. Auto-instrumented via the
// /api/claude/* withAudit chain so the cost lands in AI Spend, and the
// hard-cap gate refuses the request if the operator is over budget.
app.post("/api/claude/enrich-lead", authenticateUser, async (req: any, res: any) => {
  try {
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for lead enrichment.", code: "CLAUDE_OFFLINE" });
    }
    const customer_number = (req.body?.customer_number || req.body?.phone || "").toString().trim();
    if (!customer_number) {
      return res.status(400).json({ error: "customer_number is required." });
    }
    const enrichment = await claudeBrain.enrichLead({
      customer_number,
      customer_name: (req.body?.customer_name || req.body?.name || "").toString().slice(0, 200) || null,
      context: (req.body?.context || "").toString().slice(0, 4000) || null,
      industry_hint: (req.body?.industry_hint || "").toString().slice(0, 200) || null,
    });
    res.json({ enrichment });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Agent Forge — synthesize a complete agent draft from a goal.
app.post("/api/claude/forge", authenticateUser, async (req: any, res: any) => {
  try {
    const { goal, industry, companyName, websiteUrl, voicePreference } = req.body;
    if (!goal) return res.status(400).json({ error: "goal required." });
    const result = await claudeBrain.forgeAgent({ goal, industry, companyName, websiteUrl, voicePreference });
    res.json({ design: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  INSIGHTS — business intelligence the operator actually needs
// ──────────────────────────────────────────────────────────

// Tiny in-memory cache for the Claude-powered insights. Keyed by
// (user_id, endpoint). 1-hour TTL is plenty — the underlying data
// only changes when calls land, which is sub-daily for most SMBs.
const insightCache = new Map<string, { ts: number; data: any }>();
const INSIGHT_TTL_MS = 60 * 60 * 1000;
function cachedInsight(key: string) {
  const entry = insightCache.get(key);
  return entry && Date.now() - entry.ts < INSIGHT_TTL_MS ? entry.data : null;
}
function setCachedInsight(key: string, data: any) {
  insightCache.set(key, { ts: Date.now(), data });
}

// Conversion funnel — calls → connected → qualified → booked → completed.
app.get("/api/insights/funnel", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: calls }, { data: appts }, { data: leads }] = await Promise.all([
      db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("status").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_outbound_leads").select("status").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const totalCalls = calls?.length || 0;
    const connected = (calls || []).filter((c: any) => (c.duration_seconds || 0) > 10).length;
    const qualified = (calls || []).filter((c: any) => (c.lead_score || 0) >= 50).length;
    const highIntent = (calls || []).filter((c: any) => c.intent_label === "high").length;
    const bookings = (appts || []).length;
    const completed = (appts || []).filter((a: any) => a.status === "Completed").length;
    const queuedLeads = (leads || []).filter((l: any) => l.status === "Pending" || l.status === "Queued").length;

    res.json({
      window_days: days,
      stages: [
        { name: "Queued",     count: queuedLeads },
        { name: "Calls",      count: totalCalls },
        { name: "Connected",  count: connected },
        { name: "Qualified",  count: qualified },
        { name: "High intent", count: highIntent },
        { name: "Booked",     count: bookings },
        { name: "Completed",  count: completed },
      ],
    });
  } catch (e) { claudeErr(res, e); }
});

// Hour-of-day × day-of-week heatmap of call volume + lead score.
app.get("/api/insights/heatmap", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: calls } = await db
      .from("wireline_call_logs")
      .select("created_at, lead_score")
      .eq("user_id", req.user.id)
      .gte("created_at", since);

    // 7×24 grid: counts and avg lead score
    const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
    const buckets: Record<string, { c: number; s: number }> = {};
    for (const c of calls || []) {
      const d = new Date(c.created_at);
      const key = `${d.getDay()}-${d.getHours()}`;
      const b = buckets[key] || { c: 0, s: 0 };
      b.c++;
      b.s += c.lead_score || 0;
      buckets[key] = b;
    }
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const b = buckets[`${w}-${h}`] || { c: 0, s: 0 };
        grid.push({ weekday: w, hour: h, count: b.c, avg_score: b.c ? Math.round(b.s / b.c) : 0 });
      }
    }
    res.json({ window_days: days, grid });
  } catch (e) { claudeErr(res, e); }
});

// Per-agent leaderboard.
app.get("/api/insights/leaderboard", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: agents }, { data: calls }, { data: appts }] = await Promise.all([
      db.from("wireline_agents").select("id, name, archetype, channel, role").eq("user_id", req.user.id),
      db.from("wireline_call_logs").select("agent_id, lead_score, intent_label, duration_seconds, cost").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("agent_id").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const callsByAgent: Record<string, any[]> = {};
    for (const c of calls || []) {
      const id = c.agent_id || "unknown";
      (callsByAgent[id] ||= []).push(c);
    }
    const apptsByAgent: Record<string, number> = {};
    for (const a of appts || []) apptsByAgent[a.agent_id || "unknown"] = (apptsByAgent[a.agent_id || "unknown"] || 0) + 1;

    const rows = (agents || []).map((a: any) => {
      const calls = callsByAgent[a.id] || [];
      const total = calls.length;
      const qualified = calls.filter((c) => (c.lead_score || 0) >= 50).length;
      const highIntent = calls.filter((c) => c.intent_label === "high").length;
      const minutes = Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60);
      const cost = Number(calls.reduce((s, c) => s + Number(c.cost || 0), 0).toFixed(2));
      const avgScore = total ? Math.round(calls.reduce((s, c) => s + (c.lead_score || 0), 0) / total) : 0;
      const bookings = apptsByAgent[a.id] || 0;
      const costPerQualified = qualified ? Number((cost / qualified).toFixed(2)) : 0;
      return {
        agent_id: a.id,
        agent_name: a.name,
        archetype: a.archetype,
        role: a.role || DEFAULT_AGENT_ROLE,
        channel: a.channel,
        total_calls: total,
        qualified,
        high_intent: highIntent,
        bookings,
        avg_lead_score: avgScore,
        minutes,
        cost,
        cost_per_qualified: costPerQualified,
        conversion_rate: total ? Math.round((qualified / total) * 100) : 0,
      };
    }).sort((a: any, b: any) => b.qualified - a.qualified);

    res.json({ window_days: days, agents: rows });
  } catch (e) { claudeErr(res, e); }
});

// Topic clusters (Claude-powered, cached 1h per user).
app.get("/api/insights/topics", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `topics:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for topic clustering.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, intent_label")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (!rows || rows.length < 3) {
      return res.json({ topics: [], total_analyzed: rows?.length || 0, message: "Not enough data yet — run more calls." });
    }
    const result = await claudeBrain.clusterTopics({
      summaries: rows.map((r: any) => ({ summary: r.summary || "", intent_label: r.intent_label })),
      windowDays: 14,
    });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Failure modes (Claude-powered, cached 1h per user).
app.get("/api/insights/failure-modes", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `failures:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for failure analysis.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("user_id", req.user.id)
      .or("lead_score.lt.30,intent_label.eq.low,intent_label.eq.none")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!rows || rows.length < 2) {
      return res.json({ modes: [], message: "Not enough failed calls yet — system is performing well." });
    }
    const result = await claudeBrain.clusterFailureModes({ failedCalls: rows as any });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Daily brief (Claude-powered, cached per-day).
// Shared between the HTTP endpoint and the scheduled email sender.
// Honors the same per-day cache so a manual /api/insights/daily-brief
// fetch and the morning email don't both pay Claude.
async function computeDailyBrief(userId: string, opts?: { force?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `brief:${userId}:${today}`;
  if (!opts?.force) {
    const cached = cachedInsight(cacheKey);
    if (cached) return { payload: cached, cached: true };
  }
  if (!claudeBrain.isClaudeAvailable()) {
    const err: any = new Error("Claude required for the daily brief.");
    err.code = "CLAUDE_OFFLINE";
    throw err;
  }

  const yStart = new Date(); yStart.setHours(0, 0, 0, 0); yStart.setDate(yStart.getDate() - 1);
  const yEnd   = new Date(yStart); yEnd.setDate(yEnd.getDate() + 1);
  const wStart = new Date(); wStart.setDate(wStart.getDate() - 7);

  const [{ data: yCalls }, { data: wCalls }, { data: appts }, { data: tasks }, { data: leads }, { data: wins }, { data: losses }] = await Promise.all([
    db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, cost, summary, customer_number").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_call_logs").select("lead_score, duration_seconds, cost").eq("user_id", userId).gte("created_at", wStart.toISOString()),
    db.from("wireline_appointments").select("id").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_fleet_tasks").select("priority, description").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    db.from("wireline_outbound_leads").select("id").eq("user_id", userId).eq("status", "Pending"),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).gte("lead_score", 70).order("lead_score", { ascending: false }).limit(3),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("lead_score", 30).order("created_at", { ascending: false }).limit(3),
  ]);

  const yTotal = yCalls?.length || 0;
  const yMinutes = Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
  const yAvgScore = yTotal ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / yTotal) : 0;
  const yHighIntent = (yCalls || []).filter((c: any) => c.intent_label === "high").length;
  const yCost = Number((yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));

  const wDays = 7;
  const wAvgPerDay = (wCalls?.length || 0) / wDays;
  const wAvgScore = wCalls?.length ? (wCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / wCalls.length : 0;
  const wAvgCostPerDay = (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

  const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
  const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
  const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

  const result = await claudeBrain.dailyBrief({
    yesterdayStats: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
      pending_tasks: tasks?.length || 0,
      new_leads: leads?.length || 0,
    },
    weekDelta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
    recentWinSamples: (wins || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
    recentLossSamples: (losses || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
    openTasks: (tasks || []).map((t: any) => ({ priority: t.priority, description: t.description })),
  });

  const payload = {
    brief: result,
    stats_yesterday: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
    },
    week_delta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
  };
  setCachedInsight(cacheKey, payload);
  return { payload, cached: false };
}

app.get("/api/insights/daily-brief", authenticateUser, async (req: any, res: any) => {
  try {
    const { payload, cached } = await computeDailyBrief(req.user.id, { force: req.query.refresh === "1" });
    res.json({ ...payload, cached });
  } catch (e: any) {
    if (e?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: e.message, code: e.code });
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  TRIAGE INBOX — "what needs my attention right now"
// ──────────────────────────────────────────────────────────

app.get("/api/triage", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: hotLeads }, { data: complianceTasks }, { data: pendingTasks }, { data: knowledgeGaps }, { data: escalations }] = await Promise.all([
      // Calls with high lead score from the last 7 days that don't have a follow-up logged.
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, intent_label, summary, created_at")
        .eq("user_id", req.user.id)
        .gte("lead_score", 70)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("lead_score", { ascending: false })
        .limit(30),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("task_type", "compliance_review")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("status", "pending")
        .neq("task_type", "compliance_review")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_agent_lessons")
        .select("id, agent_id, lesson, created_at")
        .eq("user_id", req.user.id)
        .like("lesson", "[KNOWLEDGE GAP]%")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, summary, created_at")
        .eq("user_id", req.user.id)
        .or("intent_label.eq.escalation")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    res.json({
      hot_leads: hotLeads || [],
      compliance: complianceTasks || [],
      pending_tasks: pendingTasks || [],
      knowledge_gaps: knowledgeGaps || [],
      escalations: escalations || [],
      counts: {
        hot_leads: hotLeads?.length || 0,
        compliance: complianceTasks?.length || 0,
        pending_tasks: pendingTasks?.length || 0,
        knowledge_gaps: knowledgeGaps?.length || 0,
        escalations: escalations?.length || 0,
      },
    });
  } catch (e) { claudeErr(res, e); }
});

// Promote a [KNOWLEDGE GAP] lesson into the agent's knowledge base.
app.post("/api/knowledge-gaps/:lessonId/promote", authenticateUser, async (req: any, res: any) => {
  try {
    const { customContent } = req.body;
    const { data: lesson } = await db
      .from("wireline_agent_lessons")
      .select("id, agent_id, lesson, user_id")
      .eq("id", req.params.lessonId)
      .eq("user_id", req.user.id)
      .single();
    if (!lesson) return res.status(404).json({ error: "Lesson not found." });

    const content =
      customContent?.trim() ||
      lesson.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "").trim();

    if (!content) return res.status(400).json({ error: "Content is empty." });

    await db.from("wireline_knowledge").insert({
      agent_id: lesson.agent_id,
      user_id: req.user.id,
      content,
    });
    await db.from("wireline_agent_lessons").delete().eq("id", lesson.id);
    res.json({ success: true });
  } catch (e) { claudeErr(res, e); }
});

// ──────────────────────────────────────────────────────────
//  CONTACT PROFILE — unified per-customer history
// ──────────────────────────────────────────────────────────

app.get("/api/contacts/:number", authenticateUser, async (req: any, res: any) => {
  try {
    const number = decodeURIComponent(req.params.number);
    // Strip non-digits then take the last 10 — gives us a normalized form.
    const norm = number.replace(/\D/g, "").slice(-10);
    if (!norm) return res.status(400).json({ error: "Invalid phone number." });

    // Match: exact, or anything ending in the same last-10-digits.
    const [{ data: calls }, { data: leads }, { data: appts }] = await Promise.all([
      db.from("wireline_call_logs")
        .select("id, agent_id, direction, customer_number, duration_seconds, cost, summary, transcript, recording_url, lead_score, intent_label, created_at")
        .eq("user_id", req.user.id)
        .ilike("customer_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_outbound_leads")
        .select("id, agent_id, customer_name, status, context, last_called_at, created_at, phone_number")
        .eq("user_id", req.user.id)
        .ilike("phone_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_appointments")
        .select("id, agent_id, customer_name, service_type, date, time, status, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false }),
    ]);

    // The first lead/call gives us a candidate name.
    const customerName =
      leads?.[0]?.customer_name ||
      appts?.[0]?.customer_name ||
      null;

    // Build a unified timeline.
    const timeline: any[] = [];
    for (const c of calls || []) {
      timeline.push({
        type: c.direction === "inbound" ? "call_in" : "call_out",
        id: c.id,
        ts: c.created_at,
        duration_seconds: c.duration_seconds,
        cost: c.cost,
        summary: c.summary,
        lead_score: c.lead_score,
        intent_label: c.intent_label,
        recording_url: c.recording_url,
        agent_id: c.agent_id,
      });
    }
    for (const a of appts || []) {
      // Only include appointments where the customer name matches one of our leads/calls
      if (customerName && a.customer_name && a.customer_name.toLowerCase().trim() === customerName.toLowerCase().trim()) {
        timeline.push({
          type: "appointment",
          id: a.id,
          ts: a.created_at,
          summary: `${a.service_type} — ${a.date} ${a.time}`,
          status: a.status,
          agent_id: a.agent_id,
        });
      }
    }
    timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const totalCalls = calls?.length || 0;
    const totalMinutes = Math.round((calls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
    const totalCost = Number((calls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));
    const avgScore = totalCalls ? Math.round((calls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / totalCalls) : 0;
    const lastTouch = calls?.[0]?.created_at || leads?.[0]?.created_at || null;

    res.json({
      number: number,
      normalized: norm,
      customer_name: customerName,
      stats: {
        total_calls: totalCalls,
        total_minutes: totalMinutes,
        total_cost: totalCost,
        avg_lead_score: avgScore,
        last_touch: lastTouch,
        outbound_leads: leads?.length || 0,
        appointments: appts?.filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()).length || 0,
      },
      timeline,
      leads: leads || [],
      appointments: (appts || []).filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()),
    });
  } catch (e) { claudeErr(res, e); }
});

// Agent Forge — create the actual agent + seed personality, directives, knowledge.
app.post("/api/claude/forge/create", authenticateUser, async (req: any, res: any) => {
  try {
    const { design, websiteUrl } = req.body;
    if (!design || !design.name) return res.status(400).json({ error: "design with name required." });

    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const { error: agentErr } = await db.from("wireline_agents").insert({
      id: agentId,
      user_id: req.user.id,
      name: design.name,
      archetype: design.archetype || "Receptionist",
      first_message: design.first_message || `Hi, this is ${design.name}. How can I help?`,
      website_url: websiteUrl || null,
      channel: "voice",
    });
    if (agentErr) throw agentErr;

    if (design.personality_block) {
      await db.from("wireline_personality").upsert({
        agent_id: agentId,
        user_id: req.user.id,
        content: design.personality_block,
      });
    }

    const directiveRows = (design.directives || []).map((d: any) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: d.content,
      priority: d.priority ?? 5,
    }));
    if (directiveRows.length) await db.from("wireline_directives").insert(directiveRows);

    const knowledgeRows = (design.seed_knowledge || []).map((k: string) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: k,
    }));
    if (knowledgeRows.length) await db.from("wireline_knowledge").insert(knowledgeRows);

    res.json({ success: true, agentId });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ==========================================
// DNC (DO NOT CALL) LIST — Compliance
// ==========================================
// Normalize a phone number to digits only for consistent matching.
function normalizeDncPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

// Check whether a phone number is on the DNC list for a given user.
// Returns true if the call should be blocked.
async function isDncBlocked(userId: string, phone: string): Promise<boolean> {
  const normalized = normalizeDncPhone(phone);
  if (!normalized) return false;
  const { data } = await db
    .from("wireline_dnc_list")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", normalized)
    .limit(1);
  return !!(data && data.length > 0);
}

// List DNC entries
app.get("/api/dnc", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from("wireline_dnc_list")
      .select("id, phone, phone_raw, reason, source, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (e: any) {
    log.error("DNC list fetch failed", { error: e?.message });
    res.status(500).json({ error: "Failed to fetch DNC list." });
  }
});

// Add one or more numbers to DNC list
app.post("/api/dnc", authenticateUser, async (req: any, res: any) => {
  try {
    const { entries } = req.body as { entries: Array<{ phone: string; reason?: string; source?: string }> };
    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: "entries array is required." });
    }
    const rows = entries
      .filter((e: any) => e.phone)
      .map((e: any) => ({
        user_id: req.user.id,
        phone: normalizeDncPhone(e.phone),
        phone_raw: e.phone,
        reason: e.reason || null,
        source: e.source || "manual",
      }))
      .filter((r: any) => r.phone.length > 0);

    if (rows.length === 0) return res.status(400).json({ error: "No valid phone numbers provided." });

    const { data, error } = await db
      .from("wireline_dnc_list")
      .upsert(rows, { onConflict: "user_id,phone", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    res.json({ success: true, added: data?.length ?? 0 });
  } catch (e: any) {
    log.error("DNC add failed", { error: e?.message });
    res.status(500).json({ error: "Failed to add to DNC list." });
  }
});

// Remove a number from DNC list
app.delete("/api/dnc/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db
      .from("wireline_dnc_list")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    log.error("DNC delete failed", { error: e?.message });
    res.status(500).json({ error: "Failed to remove DNC entry." });
  }
});

// ==========================================
// QA SCORING — Claude-powered call quality
// ==========================================
// Score a call against a 5-dimension QA rubric (20 pts each = 100 total).
app.post("/api/qa/score/:callId", authenticateUser, withAudit("qa"), async (req: any, res: any) => {
  try {
    const { callId } = req.params;
    const { data: call, error: callErr } = await db
      .from("wireline_call_logs")
      .select("id, summary, transcript, sentiment, direction, duration_seconds, coaching_note, agent_id, wireline_agents(role)")
      .eq("id", callId)
      .eq("user_id", req.user.id)
      .single();

    if (callErr || !call) return res.status(404).json({ error: "Call not found." });

    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude is not configured." });
    }

    // Agent role is fetched via the relation above — used for role-specific QA guidance.
    const agentRole: string | undefined = (call as any).wireline_agents?.role ?? undefined;

    const breakdown = await claudeBrain.qaScore({
      direction: ((call as any).direction || "inbound") as "inbound" | "outbound",
      agentRole,
      summary: (call as any).summary || "",
      transcript: (call as any).transcript || "",
      sentiment: (call as any).sentiment || "neutral",
      durationSeconds: (call as any).duration_seconds,
    });

    const QA_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;
    const score = Math.min(
      100,
      Math.max(0, QA_DIMENSIONS.reduce((sum, dim) => sum + (Number(breakdown[dim]) || 0), 0))
    );

    // Persist score + breakdown. Also write coaching_note if we generated one.
    const updatePayload: any = { qa_score: score, qa_breakdown: breakdown };
    if (breakdown.coaching_note) updatePayload.coaching_note = breakdown.coaching_note;

    await db
      .from("wireline_call_logs")
      .update(updatePayload)
      .eq("id", callId)
      .eq("user_id", req.user.id);

    res.json({ success: true, score, breakdown });
  } catch (e: any) {
    log.error("QA scoring failed", { error: e?.message });
    res.status(500).json({ error: "QA scoring failed." });
  }
});

// Batch-score all unscored calls (or up to `limit`) for the authenticated user.
// Runs with concurrency=3 to avoid hammering Claude. Returns scored/skipped/failed counts.
app.post("/api/qa/score-batch", authenticateUser, claudeRateLimiter, withAudit("qa"), async (req: any, res: any) => {
  if (!claudeBrain.isClaudeAvailable()) {
    return res.status(503).json({ error: "Claude is not configured." });
  }
  try {
    const limit = Math.min(MAX_BATCH_SCORE_LIMIT, Math.max(1, parseInt(String(req.body.limit || "20"), 10)));
    const days  = req.body.days ? Math.min(90, Math.max(1, parseInt(String(req.body.days), 10))) : undefined;
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;

    const baseQuery = db
      .from("wireline_call_logs")
      .select("id, summary, transcript, sentiment, direction, duration_seconds, agent_id, wireline_agents(role)")
      .eq("user_id", req.user.id)
      .is("qa_score", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const { data: calls, error } = await (since ? baseQuery.gte("created_at", since) : baseQuery);
    if (error) throw error;
    if (!calls || calls.length === 0) {
      return res.json({ scored: 0, skipped: 0, failed: 0, total: 0 });
    }

    const QA_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;
    const CONCURRENCY = 3;
    let scored = 0, skipped = 0, failed = 0;

    // Simple promise-chain semaphore — each slot is a chained promise so at most
    // CONCURRENCY scoring requests run simultaneously. Array.prototype.map executes
    // the callback synchronously in index order, so slotIdx increments are safe.
    const sem = Array.from({ length: CONCURRENCY }, () => Promise.resolve());
    let slotIdx = 0;

    const tasks = calls.map((call: any) => {
      const slot = slotIdx % CONCURRENCY;
      slotIdx++;
      return (sem[slot] = sem[slot].then(async () => {
        try {
          if (!call.transcript && !call.summary) { skipped++; return; }
          const agentRole: string | undefined = (call as any).wireline_agents?.role ?? undefined;
          const breakdown = await claudeBrain.qaScore({
            direction: (call.direction || "inbound") as "inbound" | "outbound",
            agentRole,
            summary: call.summary || "",
            transcript: call.transcript || "",
            sentiment: call.sentiment || "neutral",
            durationSeconds: call.duration_seconds,
          });
          const score = Math.min(
            100,
            Math.max(0, QA_DIMENSIONS.reduce((s, d) => s + (Number(breakdown[d]) || 0), 0))
          );
          const updatePayload: any = { qa_score: score, qa_breakdown: breakdown };
          if (breakdown.coaching_note) updatePayload.coaching_note = breakdown.coaching_note;
          await db.from("wireline_call_logs")
            .update(updatePayload)
            .eq("id", call.id)
            .eq("user_id", req.user.id);
          scored++;
        } catch (err: any) {
          log.warn("Batch QA: single call scoring failed", { callId: call.id, error: getErrorMessage(err) });
          failed++;
        }
      }));
    });

    await Promise.all(tasks);
    res.json({ scored, skipped, failed, total: calls.length });
  } catch (e: any) {
    log.error("Batch QA scoring failed", { error: e?.message });
    res.status(500).json({ error: "Batch QA scoring failed." });
  }
});

// Aggregate QA stats for the Insights Quality tab.
app.get("/api/qa/stats", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || "30"), 10)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: calls, error } = await db
      .from("wireline_call_logs")
      .select("qa_score, qa_breakdown, direction, agent_id, created_at")
      .eq("user_id", req.user.id)
      .gte("created_at", since)
      .not("qa_score", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!calls || calls.length === 0) {
      return res.json({ count: 0, avgScore: 0, distribution: [], dimensions: {}, trend: [] });
    }

    const avgScore = Math.round(calls.reduce((s: number, c: any) => s + (c.qa_score || 0), 0) / calls.length);

    // Score distribution buckets
    const distribution = [
      { label: "Poor (0–39)",       min: 0,  max: 39,  count: 0, color: "#FF6BD9" },
      { label: "Fair (40–59)",      min: 40, max: 59,  count: 0, color: "#FF9A5C" },
      { label: "Good (60–74)",      min: 60, max: 74,  count: 0, color: "#FFD166" },
      { label: "Great (75–89)",     min: 75, max: 89,  count: 0, color: "#4DFFC4" },
      { label: "Excellent (90+)",   min: 90, max: 100, count: 0, color: "#7DF9FF" },
    ];
    calls.forEach((c: any) => {
      const bucket = distribution.find((b) => c.qa_score >= b.min && c.qa_score <= b.max);
      if (bucket) bucket.count++;
    });

    // Average by QA dimension
    const dims = { greeting: 0, discovery: 0, solution: 0, objection: 0, closing: 0 };
    let dimCount = 0;
    calls.forEach((c: any) => {
      if (c.qa_breakdown && typeof c.qa_breakdown === "object") {
        dims.greeting  += Number(c.qa_breakdown.greeting)  || 0;
        dims.discovery += Number(c.qa_breakdown.discovery) || 0;
        dims.solution  += Number(c.qa_breakdown.solution)  || 0;
        dims.objection += Number(c.qa_breakdown.objection) || 0;
        dims.closing   += Number(c.qa_breakdown.closing)   || 0;
        dimCount++;
      }
    });
    const dimensions = dimCount > 0
      ? {
          greeting:  +(dims.greeting  / dimCount).toFixed(1),
          discovery: +(dims.discovery / dimCount).toFixed(1),
          solution:  +(dims.solution  / dimCount).toFixed(1),
          objection: +(dims.objection / dimCount).toFixed(1),
          closing:   +(dims.closing   / dimCount).toFixed(1),
        }
      : dims;

    // 7-day trend (or last 7 available days)
    const byDay: Record<string, number[]> = {};
    calls.forEach((c: any) => {
      const day = c.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(c.qa_score);
    });
    const trend = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([day, scores]) => ({ day, avg: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) }));

    res.json({ count: calls.length, avgScore, distribution, dimensions, trend });
  } catch (e: any) {
    log.error("QA stats failed", { error: e?.message });
    res.status(500).json({ error: "Failed to fetch QA stats." });
  }
});

// ──────────────────────────────────────────────────────────────────────────
//  NAV COUNTS — lightweight badge data for the sidebar nav.
//  Returns a map of route path → integer count so the sidebar can render
//  attention badges without a full data load. Uses COUNT(*) queries only.
// ──────────────────────────────────────────────────────────────────────────
app.get("/api/nav-counts", authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user.id;

    const [
      { count: triageCount },
      { count: emailCount },
      { count: outboundCount },
      { data: liveSignals },
    ] = await Promise.all([
      // Triage: pending fleet tasks (any type)
      db.from("wireline_fleet_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending"),
      // Email: unread threads
      db.from("wireline_email_threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false),
      // Outbound: queued leads not yet dialed
      db.from("wireline_outbound_leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "queued"),
      // Live: active calls whose sentiment label indicates distress ("⚠ Frustrated")
      db.from("wireline_signal_presence")
        .select("label")
        .eq("user_id", userId),
    ]);

    // Count signals whose label starts with the distress prefix (⚠).
    const distressedCount = (liveSignals ?? []).filter(
      (s: any) => typeof s.label === "string" && s.label.startsWith("⚠")
    ).length;

    res.json({
      "/triage":   triageCount    ?? 0,
      "/inbox":    emailCount     ?? 0,
      "/outbound": outboundCount  ?? 0,
      "/live":     distressedCount,
    });
  } catch (e) {
    // Never 500 on a non-critical badge endpoint
    log.warn("nav-counts failed", { error: e instanceof Error ? e.message : String(e) });
    res.json({ "/triage": 0, "/inbox": 0, "/outbound": 0, "/live": 0 });
  }
});

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("Unhandled global error", {
    requestId: (res as any).locals?.requestId,
    method: req.method,
    path: req.path,
    error: getErrorMessage(err),
    stack: err?.stack,
  });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { requestId: (res as any).locals?.requestId, path: req.path, method: req.method },
    });
  }
  res.status(500).json({ error: 'Internal Server Error', requestId: (res as any).locals?.requestId });
});

// ==========================================
// 3. VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on http://localhost:${PORT}`);
  });

  // ────────────────────────────────────────────────────────────────
  //  Graceful shutdown — stop accepting new connections, drain
  //  in-flight requests for up to GRACE_MS, then exit. Triggered by
  //  SIGTERM (Vercel/PM2/systemd) and SIGINT (Ctrl-C).
  // ────────────────────────────────────────────────────────────────
  const GRACE_MS = 15_000;
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — starting graceful shutdown`);
    const forceTimer = setTimeout(() => {
      log.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, GRACE_MS).unref?.();
    server.close((err) => {
      clearTimeout(forceTimer as any);
      if (err) {
        log.error("Error during server.close", { error: err.message });
        process.exit(1);
      }
      log.info("Graceful shutdown complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ────────────────────────────────────────────────────────────────────
//  Process-level safety net — never let an unhandled rejection or
//  uncaught exception silently crash the worker. We log structured
//  details and (for uncaught exceptions, which leave the process in
//  an unknown state) ask the runtime to restart us.
// ────────────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason: any) => {
  log.error("unhandledRejection", {
    error: reason?.message || String(reason),
    stack: reason?.stack,
  });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  }
});
process.on("uncaughtException", (err: Error) => {
  log.error("uncaughtException", { error: err.message, stack: err.stack });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
    // Give Sentry up to 2s to flush before we exit.
    Sentry.close(2000).catch(() => {});
  }
  // Best practice: process is in an unknown state — exit so the
  // platform's restart policy boots us fresh. Skipped on Vercel where
  // each invocation is its own process.
  if (process.env.VERCEL !== "1") {
    setTimeout(() => process.exit(1), 100).unref?.();
  }
});

export { app };

// Only start the HTTP server when running standalone (not on Vercel).
// Vercel sets VERCEL=1 automatically in all serverless function environments.
if (process.env.VERCEL !== '1') {
  startServer();
}
