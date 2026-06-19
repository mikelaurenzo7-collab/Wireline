// `dotenv/config` runs the side-effect import BEFORE any of the imports
// below are evaluated. ESM hoists `import` statements above the module body,
// so `dotenv.config()` in the body would load AFTER every other imported
// module's top-level code — meaning modules that read `process.env.*` at
// import time (e.g. `src/lib/auth-service.ts` for `INTERNAL_JWT_SECRET`)
// would never see values declared only in `.env`. Using the side-effect
// import guarantees env is populated before any other import evaluates.
import "dotenv/config";
import "express-async-errors";

// Make `BigInt` JSON-serializable globally. Drizzle's `bigint({ mode: 'bigint' })`
// returns native BigInt values for ids on `callLogs`, `auditLog`,
// `outboundLeads`, `webhookDeliveries`, etc. Express's res.json() calls
// JSON.stringify, which throws `TypeError: Do not know how to serialize a
// BigInt` without this shim — every endpoint that returns one of those
// id columns would 500. Stringifying is safe for JSON consumers (the JS
// `Number` type can't represent ids above 2^53 anyway).
if (typeof (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function toJSON(this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}

import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "node:crypto";
import { db, IS_PROD, log } from "./src/lib/server-context";
import { bindRequestIdReader } from "./src/lib/server-logger";
import { getRequestId, runWithRequestContext } from "./src/lib/request-context";

bindRequestIdReader(getRequestId);
import { getErrorMessage } from "./src/lib/server-utils";
import { reportError } from "./src/lib/error-reporter";
import { DIRECTOR_REQUEST_TIMEOUT_MS } from "./src/lib/api";
import { AppError, formatErrorResponse } from "./src/lib/api-error";
import { normalizeApiErrorResponse } from "./src/middleware/normalize-api-error-response";
import { validateStartupEnv } from "./src/lib/startup";
import { buildCSP, buildConnectSrcs, generateCspNonce } from "./src/lib/csp";
import { isRedisConfigured, startMemoryCleanup } from "./src/lib/rate-limit";
import { installWebhookBodyParsers } from "./src/lib/body-parsers";
import { claudeRateLimiter } from "./src/middleware/api-rate-limits";
import { authenticateUser } from "./src/middleware/auth";
import { withAudit } from "./src/middleware/audit-middleware";
import { enforceSpendCap, enforce24hSpendCap } from "./src/lib/spend-guards";
import { initJobWorker } from "./src/lib/job-worker";
import { performanceMonitoring } from "./src/middleware/performance";
import { defaultApiTimeoutMiddleware, timeoutMiddleware } from "./src/middleware/timeout";
import { assertSameOrigin } from "./src/middleware/same-origin";

// Routers
import oauthRouter from "./src/routes/oauth";
import metaWebhookRouter from "./src/routes/meta-webhook-routes";
import publicStatsRouter from "./src/routes/public-stats-routes";
import vapiRouter from "./src/routes/vapi";
import agentRouter from "./src/routes/agent-routes";
import agentWorkspaceRouter from "./src/routes/agent-workspace-routes";
import directorRouter from "./src/routes/director-routes";
import supportRouter from "./src/routes/support-routes";
import voicesRouter from "./src/routes/voices-routes";
import pronunciationRouter from "./src/routes/pronunciation-routes";
import elevenlabsWebhookRouter from "./src/routes/webhooks-elevenlabs-routes";
import campaignRouter from "./src/routes/campaign-routes";
import fleetRouter from "./src/routes/fleet-routes";
import auditRouter from "./src/routes/audit-routes";
import insightsRouter from "./src/routes/insights-routes";
import goalsRouter from "./src/routes/goals-routes";
import complianceRouter from "./src/routes/compliance-routes";
import qaRouter from "./src/routes/qa-routes";
import quotaRouter from "./src/routes/quota-routes";
import jobRouter from "./src/routes/job-routes";
import soc2Router from "./src/routes/soc2-routes";
import healthRouter from "./src/routes/health-routes";
import voiceObservabilityRouter from "./src/routes/voice-observability-routes";
import openaiRealtimeRouter from "./src/routes/openai-realtime-routes";
import intakeRouter from "./src/routes/intake-routes";
import openapiRouter from "./src/routes/openapi-routes";
import claudeRouter from "./src/routes/claude-routes";
import billingRouter from "./src/routes/billing-routes";
import webhookRouter from "./src/routes/webhook-routes";
import contactRouter from "./src/routes/contact-routes";
import dashboardRouter from "./src/routes/dashboard-routes";
import dailyBriefRouter from "./src/routes/daily-brief-routes";
import knowledgeRouter from "./src/routes/knowledge-routes";
import carrierRouter from "./src/routes/carrier-routes";
import twilioWebhookRouter from "./src/routes/twilio-webhook";
import escalationRouter from "./src/routes/escalation-routes";
import adminMigrateRouter from "./src/routes/admin-migrate";
import adminVapiSyncRouter from "./src/routes/admin-vapi-sync-routes";
import adminSeedDemoRouter from "./src/routes/admin-seed-demo-routes";
import adminPurgeAccountsRouter from "./src/routes/admin-purge-accounts-routes";
import clerkAuthRouter from "./src/routes/clerk-auth-routes";
import cadenceRouter from "./src/routes/cadence-routes";
import pipelineRouter from "./src/routes/pipeline-routes";
import supervisorRouter from "./src/routes/supervisor-routes";
import smsRouter from "./src/routes/sms-routes";
import outboundRouter from "./src/routes/outbound-routes";
import mobileRouter from "./src/routes/mobile-routes";
import driveRouter from "./src/routes/drive-routes";
import emailRouter from "./src/routes/email-routes";
import emailUnsubscribeRouter from "./src/routes/email-unsubscribe-routes";
import calendarRouter from "./src/routes/calendar-routes";
import settingsRouter from "./src/routes/settings-routes";
import activationRouter from "./src/routes/activation-routes";
import adminOperatingRouter from "./src/routes/admin-operating-routes";
import integrationsCertRouter from "./src/routes/integrations-cert-routes";
import learningRouter from "./src/routes/learning-routes";
import teamRouter from "./src/routes/team-routes";
import authRouter from "./src/routes/auth-routes";

// Startup env validation
validateStartupEnv();

// Database connection validation — fail fast on bad POSTGRES_URL
import { sql as drizzleSql } from "drizzle-orm";
async function validateDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(drizzleSql`SELECT 1`);
    log.info("Database connected successfully");
    return true;
  } catch (error) {
    log.error("Database connection failed — check POSTGRES_URL", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust the proxy chain when running behind Vercel (1 hop). Without this:
//   - req.ip falls back to the immediate TCP peer (always Vercel's edge),
//     defeating per-IP rate limiting
//   - express-rate-limit logs a recurring ValidationError when it sees an
//     X-Forwarded-For header it can't authenticate
// Trust value `1` = trust exactly one upstream proxy (Vercel's edge).
if (IS_PROD) {
  app.set("trust proxy", 1);
}

// CORS setup
const corsAllowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (IS_PROD && corsAllowList.length === 0 && process.env.APP_URL) {
  corsAllowList.push(process.env.APP_URL);
}
app.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (!IS_PROD && corsAllowList.length === 0) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      log.warn("CORS rejected origin", { origin });
      // Return `false` (not an Error) so cors omits Access-Control-Allow-Origin
      // headers instead of crashing the request with HTTP 500. Same-origin
      // requests succeed because the browser doesn't need CORS headers for
      // those; cross-origin requests get blocked by the browser as intended.
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Vendor-webhook body parsers (Stripe / Meta / ElevenLabs / Twilio).
// MUST be installed before the global express.json() below — the JSON
// parser consumes the request stream, after which HMAC verification on
// the raw bytes fails silently. See src/lib/body-parsers.ts.
installWebhookBodyParsers(app);

// Scoped JSON body parsers
app.use("/api/claude/knowledge-from-document", express.json({ limit: "50mb" }));
app.use("/api/outbound/bulk", express.json({ limit: "16mb" }));
app.use(express.json({ limit: "1mb" }));

app.use(assertSameOrigin);

// Request correlation IDs — ALS scope so log.* auto-includes requestId
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const incoming = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64);
  const requestId = incoming && /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  runWithRequestContext(requestId, () => next());
});

app.use(normalizeApiErrorResponse);

// Security headers for API + SSR paths. Static shell assets get parallel headers
// from vercel.json; CSP here uses buildCSP() for dynamic connect-src in dev.
const CSP_CONNECT_SRCS = buildConnectSrcs(!IS_PROD);

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  const cspNonce = IS_PROD ? generateCspNonce() : undefined;
  res.locals.cspNonce = cspNonce;
  res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, cspNonce, CSP_CONNECT_SRCS));
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});

// Slow request logging
const SLOW_REQUEST_THRESHOLD_MS = 5_000;
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
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

// Rate limiter status logging
if (isRedisConfigured()) {
  log.info("Rate limiter: Upstash Redis (distributed)");
} else {
  log.info(
    IS_PROD
      ? "Rate limiter: in-memory (DANGER: single-node only)"
      : "Rate limiter: in-memory (dev mode)",
  );
}
startMemoryCleanup();

// Performance and Timeouts
app.use("/api", performanceMonitoring(2000));
// Per-user/IP rate limit on every Claude endpoint. Defence-in-depth against
// token leakage and runaway spend: a leaked auth token without this cap can
// drain the Anthropic budget in minutes. Mounted before timeout so 429s are
// returned cheaply without waiting on Anthropic.
app.use("/api/claude", claudeRateLimiter);
// Match claude-client.ts Anthropic SDK timeout (120s) so deep Opus recipes
// are not killed at 30s while the upstream call keeps billing.
app.use("/api/claude", timeoutMiddleware(120_000));
// Auth + spend recording before handlers — every Claude call must hit audit
// context and spend telemetry (blocking caps removed — overages bill via Stripe).
app.use("/api/claude", authenticateUser);
app.use("/api/claude", withAudit("claude"));
app.use("/api/claude", enforce24hSpendCap);
app.use("/api/claude", enforceSpendCap);
app.use("/api/emails", timeoutMiddleware(15_000));
app.use("/api/phone-numbers", timeoutMiddleware(10_000));
app.use("/api/campaigns", timeoutMiddleware(10_000));
// Director turns run web research + structured Claude (or Stitch UI generation).
// Stitch MCP generate (~150s) + asset polling can exceed the old 180s cap.
app.use("/api/director", timeoutMiddleware(DIRECTOR_REQUEST_TIMEOUT_MS));
app.use("/api", defaultApiTimeoutMiddleware);

// Global Router Mounting
app.use("/api/health", healthRouter);
app.use("/api", voiceObservabilityRouter);
app.use(openaiRealtimeRouter);
app.use("/api/quotas", quotaRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/intake", intakeRouter);
app.use("/api/qa", qaRouter);
app.use("/api/goals", goalsRouter);
app.use("/api", complianceRouter);
app.use("/api", openapiRouter);
app.use("/api", billingRouter);
app.use("/api/claude", claudeRouter);

// Domain Routers
app.use(contactRouter);
app.use(dashboardRouter);
app.use(dailyBriefRouter);
app.use(knowledgeRouter);
app.use(carrierRouter);
app.use(twilioWebhookRouter);
app.use(escalationRouter);
app.use(adminMigrateRouter);
app.use(adminOperatingRouter);
app.use(integrationsCertRouter);
app.use(learningRouter);
app.use(adminVapiSyncRouter);
app.use(adminSeedDemoRouter);
app.use(adminPurgeAccountsRouter);
app.use(clerkAuthRouter);
app.use(cadenceRouter);
app.use(pipelineRouter);
app.use(supervisorRouter);
app.use(smsRouter);
app.use(outboundRouter);
app.use(mobileRouter);
app.use(driveRouter);
app.use(emailRouter);
app.use(emailUnsubscribeRouter);
app.use(calendarRouter);
app.use(settingsRouter);
app.use(activationRouter);
app.use(vapiRouter);
app.use(agentRouter);
app.use(directorRouter);
app.use(agentWorkspaceRouter);
app.use(supportRouter);
app.use(voicesRouter);
app.use(pronunciationRouter);
app.use(elevenlabsWebhookRouter);
app.use(campaignRouter);
app.use(fleetRouter);
app.use(auditRouter);
app.use(insightsRouter);
app.use("/api/webhooks", webhookRouter);
app.use(soc2Router);
app.use(oauthRouter);
app.use(metaWebhookRouter);
app.use(publicStatsRouter);
app.use(teamRouter);
app.use(authRouter);

// 404 API catch-all (Must be mounted after all valid API routes and before global error handler)
app.use("/api", (req: express.Request, res: express.Response) => {
  const { status, body } = formatErrorResponse(
    AppError.notFound(`No API route matches ${req.method} ${req.path}`),
    res.locals?.requestId as string | undefined,
  );
  res.status(status).json(body);
});

// Global error handler — returns the standard { error, code, requestId } shape.
// AppError instances preserve their status and code; unknown errors are
// sanitized to prevent stack-trace / implementation-detail leaks.
app.use(
  (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = res.locals?.requestId as string | undefined;
    const errObj = err as { message?: string; stack?: string };
    const isServerError = !(err instanceof AppError) || (err as AppError).status >= 500;

    // Always log — but only log stack traces for actual server errors,
    // not for 4xx client errors the caller intentionally threw.
    if (isServerError) {
      log.error("Unhandled global error", {
        requestId,
        method: req.method,
        path: req.path,
        error: getErrorMessage(err),
        stack: errObj?.stack,
      });
      reportError(err, {
        requestId,
        method: req.method,
        path: req.path,
        tags: { source: "express_global_handler" },
      });
    }

    const { status, body } = formatErrorResponse(err, requestId);
    res.status(status).json(body);
  },
);

// Background job worker handle — assigned at module init below, stopped in
// the graceful-shutdown path so we stop polling for new jobs on SIGTERM/SIGINT.
// Declared here (before startServer) so the shutdown closure can reference it.
let stopWorker: (() => void) | undefined;

// Vite / Static Serving
async function startServer() {
  // Validate database connection before starting
  const dbHealthy = await validateDatabaseConnection();
  if (!dbHealthy && IS_PROD) {
    log.error("Database connection failed — refusing to start in production mode");
    process.exit(1);
  }

  if (dbHealthy) {
    const { initPresenceDbListener, startPresenceListener } =
      await import("./src/services/presence-stream-service");
    await initPresenceDbListener();
    void startPresenceListener();

    // Background worker — only when Postgres is reachable (avoids poll-loop spam in dev).
    if (process.env.VERCEL !== "1") {
      stopWorker = initJobWorker({ dbReady: true }) || undefined;
    }
  } else if (process.env.VERCEL !== "1") {
    log.warn("job worker skipped — database not connected");
  }

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Read index.html once into memory so the SPA catch-all never triggers a
    // synchronous filesystem read per request. This avoids CodeQL's
    // js/missing-rate-limiting pattern and is faster under load.
    const { readFileSync } = await import("node:fs");
    const indexHtml = readFileSync(path.join(distPath, "index.html"));
    app.get("*", (_req: express.Request, res: express.Response) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(indexHtml);
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on http://localhost:${PORT}`);
  });

  const { initSupervisorWebSocketServer } =
    await import("./src/services/supervisor-websocket-service");
  initSupervisorWebSocketServer(server);

  const GRACE_MS = 45_000;
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — starting graceful shutdown`);
    // Stop polling for new background jobs first so in-flight work can drain.
    stopWorker?.();
    const forceTimer = setTimeout(() => {
      log.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, GRACE_MS);
    (forceTimer as { unref?: () => void }).unref?.();
    server.close((err?: Error) => {
      clearTimeout(forceTimer);
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

// Safety nets
process.on("unhandledRejection", (reason: unknown) => {
  const r = reason as { message?: string; stack?: string } | null;
  log.error("unhandledRejection", {
    error: r?.message || String(reason),
    stack: r?.stack,
  });
  reportError(reason, { tags: { source: "unhandledRejection" } });
});
process.on("uncaughtException", (err: Error) => {
  log.error("uncaughtException", { error: err.message, stack: err.stack });
  reportError(err, { tags: { source: "uncaughtException" } });
  if (process.env.VERCEL !== "1") {
    (setTimeout(() => process.exit(1), 100) as { unref?: () => void }).unref?.();
  }
});

if (process.env.VERCEL !== "1") {
  startServer().catch((err) => {
    log.error("Failed to start server", {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    process.exit(1);
  });
}

export { app };
