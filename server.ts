import dotenv from "dotenv";
dotenv.config();

// Sentry must be imported and initialized BEFORE other modules so its
// instrumentation can wrap http/express. Graceful no-op when SENTRY_DSN is unset.
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1.0),
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  });
}

import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "node:crypto";
import { db, IS_PROD, log } from "./src/lib/server-context";
import { getErrorMessage } from "./src/lib/server-utils";
import { validateStartupEnv } from "./src/lib/startup";
import { buildCSP, buildConnectSrcs } from "./src/lib/csp";
import { isRedisConfigured, startMemoryCleanup } from "./src/lib/rate-limit";
import { claudeRateLimiter } from "./src/middleware/api-rate-limits";
import { initJobWorker } from "./src/lib/job-worker";
import { performanceMonitoring } from "./src/middleware/performance";
import { timeoutMiddleware } from "./src/middleware/timeout";

// Routers
import oauthRouter from "./src/routes/oauth-routes";
import vapiRouter from "./src/routes/vapi-routes";
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
import healthRouter from "./src/routes/health-routes";
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
import outboundRouter from "./src/routes/outbound-routes";
import driveRouter from "./src/routes/drive-routes";
import emailRouter from "./src/routes/email-routes";
import calendarRouter from "./src/routes/calendar-routes";
import settingsRouter from "./src/routes/settings-routes";
import teamRouter from "./src/routes/team-routes";
import kimiRouter from "./src/routes/kimi-routes";
import authRouter from "./src/routes/auth-routes";

// Startup env validation
validateStartupEnv();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust exactly one proxy hop ONLY when running on Vercel (which sets
// `VERCEL=1` and always overwrites X-Forwarded-For with the real client
// IP). Outside Vercel — local dev, self-hosted, etc. — leave proxy trust
// off so attackers can't forge XFF to rotate `req.ip` and bypass per-IP
// rate limits. Self-hosted operators must explicitly opt in via a future
// `TRUSTED_PROXY_HOPS` env var if they front the app with their own proxy.
if (process.env.VERCEL === "1") {
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
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!IS_PROD && corsAllowList.length === 0) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      log.warn("CORS rejected origin", { origin });
      return callback(new Error("Origin not permitted by CORS"));
    },
    credentials: true,
  }),
);

// Stripe webhook needs raw body
app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));

// Scoped JSON body parsers
app.use("/api/claude/knowledge-from-document", express.json({ limit: "50mb" }));
app.use("/api/outbound/bulk", express.json({ limit: "16mb" }));
app.use(express.json({ limit: "1mb" }));

// Request correlation IDs
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const incoming = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64);
  const requestId = incoming && /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Security headers
const CSP_CONNECT_SRCS = buildConnectSrcs();

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  Sentry.setTag("http.method", req.method);
  Sentry.setTag("http.path", req.path);
  res.on("finish", () => Sentry.setTag("http.status_code", res.statusCode));

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, undefined, CSP_CONNECT_SRCS));
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
app.use("/api/claude", timeoutMiddleware(30_000));
app.use("/api/emails", timeoutMiddleware(15_000));
app.use("/api/phone-numbers", timeoutMiddleware(10_000));
app.use("/api/campaigns", timeoutMiddleware(10_000));
app.use("/api", timeoutMiddleware(20_000));

// Global Router Mounting
app.use("/api/health", healthRouter);
app.use("/api/quotas", quotaRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/intake", intakeRouter);
app.use("/api/qa", qaRouter);
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
app.use(outboundRouter);
app.use(driveRouter);
app.use(emailRouter);
app.use(calendarRouter);
app.use(settingsRouter);
app.use(vapiRouter);
app.use(agentRouter);
app.use(campaignRouter);
app.use(fleetRouter);
app.use(auditRouter);
app.use(insightsRouter);
app.use("/api/webhooks", webhookRouter);
app.use(soc2Router);
app.use(oauthRouter);
app.use(teamRouter);
app.use("/api/kimi", kimiRouter);
app.use("/api/auth", authRouter);

// 404 API catch-all (Must be mounted after all valid API routes and before global error handler)
app.use("/api", (req: express.Request, res: express.Response) => {
  res
    .status(404)
    .json({ error: "API Route Not Found", path: req.path, requestId: res.locals?.requestId });
});

// Global error handler
app.use(
  (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errObj = err as { message?: string; stack?: string };
    log.error("Unhandled global error", {
      requestId: res.locals?.requestId,
      method: req.method,
      path: req.path,
      error: getErrorMessage(err),
      stack: errObj?.stack,
    });
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, {
        tags: { requestId: res.locals?.requestId, path: req.path, method: req.method },
      });
    }
    res.status(500).json({ error: "Internal Server Error", requestId: res.locals?.requestId });
  },
);

// Vite / Static Serving
async function startServer() {
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
    app.get("*", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(indexHtml);
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on http://localhost:${PORT}`);
  });

  const GRACE_MS = 15_000;
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — starting graceful shutdown`);
    const forceTimer = (
      setTimeout(() => {
        log.error("Graceful shutdown timed out — forcing exit");
        process.exit(1);
      }, GRACE_MS) as any
    ).unref?.();
    server.close((err) => {
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

// Background Worker
let stopWorker: (() => void) | undefined = initJobWorker() || undefined;

// Safety nets
process.on("unhandledRejection", (reason: unknown) => {
  const r = reason as { message?: string; stack?: string } | null;
  log.error("unhandledRejection", {
    error: r?.message || String(reason),
    stack: r?.stack,
  });
});
process.on("uncaughtException", (err: Error) => {
  log.error("uncaughtException", { error: err.message, stack: err.stack });
  if (process.env.VERCEL !== "1") {
    (setTimeout(() => process.exit(1), 100) as any).unref?.();
  }
});

if (process.env.VERCEL !== "1") {
  startServer();
}

export { app };
