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
import { randomUUID, timingSafeEqual as cryptoTimingSafeEqual, createHmac } from "node:crypto";
import * as claudeBrain from "./src/lib/claude-brain";
import { AuditLogger } from "./src/lib/audit-logger";
import { createAuditEventsHandler, createAuditStatsHandler, createAuditExportHandler } from "./src/lib/audit-routes";
import { buildCSP, buildConnectSrcs, buildSupabaseOrigin, generateCspNonce } from "./src/lib/csp";
import { rateLimit, isRedisConfigured, startMemoryCleanup, distributedLimiterStatus } from "./src/lib/rate-limit";
import { SentryEvents } from "./src/lib/sentry-events";
import { AgentFormSchema, DirectiveSchema, KnowledgeSchema, EmailReplySchema, EmailDraftSchema, CampaignCreateSchema, CampaignUpdateSchema, OutboundBulkSchema, AgentBusinessProfileSchema, parseFormData, GeminiLeadScoreSchema, GeminiLessonSchema, GeminiFollowupTaskSchema, GeminiEmailScoreSchema, GeminiAgentExtractionSchema, FleetTaskCreateSchema } from "./src/lib/form-validators";
import { getErrorMessage, sanitizeForAudit } from "./src/lib/server-utils";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "./src/lib/agent-runtime";
import { computeScorecard } from "./src/lib/agent-scorecard";
import { computeDashboardStats } from "./src/lib/dashboard-stats";
import { DEFAULT_AGENT_ROLE } from "./src/lib/agent-constants";
import { extractCapturedProfileIntel, buildCustomerIntelBlock } from "./src/lib/customer-intel";
import { compileActivityFeed } from "./src/lib/fleet-activity";
import { computeAgentPerformance, emptyAgentPerformance } from "./src/lib/agent-performance";
import { computeAuditSummary } from "./src/lib/audit-summary";
import { computeDashboardBenchmarks } from "./src/lib/dashboard-benchmarks";
import { buildContactProfile, normalizePhoneTail } from "./src/lib/contact-profile";
import { computeOutcomeBreakdown, computeCallStats, callIdsFromLeads } from "./src/lib/campaign-analytics";
import { isPrivateIp, isPrivateIpv6, isSsrfUrl, validateWebhookUrl } from "./src/lib/webhook-validators";
import { evaluateOutboundConsent, getConsentRuleForPhone, buildConsentLedgerRow, detectOptOut, CONSENT_RULE_VERSION } from "./src/lib/tcpa-consent";
import { QuotaTracker, quotaRejectionHeaders, validateOverride, PLAN_DEFAULTS, type PlanTier } from "./src/lib/tenant-quotas";
import { enqueue, startWorker, getQueueStats, type JobRow } from "./src/lib/job-queue";
import { claudeRateLimiter, quotaRateLimit, jobsRateLimit, tcpaRateLimit, webhooksRateLimit } from "./src/middleware/api-rate-limits";
import { enforceSpendCap, enforce24hSpendCap, recordDailySpend, DAILY_SPEND_LIMIT_USD, evaluateSpend, getBudgetSnapshot, clearBudgetCache } from "./src/lib/spend-guards";
import { withAudit } from "./src/middleware/audit-middleware";
import { enforceClaudeDailyTokenQuota } from "./src/middleware/claude-quota-middleware";
import { claudeErr } from "./src/lib/claude-response-helpers";
import { cachedInsight, setCachedInsight } from "./src/lib/insights-cache";
import { encryptSecret, decryptSecret, lastFour, isVaultConfigured } from "./src/lib/secret-vault";
import { createRbacMiddleware, getCallerRole, invalidateRoleCache } from "./src/middleware/require-role";
import { syncGoogleCalendar } from "./src/services/google-calendar-sync";
import { syncOutlookCalendar } from "./src/services/outlook-calendar-sync";
import { syncGoogleDriveToKnowledge } from "./src/services/google-drive-sync";
import { db, IS_PROD, log, fetchWithTimeout, auditLogger, requirePermission, requireRole, quotaTracker } from "./src/lib/server-context";
import { stripe, stripeAvailable } from "./src/lib/stripe-helpers";
import { SCOPES, MS_SCOPES, getGoogleOAuthClient, getMicrosoftRedirectUri, refreshMicrosoftToken, getMicrosoftAccessToken, generateOAuthState, verifyOAuthState, sendEmailViaMicrosoft } from "./src/lib/oauth-helpers";
import { VAPI_WEBHOOK_SECRET, timingSafeEq, sanitizePhone, MAX_CONTEXT_PREVIEW_LENGTH, buildCallerProfileBlock, OUTBOUND_ARCHETYPE_BY_ROLE, getArchetypeConfig, buildRoleToolDefs, PRESERVED_LEAD_STATUSES, SENTIMENT_ANGRY_SIGNALS, SENTIMENT_POSITIVE_SIGNALS } from "./src/lib/vapi-helpers";
import { attemptWebhookDelivery, dispatchWebhook, processWebhookRetries, WEBHOOK_EVENTS, type WebhookEvent } from "./src/lib/webhook-helpers";
import { isDncBlocked } from "./src/lib/compliance";
import { placeOutboundCall } from "./src/lib/vapi-client";
import { computeDailyBrief } from "./src/lib/daily-brief";

import oauthRouter from "./src/routes/oauth-routes";
import vapiRouter from "./src/routes/vapi-routes";
import stripeRouter from "./src/routes/stripe-routes";
import agentRouter from "./src/routes/agent-routes";
import campaignRouter from "./src/routes/campaign-routes";
import fleetRouter from "./src/routes/fleet-routes";
import auditRouter from "./src/routes/audit-routes";
import insightsRouter from "./src/routes/insights-routes";
import complianceRouter from "./src/routes/compliance-routes";
import qaRouter from "./src/routes/qa-routes";
import quotaRouter from "./src/routes/quota-routes";
import jobRouter from "./src/routes/job-routes";
import soc2Router from "./src/routes/soc2-routes";
import { authenticateUser } from "./src/middleware/auth";
import { initJobWorker } from "./src/lib/job-worker";
import { validateStartupEnv } from "./src/lib/startup";
import healthRouter from "./src/routes/health-routes";
import openapiRouter from "./src/routes/openapi-routes";
import * as rateLimiters from "./src/middleware/rate-limit-middleware";

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

// DEFAULT_AGENT_ROLE is imported from ./src/lib/agent-constants

// ────────────────────────────────────────────────────────────────────
//  Startup env validation — fail fast in production rather than
//  silently booting with placeholder Supabase URLs / missing webhook
//  secrets. Log warnings (not errors) in dev so local hacking still works.
// ────────────────────────────────────────────────────────────────────
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

// Body parser scoping.
//
// The global default is a tight 1 MB ceiling, which comfortably covers
// every typical API payload. Two endpoints legitimately need a larger
// budget and are carved out explicitly; everything else falls through
// to the 1 MB default. Applying a high ceiling globally would turn
// every other endpoint — including unauthenticated ones like
// /api/intake/lead and the Vapi webhook — into a DoS magnet (an
// attacker can force the server to allocate the full ceiling per
// request before any auth check runs).
//
//   /api/claude/knowledge-from-document → 50 MB
//     Accepts a base64-encoded PDF (up to ~32 MB raw / ~43 MB base64).
//     Runs before authentication (Express body parsers can't read
//     req.user) but is gated by the /api/claude/* rate limiter
//     (60 req/min/key) and the spend hard-cap.
//
//   /api/outbound/bulk → 16 MB
//     The schema cap is 5000 leads/request (form-validators.ts ::
//     OutboundBulkSchema). Each lead's bounded fields alone (phone +
//     name + email + 2 KB notes + status + passthrough custom CRM
//     fields) can reach ~2 KB, so a max-sized batch is ~10–12 MB.
//     The 16 MB ceiling matches the documented schema cap with
//     headroom for JSON overhead. The endpoint is authenticated, so
//     the residual DoS surface is bounded to authed callers.
//     NOTE: this carve-out backfills a regression — PR #95 dropped
//     the global ceiling from 50 MB → 1 MB without scoping bulk.
app.use("/api/claude/knowledge-from-document", express.json({ limit: '50mb' }));
app.use("/api/outbound/bulk", express.json({ limit: '16mb' }));
app.use(express.json({ limit: '1mb' }));

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
//  In production, script-src uses 'self' only (no 'unsafe-inline').
//  OAuth callback pages that need an inline postMessage script are the
//  only server-rendered HTML in this app; they receive a per-request
//  nonce via buildCSP(false, nonce) so 'unsafe-inline' is never needed
//  in the global policy.  Vite dev mode keeps 'unsafe-inline' +
//  'unsafe-eval' for HMR.
//
//  connect-src permits Supabase, Anthropic, Vapi, and Google APIs so
//  the browser's fetch() is allowed to reach those origins.
// ────────────────────────────────────────────────────────────────────
const supabaseOrigin = buildSupabaseOrigin();

// Build CSP connect-src from known external APIs.
const CSP_CONNECT_SRCS = buildConnectSrcs(supabaseOrigin);

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
  res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, undefined, CSP_CONNECT_SRCS));
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
app.use("/api/health", healthRouter);

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
  const allowInMemory = String(process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT || "")
    .toLowerCase() === "true";
  if (allowInMemory) {
    log.warn("Rate limiter: in-memory only (WIRELINE_ALLOW_INMEMORY_RATE_LIMIT=true) — single-node deployments only");
  } else {
    log.warn("Rate limiter: in-memory only — SPEND-SENSITIVE ROUTES WILL FAIL CLOSED. Set UPSTASH_REDIS_REST_URL or WIRELINE_ALLOW_INMEMORY_RATE_LIMIT=true.");
  }
} else {
  log.info("Rate limiter: in-memory (dev mode)");
}

// Start the in-memory bucket janitor so the fallback Map doesn't leak
// memory in long-lived deployments.
startMemoryCleanup();

// Thin wrapper around the shared claudeRateLimiter (imported from
// ./src/middleware/api-rate-limits) that adds server-level audit +
// Sentry instrumentation. Used only within server.ts; route files
// import claudeRateLimiter directly from the middleware.
async function _claudeRateLimiterWithHooks(req: any, res: any, next: any) {
  const origJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode === 429 && body?.code === "CLAUDE_RATE_LIMIT") {
      const token = req.headers.authorization?.split(" ")[1];
      void auditLogger.logSecurity('rate_limit_exceeded', {
        userId: undefined,
        resource: 'claude_api',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { hasToken: !!token }
      }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
      SentryEvents.rateLimited({ endpoint: '/api/claude', user_id: req.user?.id });
    }
    return origJson(body);
  };
  return claudeRateLimiter(req, res, next);
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
        log.warn("Request timeout", { requestId: res.locals?.requestId, endpoint, timeoutMs, method: req.method });
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

// Cache-Control headers for read operations.
//
// Earlier this middleware applied `private, max-age=60, must-revalidate`
// to EVERY GET /api/* request. That caused user-visible "ghost data"
// bugs: a mutation in one tab, followed by an immediate refetch in the
// same tab, could be served from the disk cache and miss the new row.
//
// Now: only an explicit allowlist of safely-cacheable, low-mutation
// read endpoints gets a short-lived cache. Everything else defaults to
// `no-store, private` so dashboards/triage/insights/logs reflect the
// latest DB state after every mutation. Write methods (POST/PATCH/PUT/
// DELETE) are always no-store.
//
// Allowlist criteria: must be either (a) static catalog data that
// changes at most once per deploy, or (b) liveness/capability probes
// where a 60s staleness is harmless. New endpoints default to no-store
// unless they explicitly satisfy these criteria.
const CACHEABLE_GET_PREFIXES: readonly string[] = [
  '/api/health',           // liveness probe — capability flags rarely change
  '/api/billing/plans',    // plan catalog — changes at deploy time
  '/api/agents/roles',     // static role enum — never changes at runtime
  '/api/claude/status',    // model + availability probe
];
function isCacheableApiPath(pathname: string): boolean {
  return CACHEABLE_GET_PREFIXES.some(prefix =>
    pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

app.use((req: any, res: any, next: any) => {
  if (req.method === 'GET') {
    // Static assets: cache aggressively (hashed filenames are immutable).
    if (req.path.match(/\.(js|css|png|jpg|svg|woff|woff2|ttf)$/i)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // API: only cache allowlisted endpoints; everything else defaults
    // to no-store to prevent stale-after-mutation bugs.
    else if (req.path.startsWith('/api/')) {
      if (isCacheableApiPath(req.path)) {
        res.set('Cache-Control', 'private, max-age=60, must-revalidate');
      } else {
        res.set('Cache-Control', 'no-store, private');
      }
    }
  } else {
    // Never cache write operations.
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
app.use([
  "/api/train/extract",
  "/api/agents/:id/optimize",
  "/api/insights/topics",
  "/api/insights/failure-modes",
  "/api/insights/daily-brief",
  "/api/qa/score",
], (req: any, res: any, next: any) => {
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

// ────────────────────────────────────────────────────────────────────
//  OAuth CSRF state — stateless signed tokens (no session required).
//  Format: `<nonce>.<ts_base36>.<hmac_base64url>`
//  Expires after 15 minutes; verified in each callback handler.
// ────────────────────────────────────────────────────────────────────
const OAUTH_STATE_SECRET =
  process.env.OAUTH_STATE_SECRET ||
  process.env.STRIPE_WEBHOOK_SECRET ||
  "wireline-dev-oauth-state-secret"; // dev-only fallback; prod is gated by validateStartupEnv
if (!process.env.OAUTH_STATE_SECRET && process.env.STRIPE_WEBHOOK_SECRET) {
  // In dev we accept the Stripe-secret fallback to keep `npm run dev`
  // painless, but be loud about it: mixing secrets across domains is a
  // smell and rotating the Stripe secret would silently invalidate
  // every in-flight OAuth state token.
  const msg = "OAUTH_STATE_SECRET unset — falling back to STRIPE_WEBHOOK_SECRET. Set OAUTH_STATE_SECRET to a dedicated random secret before deploying.";
  log.warn(msg);
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(msg, "fatal");
  }
}

// OAuth helpers moved to src/lib/oauth-helpers.ts

// Email operation rate limiting — prevents spam and API quota exhaustion
const EMAIL_RATE_WINDOW_MS = 60_000; // 1 minute
const EMAIL_RATE_MAX = 20; // 20 email operations per minute per user

// Knowledge base operation rate limiting — protects against bulk learning spam while allowing legitimate agent training
const KNOWLEDGE_RATE_WINDOW_MS = 60_000; // 1 minute
const KNOWLEDGE_RATE_MAX = 100; // 100 knowledge operations per minute per user

// Phone number provisioning rate limiting — Twilio/Vapi calls are expensive, limit bulk assignment
const PHONE_NUMBER_RATE_WINDOW_MS = 60_000; // 1 minute
const PHONE_NUMBER_RATE_MAX = 10; // 10 phone number operations per minute per user

// Outbound dial rate limit — prevents runaway billing from a compromised
// token or a bug in the batch-dispatch loop. 30 manual dials per minute is
// well above any human rate; the campaign loop has its own 2 s sleep already.
const DIAL_RATE_WINDOW_MS = 60_000;
const DIAL_RATE_MAX = 30;

async function dialRateLimiter(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  // Spend-sensitive: refuse if distributed limiter unavailable in prod.
  const status = distributedLimiterStatus();
  if (!status.ok) {
    log.warn("Refusing spend-sensitive route — distributed rate limiter unavailable", {
      userId,
      resource: "outbound_dial",
      ip: req.ip,
      reason: status.reason,
    });
    return res.status(503).json({ error: status.reason, code: status.code });
  }
  let result;
  try {
    result = await rateLimit(userId, { bucket: "outbound_dial", windowMs: DIAL_RATE_WINDOW_MS, max: DIAL_RATE_MAX, failClosedOnError: true });
  } catch (err) {
    return res.status(503).json({ error: "Rate limiter temporarily unavailable.", code: "RATE_LIMITER_ERROR" });
  }
  res.setHeader("X-RateLimit-Limit", String(DIAL_RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    void auditLogger.logSecurity('rate_limit_exceeded', { userId, resource: 'outbound_dial', ip: req.ip, metadata: { limit: DIAL_RATE_MAX } }).catch(() => {});
    res.setHeader("Retry-After", String(Math.ceil(DIAL_RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ error: `Rate limit exceeded — ${DIAL_RATE_MAX} outbound dials per minute. Please slow down.`, code: "DIAL_RATE_LIMIT" });
  }
  next();
}

app.use("/api/emails", authenticateUser, rateLimiters.emailRateLimiter);
app.use("/api/knowledge", authenticateUser, rateLimiters.knowledgeRateLimiter);
app.use("/api/phone-numbers", authenticateUser, rateLimiters.phoneNumberRateLimiter);
app.use("/api/outbound/dial", authenticateUser, rateLimiters.dialRateLimiter);

app.use("/api/claude", (req: any, res: any, next: any) => {
  if (req.path === "/status") return next();
  claudeRateLimiter(req, res, next).catch(next);
});

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
// Google OAuth client moved to src/lib/oauth-helpers.ts

// handleJob and background worker moved to src/lib/job-worker.ts
let stopWorker: (() => void) | undefined = initJobWorker();

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
    price_usd_monthly: 79,
    max_agents: 3,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "3 AI agents (voice + email)",
      "Unlimited inbound calls",
      "200 outbound calls / month",
      "Daily Brief + Triage Inbox",
      "Webhooks · Intake API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 299,
    max_agents: 10,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "Unlimited outbound calls",
      "Auto-dial new leads instantly",
      "Knowledge Atlas + Insights",
      "Everything in Starter",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 1199,
    max_agents: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "100 AI agents",
      "Everything in Pro",
      "SSO + SAML",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

// Stripe client and helpers moved to src/lib/stripe-helpers.ts
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
// Webhook helpers moved to src/lib/webhook-helpers.ts
setInterval(processWebhookRetries, 30_000).unref?.();

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

// evaluateSpend and budget caching moved to ./src/lib/spend-guards

// evaluateSpend moved to ./src/lib/spend-guards


// enforceSpendCap is imported from ./src/lib/spend-guards
// enforce24hSpendCap and recordDailySpend imported from ./src/lib/spend-guards
// authenticateUser moved to ./src/middleware/auth.ts

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
  }).catch((e: unknown) => { log.warn("subscription.changed webhook dispatch failed", { user_id: userId, error: getErrorMessage(e) }); });

  // Audit the billing state change. We pick the action based on
  // Stripe's lifecycle status so the audit log faithfully reflects
  // whether this was a new sub, a status flip, or a cancellation.
  const billingAction: 'subscription_created' | 'subscription_updated' | 'subscription_cancelled' =
    stripeStatus === "canceled" || stripeStatus === "incomplete_expired"
      ? 'subscription_cancelled'
      : (sub as any)._auditCreate
        ? 'subscription_created'
        : 'subscription_updated';
  void auditLogger.logBilling(billingAction, {
    userId,
    subscriptionId: sub.id,
    customerId,
    plan: plan?.id || undefined,
    metadata: { stripe_status: stripeStatus, legacy_status: localStatus, cancel_at_period_end: !!sub.cancel_at_period_end },
  }).catch(() => {});
}

// Stripe webhook moved to src/routes/stripe-routes.ts
app.use(stripeRouter);
app.use(agentRouter);
app.use(campaignRouter);
app.use(fleetRouter);
app.use(auditRouter);
// Claude-backed insight reads — audit context MUST mount before insightsRouter so
// AsyncLocalStorage wraps the handlers (insights routes declare full `/api/...` paths).
app.use(
  ["/api/insights/topics", "/api/insights/failure-modes", "/api/insights/daily-brief"],
  withAudit("insights"),
);
app.use(insightsRouter);

// Vapi webhook moved to src/routes/vapi-routes.ts
app.use(vapiRouter);

// OAuth routes moved to src/routes/oauth-routes.ts
app.use(oauthRouter);

// 1.5 CALL LOG RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/calls", authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
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
          db.from('wireline_agents').select('id, name, channel, role').eq('user_id', req.user.id).limit(500),
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

      // Hand the rows to the pure stats math (src/lib/dashboard-stats.ts)
      // so each derivation — totals, sentiment, week-delta, hot leads,
      // 7-day chart series — is unit-tested in isolation.
      const stats = computeDashboardStats({
        totalAppointments,
        totalLeads,
        logs:        logsRes.data || [],
        prevLogs:    prevLogsRes.data || [],
        hotEmails:   hotEmailsRes.data || [],
        recentAppts: recentApptsRes.data || [],
      });

      res.json({
         ...stats,
         agents: agentsRes.data || [],
         recentLogs: (logsRes.data || []).slice(0, 100),
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

    const result = computeDashboardBenchmarks({
      calls: callsResult.data || [],
      leads: leadsResult.data || [],
      agentCount: agentsResult.data?.length || 0,
    });
    res.json({ ...result, period: "30d" });
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
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 200 : limitRaw), 1000);
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

const APPOINTMENT_STATUSES = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'Rescheduled'] as const;

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
      status: APPOINTMENT_STATUSES.includes(status) ? status : 'Scheduled',
    }).select().single();
    if (error) throw error;
    dispatchWebhook(req.user.id, "appointment.booked", {
      id: data.id, customer_name: customer_name.trim(), date: date.trim(), time: time.trim(),
      service_type: typeof service_type === 'string' ? service_type.trim() || 'General' : 'General',
    }).catch(() => {});
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
    if (updates.status !== undefined && !APPOINTMENT_STATUSES.includes(updates.status as any)) {
      return res.status(400).json({ error: `status must be one of: ${APPOINTMENT_STATUSES.join(', ')}` });
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
// Vapi helpers moved to src/lib/vapi-helpers.ts

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

// Returns role metadata (label, description, color, and personality template)
// so the UI can render role selectors and apply templates without client-side hardcoding.

// Apply a role template directly to an agent's personality record.
// Called from the Fleet Settings "Apply Role Template" button.

// Export agent config as JSON

// Import agent config from JSON

// Update agent settings

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

app.get("/api/agent-config/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const [directives, knowledge, personality, lessons] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }).limit(500),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).limit(500),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single(),
      db.from('wireline_agent_lessons').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(200)
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

app.post("/api/phone-numbers", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: any, res: any) => {
  try {
    const { phone_number, vapi_number_id } = req.body;
    await db.from('wireline_phone_numbers').insert({ phone_number, vapi_number_id, user_id: req.user.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

app.patch("/api/phone-numbers/:id", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: any, res: any) => {
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

app.delete("/api/phone-numbers/:id", authenticateUser, rateLimiters.phoneNumberRateLimiter, async (req: any, res: any) => {
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

const FLEET_TASK_STATUSES = ['pending', 'open', 'in_progress', 'completed', 'cancelled'] as const;
const FLEET_TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

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

    // Bound content length per type so a caller can't store arbitrarily large
    // text blobs (matches the limits enforced by the dedicated POST/PATCH routes).
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }
    const MAX_CONTENT: Record<string, number> = { personality: 8000, directive: 2000, knowledge: 2000 };
    const max = MAX_CONTENT[type];
    if (max && content.length > max) {
      return res.status(400).json({ error: `content must be ${max} characters or less.` });
    }

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
  } catch (e: any) { log.error("Failed to load knowledge", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load knowledge" }); }
});

app.post("/api/knowledge", authenticateUser, rateLimiters.knowledgeRateLimiter, async (req: any, res: any) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(KnowledgeSchema, {
      content: req.body.content
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    if (!validation.data) throw new Error('Validation data missing');

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
    dispatchWebhook(req.user.id, "knowledge_updated", {
      action: "created", id: data.id, agent_id, preview: content.slice(0, 200),
    }).catch(() => {});
    res.json({
      knowledge: {
        ...data,
        agent_name: agent.name,
        agent_archetype: agent.archetype,
      },
    });
  } catch (e: any) { log.error("Failed to create", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to create" }); }
});

app.patch("/api/knowledge/:id", authenticateUser, rateLimiters.knowledgeRateLimiter, async (req: any, res: any) => {
  try {
    // Validate input using Zod schema
    const validation = parseFormData(KnowledgeSchema, {
      content: req.body.content
    });

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", errors: validation.errors });
    }
    if (!validation.data) throw new Error('Validation data missing');

    const content = validation.data.content;
    const { data, error } = await db.from("wireline_knowledge")
      .update({ content: content.slice(0, 8000) })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("id, agent_id, content, created_at")
      .single();
    if (error) throw error;
    dispatchWebhook(req.user.id, "knowledge_updated", {
      action: "updated", id: data.id, agent_id: data.agent_id, preview: content.slice(0, 200),
    }).catch(() => {});
    res.json({ knowledge: data });
  } catch (e: any) { log.error("Failed to update", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to update" }); }
});

app.delete("/api/knowledge/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from("wireline_knowledge")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    dispatchWebhook(req.user.id, "knowledge_updated", {
      action: "deleted", id: req.params.id,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e: any) { log.error("Failed to delete", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to delete" }); }
});

// ==========================================
// 1.8 CAMPAIGN MANAGER
// ==========================================

// Campaign analytics — outcome breakdown, avg duration, cost summary.

// Launch a campaign — dial all queued leads sequentially (fire-and-forget
// per lead; we respond immediately with a count and let calls resolve async).
const CAMPAIGN_DIAL_SPACING_MS = 3_000; // 3-second gap to avoid Vapi rate limits
// MAX_BATCH_SCORE_LIMIT moved to src/lib/qa-constants.ts

// Retry all failed leads in a campaign.

// Stop a running campaign — sets status back to 'paused' so the async
// loop's inter-lead status check will halt it cleanly within one dial cycle.

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

    if (error && error.code !== 'PGRST116' && error.code !== 'PGRST205') throw error; // PGRST116 = not found, PGRST205 = table not in schema cache

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
    const {
      vapi_phone_number_id,
      voice_llm_provider,
      voice_llm_model,
      retention_days,
      crm_type,
      twilio_messaging_enabled,
      twilio_lookup_enabled,
      twilio_manager_alerts_enabled,
      twilio_messaging_service_sid,
      twilio_sms_from_number,
      twilio_whatsapp_from_number,
      twilio_manager_alert_number,
    } = req.body;

    // Build patch with only the fields the caller is allowed to set.
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (vapi_phone_number_id !== undefined) patch.vapi_phone_number_id = vapi_phone_number_id;
    if (voice_llm_provider !== undefined) patch.voice_llm_provider = voice_llm_provider;
    if (voice_llm_model !== undefined) patch.voice_llm_model = voice_llm_model;
    if (retention_days !== undefined) {
      const days = Number(retention_days);
      if (!Number.isInteger(days) || days < 90) {
        return res.status(400).json({ error: "retention_days must be an integer >= 90" });
      }
      patch.retention_days = days;
    }
    if (crm_type !== undefined) {
      const allowed = ["salesforce", "hubspot", "none", ""];
      if (!allowed.includes(crm_type)) {
        return res.status(400).json({ error: `crm_type must be one of: ${allowed.join(", ")}` });
      }
      patch.crm_type = crm_type || null;
    }
    if (twilio_messaging_enabled !== undefined) patch.twilio_messaging_enabled = !!twilio_messaging_enabled;
    if (twilio_lookup_enabled !== undefined) patch.twilio_lookup_enabled = !!twilio_lookup_enabled;
    if (twilio_manager_alerts_enabled !== undefined) patch.twilio_manager_alerts_enabled = !!twilio_manager_alerts_enabled;

    const normalizeOptionalText = (value: unknown, field: string, max: number) => {
      if (value === undefined) return { present: false, value: undefined as string | null | undefined };
      if (value === null || value === "") return { present: true, value: null };
      if (typeof value !== "string") return { present: true, error: `${field} must be a string` };
      const trimmed = value.trim();
      if (trimmed.length > max) return { present: true, error: `${field} must be ${max} characters or less` };
      return { present: true, value: trimmed || null };
    };

    for (const [field, value, max] of [
      ["twilio_messaging_service_sid", twilio_messaging_service_sid, 64],
      ["twilio_sms_from_number", twilio_sms_from_number, 40],
      ["twilio_whatsapp_from_number", twilio_whatsapp_from_number, 60],
      ["twilio_manager_alert_number", twilio_manager_alert_number, 40],
    ] as const) {
      const normalized = normalizeOptionalText(value, field, max);
      if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
      }
      if (normalized.present) {
        patch[field] = normalized.value;
      }
    }

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
      changes: sanitizeForAudit(req.body) as Record<string, any> | undefined,
      ip: req.ip
    }).catch((err: any) => log.warn('audit log failed', { error: getErrorMessage(err) }));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GDPR / data-export: POST /api/account/export
// Exports all user-owned data from every wireline_* table as a JSON file.
// Returns a download URL or the JSON directly depending on implementation.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/account/export", authenticateUser, async (req: any, res: any) => {
  const uid = req.user.id;
  try {
    log.info("account export requested", { uid });

    // List of all tables to export (same order as delete for consistency)
    const tables = [
      "wireline_settings",
      "wireline_agents",
      "wireline_directives",
      "wireline_knowledge",
      "wireline_personality",
      "wireline_agent_lessons",
      "wireline_appointments",
      "wireline_call_logs",
      "wireline_email_accounts",
      "wireline_email_threads",
      "wireline_email_messages",
      "wireline_fleet_tasks",
      "wireline_phone_numbers",
      "wireline_outbound_leads",
      "wireline_outbound_campaigns",
      "wireline_signal_presence",
      "wireline_audit_log",
      "wireline_webhooks",
      "wireline_webhook_deliveries",
      "wireline_spend_budgets",
      "wireline_spend_alerts",
      "wireline_intake_keys",
      "wireline_subscriptions",
      "wireline_stripe_events",
      "wireline_dnc_list",
      "wireline_user_preferences",
      "wireline_onboarding_progress",
      "wireline_consent_log",
      "wireline_quota_limits",
      "wireline_quota_usage",
    ];

    const exportData: Record<string, any[]> = {};
    let totalRows = 0;

    // Collect all user data from each table
    for (const table of tables) {
      const { data, error } = await (db as any)
        .from(table)
        .select("*")
        .eq("user_id", uid);

      if (error) {
        log.warn(`account export: ${table} query failed`, { error: error.message });
        exportData[table] = [];
      } else {
        exportData[table] = data || [];
        totalRows += (data || []).length;
      }
    }

    // Add metadata
    const exportPackage = {
      metadata: {
        user_id: uid,
        email: req.user.email || "unknown",
        exported_at: new Date().toISOString(),
        total_rows: totalRows,
        wireline_version: "1.0.0",
      },
      tables: exportData,
    };

    log.info("account export completed", { uid, totalRows });

    // Return as JSON download
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wireline-account-export-${uid.substring(0, 8)}-${Date.now()}.json"`
    );
    res.status(200).json(exportPackage);
  } catch (err: any) {
    log.error("account export failed", { uid, error: getErrorMessage(err) });
    res.status(500).json({ error: "Account export failed. Please contact support." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GDPR / data-deletion: DELETE /api/user/account
// Permanently erases all user-owned rows from every wireline_* table and then
// deletes the Supabase auth record.  Requires the authenticated user to confirm
// their intent by passing { confirm: "DELETE MY ACCOUNT" } in the body.
//
// ⚠️  WARNING: This is an IMMEDIATE hard delete with NO grace period.
// ⚠️  Operators MUST call POST /api/account/export FIRST to back up user data.
// ─────────────────────────────────────────────────────────────────────────────
// Data Retention: POST /api/account/purge-old-data
// Enqueues an on-demand data-retention purge job for the authenticated tenant.
// Useful for GDPR "right to erasure" requests where the user wants old data
// purged immediately rather than waiting for the nightly scheduler.
//
// The actual deletion runs asynchronously in the job worker via the Postgres
// function wireline_purge_old_data(). Minimum retention is 90 days.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/account/purge-old-data", authenticateUser, jobsRateLimit, async (req: any, res: any) => {
  const uid = req.user.id;
  try {
    const { data: settings } = await db
      .from("wireline_settings")
      .select("retention_days")
      .eq("user_id", uid)
      .maybeSingle();
    const retentionDays =
      typeof (settings as { retention_days?: number } | null)?.retention_days === "number"
        ? (settings as { retention_days: number }).retention_days
        : 365;
    const result = await enqueue(db, {
      userId: uid,
      type: "purge_old_data",
      payload: { user_id: uid, retention_days: retentionDays },
      maxAttempts: 3,
    });
    if (!result.ok) {
      log.error("Failed to enqueue purge_old_data job", { user_id: uid, error: result.error });
      return res.status(500).json({ error: "Failed to schedule purge job" });
    }
    log.info("purge_old_data job enqueued on demand", { user_id: uid, retention_days: retentionDays, jobId: result.jobId });
    res.json({ success: true, retention_days: retentionDays, job_id: result.jobId });
  } catch (err: any) {
    log.error("POST /api/account/purge-old-data failed", { error: getErrorMessage(err), user_id: uid });
    res.status(500).json({ error: "Failed to schedule purge job" });
  }
});

// ⚠️  Recovery after deletion requires restoring from Supabase PITR backup.
//
// TODO (Phase 1.5): Implement 30-day soft-delete grace period:
//   1. Add wireline_deletion_queue table (user_id, requested_at, execute_at)
//   2. On DELETE, insert row with execute_at = now() + 30 days
//   3. Mark auth user as "pending_deletion" (custom claim or separate table)
//   4. Add cron job to purge users after execute_at passes
//   5. Add POST /api/account/cancel-deletion to abort within grace period
// ─────────────────────────────────────────────────────────────────────────────
app.delete("/api/user/account", authenticateUser, async (req: any, res: any) => {
  const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";
  if (req.body?.confirm !== CONFIRMATION_PHRASE) {
    return res.status(400).json({
      error: `Send { "confirm": "${CONFIRMATION_PHRASE}" } to confirm permanent deletion.`,
      warning: "This is an immediate hard delete. Export your data first via POST /api/account/export.",
    });
  }
  const uid = req.user.id;
  try {
    // Delete all user-owned rows across every wireline_* table.  Order matters
    // for FKs: child tables first, then parents.
    const tables = [
      "wireline_audit_log",
      "wireline_signal_presence",
      "wireline_fleet_tasks",
      "wireline_webhook_deliveries",
      "wireline_webhooks",
      "wireline_intake_keys",
      "wireline_agent_lessons",
      "wireline_directives",
      "wireline_knowledge",
      "wireline_personality",
      "wireline_email_messages",
      "wireline_email_threads",
      "wireline_email_accounts",
      "wireline_call_logs",
      "wireline_outbound_leads",
      "wireline_outbound_campaigns",
      "wireline_appointments",
      "wireline_dnc_list",
      "wireline_phone_numbers",
      "wireline_agents",
      "wireline_spend_alerts",
      "wireline_spend_budgets",
      "wireline_stripe_events",
      "wireline_subscriptions",
      "wireline_onboarding_progress",
      "wireline_user_preferences",
      "wireline_settings",
    ];
    for (const table of tables) {
      const { error } = await (db as any).from(table).delete().eq("user_id", uid);
      if (error) log.warn(`account deletion: ${table} error`, { error: error.message });
    }

    // Delete the Supabase auth record last — once gone the user is fully
    // unauthenticated and cannot make further requests.
    const adminClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error: authErr } = await adminClient.auth.admin.deleteUser(uid);
    if (authErr) {
      log.error("account deletion: auth.admin.deleteUser failed", { uid, error: authErr.message });
      return res.status(500).json({ error: "Data deleted but auth record removal failed — contact support." });
    }

    void auditLogger.logAccountDeletion({ userId: uid, tablesTouched: tables, ip: req.ip }).catch(() => {});
    res.status(204).send();
  } catch (err: any) {
    log.error("account deletion failed", { uid, error: getErrorMessage(err) });
    res.status(500).json({ error: "Account deletion failed. Please contact support." });
  }
});

app.get("/api/outbound", authenticateUser, async (req: any, res: any) => {
  try {
    const limitRaw = parseInt(req.query.limit as string);
    const offsetRaw = parseInt(req.query.offset as string);
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 100 : limitRaw), 500);
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
// placeOutboundCall and buildOutboundFirstMessage moved to ./src/lib/vapi-client

app.post("/api/outbound/dial", authenticateUser, dialRateLimiter, async (req: any, res: any) => {
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

    // TCPA pre-call consent gate.
    const tcpaDecision = evaluateOutboundConsent({
      phone: customerNumber,
      is_internal_dnc: false, // already checked above
      is_marketing_call: true,
      has_express_written_consent: false,
    });
    if (!tcpaDecision.allowed) {
      log.warn("Outbound dial blocked by TCPA consent gate", { customerNumber, abort_reason: tcpaDecision.abort_reason });
      return res.status(403).json({ error: tcpaDecision.disclosure_script || "Call blocked by TCPA consent rules.", tcpaBlocked: true, tcpa: tcpaDecision });
    }

    // Per-tenant voice-minute quota check.
    const quotaDecision = await quotaTracker.checkAndIncrement(req.user.id, 'voice_minutes_daily', 0);
    if (!quotaDecision.allowed) {
      Object.entries(quotaRejectionHeaders(quotaDecision)).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(429).json({ error: "Daily voice-minute quota exceeded.", code: "QUOTA_VOICE", quota: quotaDecision });
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
      const geminiRaw = JSON.parse(geminiRes.response.text() || "{}");
      const geminiResult = GeminiAgentExtractionSchema.safeParse(geminiRaw);
      if (geminiResult.success) {
        parsed = geminiResult.data;
      } else {
        log.warn("Gemini agent extraction response did not match expected schema", { issues: geminiResult.error.issues });
        parsed = {
          directives: [],
          knowledge: [],
          personality: "",
        };
      }
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

// Google & Microsoft OAuth routes moved to src/routes/oauth-routes.ts
// Microsoft helpers moved to src/lib/oauth-helpers.ts
//  Calendar & Drive Integration Routes
//  Google Calendar sync, Outlook Calendar sync, Google Drive → Knowledge ingestion
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/calendar/sync
 *  Triggers a sync of all connected Google + Outlook calendars for the
 *  authenticated user into wireline_calendar_events. Safe to call repeatedly —
 *  events are upserted on (account_id, external_event_id). */
app.post("/api/calendar/sync", authenticateUser, async (req: any, res: any) => {
  const userId: string = req.user.id;
  try {
    const [googleResult, outlookResult] = await Promise.allSettled([
      syncGoogleCalendar(userId),
      syncOutlookCalendar(userId),
    ]);
    res.json({
      google:  googleResult.status === 'fulfilled'  ? googleResult.value  : { status: 'error', error: (googleResult.reason as Error)?.message },
      outlook: outlookResult.status === 'fulfilled' ? outlookResult.value : { status: 'error', error: (outlookResult.reason as Error)?.message },
    });
  } catch (e: any) {
    log.error("Calendar sync failed", { userId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Calendar sync failed." });
  }
});

/** GET /api/calendar/events
 *  Returns upcoming calendar events for the authenticated user (next 30 days). */
app.get("/api/calendar/events", authenticateUser, async (req: any, res: any) => {
  const userId: string = req.user.id;
  try {
    const { data, error } = await db
      .from("wireline_calendar_events")
      .select("id, title, start_time, end_time, status, account_id")
      .eq("user_id", userId)
      .gte("end_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(100);
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (e: any) {
    log.error("Calendar events fetch failed", { userId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch calendar events." });
  }
});

/** GET /api/calendar/accounts
 *  Returns connected calendar accounts for the authenticated user. */
app.get("/api/calendar/accounts", authenticateUser, async (req: any, res: any) => {
  const userId: string = req.user.id;
  try {
    const { data, error } = await db
      .from("wireline_calendar_accounts")
      .select("id, email_address, provider, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ accounts: data || [] });
  } catch (e: any) {
    log.error("Calendar accounts fetch failed", { userId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch calendar accounts." });
  }
});

/** POST /api/drive/ingest
 *  Fetches recent Google Drive documents, extracts knowledge chunks via
 *  Gemini 2.5 Flash, and upserts them into wireline_agent_lessons for the
 *  specified agent. */
app.post("/api/drive/ingest", authenticateUser, claudeRateLimiter, async (req: any, res: any) => {
  const userId: string = req.user.id;
  const { agentId } = req.body;
  if (!agentId || typeof agentId !== 'string') {
    return res.status(400).json({ error: "agentId is required." });
  }
  try {
    // Verify agent belongs to user
    const { data: agent, error: agentErr } = await db
      .from("wireline_agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (agentErr || !agent) return res.status(404).json({ error: "Agent not found." });

    const result = await syncGoogleDriveToKnowledge(userId, agentId);
    void auditLogger.logDataModification('settings.knowledge_base_updated', { userId, resource: 'google_drive_ingest', metadata: result });
    res.json(result);
  } catch (e: any) {
    log.error("Google Drive ingest failed", { userId, agentId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Drive knowledge ingest failed." });
  }
});

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
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 100 : limitRaw), 500);
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
            dispatchWebhook(userId, "email.received", {
              thread_id: existingThread!.id, provider: "microsoft", from: snippet.slice(0, 100),
            }).catch(() => {});

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
                dispatchWebhook(userId, "appointment.booked", {
                  id: data.id, customer_name: args.customer_name, date: args.date, time: args.time,
                  service_type: args.service_type, source: "email_ai",
                }).catch(() => {});
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
           access_token: decryptSecret(account.access_token),
           refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
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
           dispatchWebhook(userId, "email.received", {
             thread_id: existingThread!.id, provider: "google", from: snippet.slice(0, 100),
           }).catch(() => {});

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
               dispatchWebhook(userId, "appointment.booked", {
                 id: data.id, customer_name: args.customer_name, date: args.date, time: args.time,
                 service_type: args.service_type, source: "email_ai",
               }).catch(() => {});
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
             } catch(e: any) {
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
               } catch (sendErr: any) {
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
              } catch(handoffErr: any) {
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
                 const sRaw = JSON.parse(sRes.response.text() || "{}");
                 const sParsed = GeminiEmailScoreSchema.safeParse(sRaw);
                 if (sParsed.success) {
                   score = sParsed.data.score;
                   label = sParsed.data.label;
                 } else {
                   log.warn("Gemini email score response did not match expected schema", { issues: sParsed.error.issues });
                 }
              }
              await db.from('wireline_email_threads').update({
                 lead_score: score, intent_label: label,
              }).eq('id', existingThread!.id);
           } catch(e: any) {
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
      if (!validation.data) throw new Error('Validation data missing');
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
           access_token: decryptSecret(account.access_token),
           refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
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
     if (!validation.data) throw new Error('Validation data missing');
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

// ==========================================
// 1.9 CONSOLIDATED ACTIVITY FEED (TRIGGER LOG)
// ==========================================

// ==========================================
// 1.10 SUPERVISED AGENT TUNING
// ==========================================

// Per-agent performance stats — call count, avg score, total minutes, sentiment breakdown.

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

// ==========================================
//  CLAUDE BRAIN — advanced agent capabilities
// ==========================================

// claudeErr is imported from ./src/lib/claude-response-helpers
// (kept as re-export for backward compat with any remaining server.ts callers)
export { claudeErr };

// withAudit moved to ./src/middleware/audit-middleware


// Auto-instrument every Claude path + the Claude-backed insights paths.
// /status is unauthenticated and doesn't make Claude calls — let it through.
// Otherwise: authenticate → spend hard-cap → audit context → handler.
// Hard-cap is checked BEFORE the audit context is established because
// blocked requests don't make Claude calls so they don't need auditing.
app.use("/api/claude", (req: any, res: any, next: any) => {
  if (req.path === "/status") return next();
  return authenticateUser(req, res, () =>
    enforce24hSpendCap(req, res, () =>
      enforceSpendCap(req, res, () =>
        enforceClaudeDailyTokenQuota(req, res, () => withAudit("claude")(req, res, next)),
      ),
    ),
  );
});

// Status / health
app.get("/api/claude/status", authenticateUser, async (_req: any, res: any) => {
  res.json({
    available: claudeBrain.isClaudeAvailable(),
    model: claudeBrain.CLAUDE_MODEL_DEFAULT,
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
        db.from("wireline_knowledge").select("content").eq("agent_id", agentId).eq("user_id", req.user.id).limit(500),
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
      const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).eq("user_id", req.user.id).order("created_at", { ascending: true }).limit(100);
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
    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).eq("user_id", req.user.id).order("created_at", { ascending: true }).limit(100);
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
        db.from("wireline_knowledge").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).limit(500),
        db.from("wireline_directives").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).order("priority", { ascending: false }).limit(500),
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

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).eq("user_id", req.user.id).order("created_at", { ascending: true }).limit(100);

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

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).eq("user_id", req.user.id).order("created_at", { ascending: true }).limit(100);

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
    if (!validation.data) throw new Error('Validation data missing');

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

// Column projection used by every webhook list/read endpoint. Notably
// EXCLUDES `secret` and `secret_encrypted` — those must never leave the
// server. `secret_last_four` is safe for UI display.
const WEBHOOK_PUBLIC_COLUMNS =
  "id, user_id, name, url, events, active, last_triggered_at, last_status, last_error, delivery_count, created_at, secret_last_four";

app.get("/api/webhooks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from("wireline_webhooks")
      .select(WEBHOOK_PUBLIC_COLUMNS).eq("user_id", req.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ webhooks: data || [], available_events: WEBHOOK_EVENTS });
  } catch (e: any) { log.error("Failed to load webhooks", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load webhooks" }); }
});

app.post("/api/webhooks", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: any, res: any) => {
  try {
    const { name, url, events, secret, active } = req.body;
    if (!name || !url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "name, url, and events[] required." });
    }
    const urlErr = await validateWebhookUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });
    const bad = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (bad.length) return res.status(400).json({ error: `Unknown events: ${bad.join(", ")}` });
    let plaintextSecret: string | null = null;
    if (secret !== undefined && secret !== null && secret !== "") {
      if (String(secret).length < 16) {
        return res.status(400).json({ error: "Webhook secret must be at least 16 characters." });
      }
      plaintextSecret = String(secret);
    }
    // Fail-closed when the vault is misconfigured — we will NOT silently
    // fall back to plaintext storage even if the column would accept it.
    if (plaintextSecret && !isVaultConfigured()) {
      return res.status(503).json({
        error: "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
        code: "VAULT_UNCONFIGURED",
      });
    }
    const row: Record<string, unknown> = {
      user_id: req.user.id,
      name,
      url,
      events,
      active: active ?? true,
    };
    if (plaintextSecret) {
      row.secret_encrypted = encryptSecret(plaintextSecret);
      row.secret_last_four = lastFour(plaintextSecret);
      // Defense-in-depth: also clear any legacy plaintext column on
      // create. The column still exists for backfill compatibility.
      row.secret = null;
    }

    const { data, error } = await db.from("wireline_webhooks").insert(row)
      .select(WEBHOOK_PUBLIC_COLUMNS).single();
    if (error) throw error;
    void auditLogger.logWebhook('created', {
      userId: req.user.id, webhookId: data.id, url: data.url, events: data.events, active: data.active, ip: req.ip,
    }).catch(() => {});
    res.json({ webhook: data });
  } catch (e: any) { log.error("Failed to create webhook", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to create webhook" }); }
});

app.patch("/api/webhooks/:id", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: any, res: any) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "url", "events", "active"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.url) { const urlErr = await validateWebhookUrl(patch.url as string); if (urlErr) return res.status(400).json({ error: urlErr }); }
    // Secret rotation goes through the encrypted column ONLY.
    if (req.body.secret !== undefined) {
      const s = req.body.secret;
      if (s === null || s === "") {
        patch.secret_encrypted = null;
        patch.secret_last_four = null;
        patch.secret = null;
      } else {
        if (String(s).length < 16) {
          return res.status(400).json({ error: "Webhook secret must be at least 16 characters." });
        }
        if (!isVaultConfigured()) {
          return res.status(503).json({
            error: "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
            code: "VAULT_UNCONFIGURED",
          });
        }
        patch.secret_encrypted = encryptSecret(String(s));
        patch.secret_last_four = lastFour(String(s));
        patch.secret = null;
      }
    }
    if (patch.events) {
      if (!Array.isArray(patch.events) || (patch.events as string[]).some((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
        return res.status(400).json({ error: "Invalid events." });
      }
    }
    const { data, error } = await db.from("wireline_webhooks").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id).select(WEBHOOK_PUBLIC_COLUMNS).single();
    if (error) throw error;
    void auditLogger.logWebhook('updated', {
      userId: req.user.id, webhookId: data.id, url: data.url, events: data.events, active: data.active, ip: req.ip,
    }).catch(() => {});
    res.json({ webhook: data });
  } catch (e: any) { log.error("Failed to update", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to update" }); }
});

app.delete("/api/webhooks/:id", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: any, res: any) => {
  try {
    await db.from("wireline_webhooks").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    void auditLogger.logWebhook('deleted', {
      userId: req.user.id, webhookId: req.params.id, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e: any) { log.error("Failed to delete", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to delete" }); }
});

app.post("/api/webhooks/:id/test", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: any, res: any) => {
  try {
    const { data: hook } = await db.from("wireline_webhooks").select("id").eq("id", req.params.id).eq("user_id", req.user.id).single();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    await dispatchWebhook(req.user.id, "task.created", {
      test: true, message: "This is a test ping from Wireline.", at: new Date().toISOString(),
    });
    void auditLogger.logWebhook('tested', {
      userId: req.user.id, webhookId: req.params.id, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, message: "Test dispatched. Check the URL." });
  } catch (e: any) { log.error("Test failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Test failed" }); }
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
  } catch (e: any) { log.error("Failed to load deliveries", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load deliveries" }); }
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
  } catch (e: any) { log.error("Retry failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Retry failed" }); }
});

app.delete("/api/webhooks/deliveries/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    await db.from("wireline_webhook_deliveries")
      .delete().eq("id", id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { log.error("Discard failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Discard failed" }); }
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

// Per-key distributed rate limit. Public endpoint, so a single noisy
// caller can't drain the operator's Vapi spend or hammer Supabase.
// Rolling window: ≤ 60 requests per 60s per intake key.
const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;

type IntakeRateCheck =
  | { ok: true }
  | { ok: false; status: 429; retry_after_s: number; code: "INTAKE_RATE_LIMIT"; error: string }
  | { ok: false; status: 503; code: "RATE_LIMITER_UNAVAILABLE"; error: string };

function isIntakeRateFailure(result: IntakeRateCheck): result is Exclude<IntakeRateCheck, { ok: true }> {
  return !result.ok;
}

async function checkIntakeRate(keyId: string): Promise<IntakeRateCheck> {
  const limiter = distributedLimiterStatus();
  if (!limiter.ok) {
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error: limiter.reason || "Distributed rate limiter is unavailable.",
    };
  }

  try {
    const result = await rateLimit(keyId, {
      bucket: "public_intake",
      windowMs: INTAKE_RATE_WINDOW_MS,
      max: INTAKE_RATE_MAX,
      failClosedOnError: true,
    });
    if (result.allowed) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil(result.resetMs / 1000));
    return {
      ok: false,
      status: 429,
      retry_after_s: retryAfter,
      code: "INTAKE_RATE_LIMIT",
      error: `Rate limit exceeded for this intake key (${INTAKE_RATE_MAX}/min). Retry in ${retryAfter}s.`,
    };
  } catch (err) {
    log.error("Intake rate limiter failed", { keyId, error: getErrorMessage(err) });
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error: "Distributed rate limiter is unavailable for intake traffic. Configure Upstash Redis or enable WIRELINE_ALLOW_INMEMORY_RATE_LIMIT for single-node deployments.",
    };
  }
}

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

    const rate = await checkIntakeRate(key.id);
    if (isIntakeRateFailure(rate)) {
      if (rate.status === 429) res.set("Retry-After", String(rate.retry_after_s));
      return res.status(rate.status).json({
        error: rate.error,
        code: rate.code,
        ...(rate.status === 429 ? { retry_after_s: rate.retry_after_s } : {}),
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
    res.status(500).json({ error: "Intake failed" });
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
      const r = await checkIntakeRate(key.id);
      if (isIntakeRateFailure(r)) {
        if (r.status === 429) {
          res.set("Retry-After", String(r.retry_after_s));
          return res.status(429).json({
            error: `Rate limit would be exceeded by this batch (${INTAKE_RATE_MAX}/min). Retry in ${r.retry_after_s}s.`,
            code: r.code,
            retry_after_s: r.retry_after_s,
            accepted_so_far: i,
          });
        }
        return res.status(r.status).json({ error: r.error, code: r.code });
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
    res.status(500).json({ error: "Bulk intake failed" });
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
  } catch (e: any) { log.error("Failed to load keys", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load keys" }); }
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
    void auditLogger.logIntakeKey('created', {
      userId: req.user.id, keyId: data.id, keyPrefix: data.key_prefix, keyName: data.name, ip: req.ip,
    }).catch(() => {});
    // Plaintext is returned ONCE — we never store or expose it again.
    res.json({ key: data, plaintext });
  } catch (e: any) { log.error("Failed to create key", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to create key" }); }
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
    void auditLogger.logIntakeKey('updated', {
      userId: req.user.id, keyId: data.id, keyPrefix: data.key_prefix, keyName: data.name, ip: req.ip,
    }).catch(() => {});
    res.json({ key: data });
  } catch (e: any) { log.error("Failed to update key", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to update key" }); }
});

app.delete("/api/intake/keys/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from("wireline_intake_keys").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    void auditLogger.logIntakeKey('deleted', {
      userId: req.user.id, keyId: req.params.id, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e: any) { log.error("Failed to delete key", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to delete key" }); }
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
    access_token: decryptSecret(account.access_token),
    refresh_token: account.refresh_token ? decryptSecret(account.refresh_token) : null,
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
// Lock TTL slightly longer than one tick so the key expires if the process
// crashes without releasing it. On single-instance deploys the in-process
// boolean is enough; the Redis lock is only needed for multi-instance.
const DAILY_BRIEF_LOCK_TTL_S = Math.ceil((DAILY_BRIEF_TICK_MS / 1000) * 1.5);
const DAILY_BRIEF_LOCK_KEY = "wireline:sched:daily_brief:lock";
let _briefSchedRunning = false;

async function acquireBriefLock(): Promise<boolean> {
  if (isRedisConfigured()) {
    try {
      const { Redis: UpstashRedis } = await import("@upstash/redis");
      const r = new UpstashRedis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
      const result = await r.set(DAILY_BRIEF_LOCK_KEY, "1", { nx: true, ex: DAILY_BRIEF_LOCK_TTL_S });
      return result === "OK";
    } catch { /* fall through to in-process guard */ }
  }
  if (_briefSchedRunning) return false;
  _briefSchedRunning = true;
  return true;
}

async function releaseBriefLock(): Promise<void> {
  _briefSchedRunning = false;
  if (isRedisConfigured()) {
    try {
      const { Redis: UpstashRedis } = await import("@upstash/redis");
      const r = new UpstashRedis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
      await r.del(DAILY_BRIEF_LOCK_KEY);
    } catch { /* best-effort release */ }
  }
}

async function processScheduledDailyBriefs() {
  const locked = await acquireBriefLock();
  if (!locked) return;
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
    await releaseBriefLock();
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

// ────────────────────────────────────────────────────────────────────
//  Nightly data-retention TTL purge scheduler
//
//  Once per day (at ~02:00 UTC) this scheduler:
//    1. Queries wireline_settings for all tenants that have a non-null
//       retention_days value (default 365 days applies when NULL).
//    2. Enqueues one `purge_old_data` job per tenant, staggered by
//       60 s to avoid a thundering-herd of concurrent DB deletes.
//
//  The actual deletion runs inside handleJob() via the Postgres function
//  wireline_purge_old_data(p_user_id, p_retention_days). The function
//  enforces a minimum of 90 days to prevent accidental mass-deletes.
//
//  On Vercel, the /api/jobs/sweep cron (every 5 min) drains the queue
//  so the jobs will execute even in serverless environments.
// ────────────────────────────────────────────────────────────────────
const DATA_RETENTION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour
let lastPurgeScheduleDate = "";  // YYYY-MM-DD, prevents double-scheduling in the same day

async function scheduleNightlyPurgeJobs(): Promise<void> {
  const now = new Date();
  // Only schedule once per calendar day, during the 02:xx UTC hour window.
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  if (now.getUTCHours() !== 2) return;
  if (lastPurgeScheduleDate === dateKey) return;

  try {
    // Fetch all tenants (no user_id filter — this is an admin-level sweep)
    const { data: tenants, error } = await db
      .from("wireline_settings")
      .select("user_id, retention_days");
    if (error) {
      log.warn("Data retention scheduler: failed to fetch tenants", { error: error.message });
      return;
    }
    if (!tenants || tenants.length === 0) return;

    lastPurgeScheduleDate = dateKey;
    let enqueuedCount = 0;
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i] as { user_id: string; retention_days: number | null };
      if (!tenant.user_id) continue;
      const retentionDays = typeof tenant.retention_days === 'number' ? tenant.retention_days : 365;
      // Stagger jobs 60 s apart so they don't all hit the DB simultaneously.
      const runAt = new Date(now.getTime() + i * 60_000);
      const result = await enqueue(db, {
        userId: tenant.user_id,
        type: 'purge_old_data',
        payload: { user_id: tenant.user_id, retention_days: retentionDays },
        runAt,
        maxAttempts: 3,
      });
      if (result.ok) enqueuedCount++;
    }
    log.info("Data retention purge jobs scheduled", { date: dateKey, tenants: tenants.length, enqueued: enqueuedCount });
  } catch (err: any) {
    log.warn("Data retention scheduler error", { error: getErrorMessage(err) });
  }
}
setInterval(scheduleNightlyPurgeJobs, DATA_RETENTION_CHECK_INTERVAL_MS).unref?.();

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
  } catch (e: any) { log.error("Failed to load settings", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load settings" }); }
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
  } catch (e: any) { log.error("Failed to save settings", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to save settings" }); }
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
    res.status(500).json({ error: "Send failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  AUDIT LOG — token + cost visibility for every Claude call.
// ──────────────────────────────────────────────────────────

// Aggregate spend summary — powers the AI-Spend dashboard tab.

// Recent audit entries — for debugging + compliance trail.

// GET /api/audit/events — fetch audit events with filtering
// Handler bodies live in src/lib/audit-routes.ts so they can be unit-
// tested against an in-memory Supabase stub. The factory pattern lets
// us inject the live `db` / `auditLogger` / `log` singletons here.
const auditRouteDeps = { db, auditLogger, log };

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
    clearBudgetCache(req.user.id);
    res.json({ budget: data });
  } catch (e: any) { log.error("Failed to save budget", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to save budget" }); }
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
  } catch (e: any) { log.error("Failed to load spend status", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load spend status" }); }
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
    const [{ data: sub }, { count: agentCount }] = await Promise.all([
      db.from("wireline_subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at")
        .eq("user_id", req.user.id).maybeSingle(),
      db.from("wireline_agents").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
    ]);
    const planMeta = sub?.plan ? planById(sub.plan) : null;
    res.json({
      stripe_configured: stripeAvailable(),
      agent_count: agentCount ?? 0,
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
  } catch (e: any) { log.error("Failed to load status", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load status" }); }
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
    void auditLogger.logBilling('checkout_started', {
      userId: req.user.id, plan: plan.id, customerId, ip: req.ip,
    }).catch(() => {});
  } catch (e: any) {
    log.error("Checkout creation failed", { error: e?.message || String(e) });
    res.status(500).json({ error: "Checkout failed" });
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
    void auditLogger.logBilling('portal_opened', {
      userId: req.user.id, customerId: sub.stripe_customer_id, ip: req.ip,
    }).catch(() => {});
  } catch (e: any) {
    log.error("Portal session failed", { error: e?.message || String(e) });
    res.status(500).json({ error: "Portal failed" });
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
    void auditLogger.logDataOperation('export', {
      userId: req.user.id,
      resourceType: req.params.type,
      recordCount: (data || []).length,
      ip: req.ip,
    }).catch(() => {});
    res.send(rowsToCsv(data || [], def.columns));
  } catch (e: any) {
    res.status(500).json({ error: "Export failed" });
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
    // SSRF protection: block private/internal addresses (same guard used for webhooks).
    if (isSsrfUrl(url)) {
      return res.status(400).json({ error: "url targets a private or internal address and cannot be crawled." });
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
    dispatchWebhook(req.user.id, "knowledge_updated", {
      action: "bulk_created", agent_id: agentId, count: rows.length,
    }).catch(() => {});
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
      db.from("wireline_agents").select("id, name").eq("user_id", req.user.id).limit(500),
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

// cachedInsight and setCachedInsight imported from ./src/lib/insights-cache
export { cachedInsight, setCachedInsight };
// Periodic eviction is already wired inside insights-cache.ts (self-contained).

// Conversion funnel — calls → connected → qualified → booked → completed.

// Hour-of-day × day-of-week heatmap of call volume + lead score.

// Per-agent leaderboard.

// Topic clusters (Claude-powered, cached 1h per user).

// Failure modes (Claude-powered, cached 1h per user).

// Daily brief (Claude-powered, cached per-day).
// computeDailyBrief moved to ./src/lib/daily-brief


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
    // Match the limit enforced by POST/PATCH /api/knowledge so promoted entries
    // can't exceed what a normal knowledge insert would allow.
    if (content.length > 2000) {
      return res.status(400).json({ error: "Content must be 2000 characters or less." });
    }

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
    const norm = normalizePhoneTail(number);
    if (!norm) return res.status(400).json({ error: "Invalid phone number." });

    // Match: exact, or anything ending in the same last-10-digits.
    const [callsRes, leadsRes, apptsRes] = await Promise.all([
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

    res.json(buildContactProfile({
      number,
      normalized: norm,
      calls:  callsRes.data  || [],
      leads:  leadsRes.data  || [],
      appts:  apptsRes.data  || [],
    }));
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

// DNC routes moved to ./src/routes/compliance-routes.ts

// ==========================================
// QA SCORING — Claude-powered call quality
// ==========================================
// Score a call against a 5-dimension QA rubric (20 pts each = 100 total).
// QA routes moved to ./src/routes/qa-routes.ts
app.use("/api/qa", qaRouter);

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
  // Stop the job worker before closing.
  if (stopWorker) stopWorker();
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

// Quota routes moved to ./src/routes/quota-routes.ts
app.use("/api/quotas", quotaRouter);

// ──────────────────────────────────────────────────────────────────────────────
// Job routes moved to ./src/routes/job-routes.ts
app.use("/api/jobs", jobRouter);
app.use(soc2Router);

// TCPA consent check moved to ./src/routes/compliance-routes.ts
app.use("/api", complianceRouter);

// Public OpenAPI 3.1 spec — see ./src/routes/openapi-routes.ts.
// Exposes GET /api/openapi.json so partners, SDK generators, and
// AI-agent frameworks can discover the public surface area.
app.use("/api", openapiRouter);

export { app };

// Vercel sets VERCEL=1 automatically in all serverless function environments.
if (process.env.VERCEL !== '1') {
  startServer();
}
