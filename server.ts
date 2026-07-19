import "./src/lib/load-env";
import "express-async-errors";
import express from "express";
import type { Server } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import cors from "cors";
import path from "path";
import { randomUUID } from "node:crypto";
import { IS_PROD, log } from "./src/lib/server-context";
import { bindRequestIdReader } from "./src/lib/server-logger";
import { AppError, formatErrorResponse } from "./src/lib/api-error";
import { reportError } from "./src/lib/error-reporter";
import { normalizeApiErrorResponse } from "./src/middleware/normalize-api-error-response";
import { assertSameOrigin } from "./src/middleware/same-origin";
import { installWebhookBodyParsers } from "./src/lib/body-parsers";
import { buildCSP, buildConnectSrcs, generateCspNonce } from "./src/lib/csp";
import { getErrorMessage } from "./src/lib/server-utils";
import { validateStartupEnv } from "./src/lib/startup";
import { startMemoryCleanup } from "./src/lib/rate-limit";
import { authenticateLiveOpsStream } from "./src/middleware/live-ops-stream";
import { registerApiRoutes } from "./src/server/register-api-routes";
import { sseBroadcaster } from "./src/services/sse-broadcaster";
import { initSupervisorWebSocketServer } from "./src/services/supervisor-websocket-service";
import gatewayCatalogRouter from "./src/lib/gateway-catalog";

const SHUTDOWN_GRACE_MS = 30_000;
let server: Server | null = null;

const requestIdStore = new AsyncLocalStorage<string>();
bindRequestIdReader(() => requestIdStore.getStore());

function gracefulShutdown(signal: string) {
  log.info("Shutdown received", { signal });
  if (!server) {
    process.exit(0);
    return;
  }

  // Stop accepting new connections immediately.
  server.close(() => {
    log.info("Server closed cleanly");
    process.exit(0);
  });

  // Force exit after grace period if connections are still open.
  const force = setTimeout(() => {
    log.warn("Shutdown force-exit after grace period", { signal, graceMs: SHUTDOWN_GRACE_MS });
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  // Let the event loop drain if the close callback fires first.
  force.unref();
}

/**
 * Canonical Wireline server entrypoint.
 *
 * Build, local development, Vercel's bundled API function, and process startup
 * all originate here. `server-v2.ts` is retained only as a compatibility export
 * for older internal references.
 */
if (typeof (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function toJSON(this: bigint) {
      return this.toString();
    },
    configurable: true,
  });
}

validateStartupEnv();

export const app = express();

// Don't advertise the framework — trims a low-value fingerprinting signal.
app.disable("x-powered-by");

if (IS_PROD) app.set("trust proxy", 1);

const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (IS_PROD && !origins.length && process.env.APP_URL) origins.push(process.env.APP_URL);

if (IS_PROD && origins.length === 0) {
  log.error("CORS misconfigured: set CORS_ORIGINS and/or APP_URL in production");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (IS_PROD && origins.length === 0) return callback(null, false);
      if (!origins.length || origins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Install request IDs before body parsing or security gates so every API
// rejection and parser failure can be traced across logs, clients, and alerts.
app.use((req, res, next) => {
  const incoming = String(req.headers["x-request-id"] || "").slice(0, 64);
  const requestId = /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  requestIdStore.run(requestId, next);
});

// Must run before global JSON parsing so signed vendor payloads retain raw bytes.
installWebhookBodyParsers(app);
// Reject disallowed mutating API requests before reading the general JSON body.
// Vendor callbacks remain safe because the dedicated parsers above run first and
// same-origin explicitly skips those signed provider routes.
app.use(assertSameOrigin);
app.use(express.json({ limit: "6mb" }));
app.use(normalizeApiErrorResponse);

const connectSrc = buildConnectSrcs(!IS_PROD);
app.use((_req, res, next) => {
  const nonce = IS_PROD ? generateCspNonce() : undefined;
  res.locals.cspNonce = nonce;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Keep these values in lockstep with the static-header policy in vercel.json
  // so API responses carry the same posture as statically served documents.
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  );
  res.setHeader("Content-Security-Policy", buildCSP(!IS_PROD, nonce, connectSrc));
  if (IS_PROD)
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  next();
});

startMemoryCleanup();
registerApiRoutes(app);
app.use(gatewayCatalogRouter);

app.get("/api/live-ops/stream", authenticateLiveOpsStream, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const tenantId = req.tenantId || req.user?.id;
  if (!tenantId) {
    return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  }
  sseBroadcaster.addClient((res.locals?.requestId as string) || randomUUID(), res, tenantId);
});

app.use("/api", (req, res) => {
  const { status, body } = formatErrorResponse(
    AppError.notFound(`No API route matches ${req.method} ${req.path}`),
    res.locals.requestId as string | undefined,
  );
  res.status(status).json(body);
});

app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("API error", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      error: getErrorMessage(error),
    });
    const { status, body } = formatErrorResponse(error, res.locals.requestId as string | undefined);
    // External alerting for real 5xx only — 4xx are user errors, not incidents.
    if (status >= 500) {
      reportError(error, {
        tags: {
          surface: "api",
          method: req.method,
          path: req.path,
          status,
        },
        requestId: res.locals.requestId,
      });
    }
    res.status(status).json(body);
  },
);

// Process-level safety nets. Vercel isolates function invocations so these
// mostly protect the long-running local/dev server, but they also add a last
// line of defense on the bundled Vercel function if a stray promise rejects
// outside any request scope.
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { error: getErrorMessage(reason) });
  reportError(reason, { tags: { surface: "process", kind: "unhandledRejection" } });
});
process.on("uncaughtException", (error) => {
  log.error("uncaughtException", { error: getErrorMessage(error) });
  reportError(error, { tags: { surface: "process", kind: "uncaughtException" } });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    return;
  }

  const dist = path.join(process.cwd(), "dist");
  const indexHtml = path.join(dist, "index.html");
  app.use(express.static(dist));
  // Always read index.html from disk — caching it at startup breaks SPA routes after
  // a rebuild when Playwright or local dev reuses the same Node process.
  app.get("*", (_req, res) => {
    res.type("html").sendFile(indexHtml);
  });
}

if (process.env.VERCEL !== "1") {
  void startServer().then(() => {
    const port = Number(process.env.PORT) || 3000;
    server = app.listen(port, () => log.info("Wireline server started", { port }));
    initSupervisorWebSocketServer(server);
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  });
}
