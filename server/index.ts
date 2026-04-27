/**
 * Application factory + boot sequence. Building the app via `createApp()`
 * (instead of mutating a module-scope Express instance like the old monolith)
 * makes the server testable with supertest and lets us mount the same app
 * under different transports if we ever decouple `/api` from the SPA host.
 */
import path from "node:path";

import compression from "compression";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createServer as createViteServer } from "vite";

import { buildCorsOptions } from "./lib/cors";
import { env, isProductionEnv } from "./lib/env";
import { errorHandler } from "./lib/errors";
import { isGeminiConfigured } from "./lib/gemini";
import { logger } from "./lib/logger";
import agentsRouter from "./routes/agents";
import dashboardRouter from "./routes/dashboard";
import emailsRouter from "./routes/emails";
import fleetRouter from "./routes/fleet";
import oauthRouter from "./routes/oauth";
import outboundRouter from "./routes/outbound";
import phoneNumbersRouter from "./routes/phoneNumbers";
import settingsRouter from "./routes/settings";
import trainingRouter from "./routes/training";
import webhooksRouter from "./routes/webhooks";

export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

export function createApp() {
  const app = express();

  // Trust the first proxy hop so `req.ip` and `x-forwarded-proto` are
  // correctly resolved when running behind Render/Fly/Cloudflare.
  app.set("trust proxy", 1);

  // Hardened security headers. The CSP is tuned for the Wireline SPA:
  //  - `script-src 'self'` keeps inline JS off and blocks injected scripts.
  //    The Vite dev server ships its HMR client from the same origin so no
  //    extra allowlist entry is required.
  //  - `connect-src` allows API calls to Supabase, Google APIs, and Vapi
  //    (which the client invokes directly via `@vapi-ai/web`).
  //  - `img-src` permits data: for inline avatars/icons and https: for
  //    user-supplied logos.
  //  - `frame-ancestors 'none'` mirrors the previous X-Frame-Options: DENY.
  //  - In development we relax `script-src` to allow Vite's dev-time eval'd
  //    HMR runtime; production stays strict.
  const cspDirectives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "data:", "https:"],
    styleSrc: ["'self'", "'unsafe-inline'", "https:"],
    scriptSrc: isProductionEnv()
      ? ["'self'"]
      : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    connectSrc: [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.googleapis.com",
      "https://*.vapi.ai",
      "wss://*.vapi.ai",
      ...(isProductionEnv() ? [] : ["ws://localhost:*", "http://localhost:*"]),
    ],
    workerSrc: ["'self'", "blob:"],
    mediaSrc: ["'self'", "blob:", "https:"],
    // Only force HTTPS upgrades in production; in dev the server speaks
    // plain HTTP on localhost and this directive would break HMR.
    ...(isProductionEnv() ? { upgradeInsecureRequests: [] } : {}),
  };

  app.use(
    helmet({
      contentSecurityPolicy: { directives: cspDirectives, useDefaults: true },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // Permissions-Policy is not exposed by helmet directly; set it manually
      // to preserve the previous restriction.
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // CORS allowlist. Disabled when ALLOWED_ORIGINS is empty (same-origin only).
  const corsOptions = buildCorsOptions(env.ALLOWED_ORIGINS);
  if (corsOptions) {
    app.use(cors(corsOptions));
    app.options("*", cors(corsOptions));
  }

  // Compression for JSON + static SPA assets. `filter` defers to the default
  // (`compression.filter`) which already skips already-compressed responses.
  app.use(compression());

  // JSON body parsing. The `verify` callback captures the raw bytes so the
  // Vapi webhook can perform HMAC verification against the exact payload the
  // sender signed (post-parse re-serialization is not byte-stable).
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        if (buf?.length) req.rawBody = Buffer.from(buf);
      },
    })
  );

  // Routers — order doesn't matter for these since paths are unique.
  app.use(webhooksRouter);
  app.use(dashboardRouter);
  app.use(agentsRouter);
  app.use(phoneNumbersRouter);
  app.use(fleetRouter);
  app.use(settingsRouter);
  app.use(outboundRouter);
  app.use(trainingRouter);
  app.use(oauthRouter);
  app.use(emailsRouter);

  // Liveness / readiness.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", (_req, res) => {
    res.json({
      status: "ready",
      services: {
        database: "configured",
        gemini: isGeminiConfigured() ? "configured" : "missing",
        googleOAuth:
          env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()
            ? "configured"
            : "missing",
        webhookSecret: env.WIRELINE_WEBHOOK_SECRET?.trim() ? "configured" : "missing",
      },
    });
  });

  // Centralized error handler. Must be registered after all routes.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) =>
    errorHandler(err, req, res, next)
  );

  return app;
}

export async function startServer() {
  const app = createApp();

  if (!isProductionEnv()) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, host: env.HOST }, "Server listening");
    // Keep a console.log so pre-existing dev tooling that greps for the
    // "Server running" string keeps working.
    console.log(`Server running on http://localhost:${env.PORT}`);
  });

  const shutdown = () => {
    const forceCloseTimer = setTimeout(() => process.exit(1), GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    server.close(() => {
      clearTimeout(forceCloseTimer);
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
