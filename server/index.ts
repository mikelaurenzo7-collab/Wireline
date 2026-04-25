/**
 * Application factory + boot sequence. Building the app via `createApp()`
 * (instead of mutating a module-scope Express instance like the old monolith)
 * makes the server testable with supertest and lets us mount the same app
 * under different transports if we ever decouple `/api` from the SPA host.
 */
import path from "node:path";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";

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

  // Security headers via `helmet`.
  //
  // CSP: enforced in production with allowlists for the third-party origins
  // we actually load (Supabase REST/realtime, Vapi REST + WebSocket, Daily
  // WebRTC, and Google Fonts via the `@import` in `src/index.css`). In dev
  // we disable CSP entirely because Vite HMR needs `'unsafe-eval'`, inline
  // scripts, and `ws://` to localhost — it would be a pile of dev-only
  // exceptions that drift from the prod policy.
  //
  // COEP: deliberately disabled. `require-corp` would block any cross-
  // origin resource (Google Fonts, Supabase responses, Vapi/Daily media
  // chunks) that doesn't send `Cross-Origin-Resource-Policy`. We can't
  // control those upstreams' headers, so enabling it now would break the
  // app. Re-evaluate when we have a service worker / cross-origin
  // isolation requirement.
  //
  // CORP: `same-origin` only restricts who can load *our* resources; it
  // does not affect what *we* load. Safe.
  app.use(
    helmet({
      contentSecurityPolicy: isProductionEnv()
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              // Tailwind compiles to a stylesheet, but motion/react and
              // Recharts inject inline `style` attributes at runtime.
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: [
                "'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co",
                "https://api.vapi.ai",
                "https://*.vapi.ai",
                "wss://*.vapi.ai",
                "https://*.daily.co",
                "wss://*.daily.co",
              ],
              mediaSrc: ["'self'", "blob:"],
              workerSrc: ["'self'", "blob:"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      frameguard: { action: "deny" },
    })
  );
  // Permissions-Policy is not part of helmet's middleware set, so we set it
  // manually. `microphone=(self)` is required by the Vapi web SDK on the
  // dashboard (it calls `getUserMedia` for voice agent calls). Camera and
  // geolocation stay denied.
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    next();
  });

  app.use(express.json({ limit: "1mb" }));

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
    // Lazy-import vite so `createApp()` is testable without dragging in
    // esbuild (which jsdom's polyfilled TextEncoder upsets).
    const { createServer: createViteServer } = await import("vite");
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
