import express, { type Router, type ErrorRequestHandler } from "express";
import { activeBackgroundWorkCount } from "../background-work";
import { installWebhookBodyParsers } from "../body-parsers";
import {
  VOICE_WORKER_AUTH_HEADER,
  verifyVoiceWorkerServiceAuth,
} from "./openai-sip-worker-dispatch";
import { OPENAI_SIP_WEBHOOK_PATH } from "./openai-sip-config";
import type { VoiceWorkerReadiness } from "./openai-sip-worker-readiness";

export function createVoiceWorkerApp(
  router: Router,
  maxCalls: number,
  readReadiness?: () => Promise<VoiceWorkerReadiness>,
) {
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 200) {
    throw new Error("WIRELINE_VOICE_WORKER_MAX_CALLS must be an integer between 1 and 200.");
  }
  let draining = false;
  let pendingRequests = 0;
  const admissionDrainWaiters = new Set<() => void>();
  const drainAdmissions = async () => {
    if (pendingRequests === 0) return;
    await new Promise<void>((resolve) => admissionDrainWaiters.add(resolve));
  };
  const app = express();
  app.disable("x-powered-by");
  const beginDrain = () => {
    draining = true;
  };

  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(draining ? 503 : 200).json({ ready: !draining });
  });
  app.use((req, res, next) => {
    if (!verifyVoiceWorkerServiceAuth(String(req.get(VOICE_WORKER_AUTH_HEADER) || ""))) {
      res.status(401).json({ error: "Invalid voice worker authentication." });
      return;
    }
    next();
  });
  // Read-only deployment proof is private; public liveness never exposes metadata.
  app.get("/readyz", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (draining || !readReadiness) {
      res.status(503).json({ ready: false });
      return;
    }
    try {
      const readiness = await readReadiness();
      if (draining) res.status(503).json({ ready: false });
      else res.json(readiness);
    } catch {
      res.status(503).json({ ready: false });
    }
  });
  // Operators call this before removing an instance from the load balancer.
  // Existing calls keep their sideband connection while new deliveries retry.
  app.post("/drain", (_req, res) => {
    beginDrain();
    res.json({ draining: true, active: activeBackgroundWorkCount(), pending: pendingRequests });
  });
  app.get("/drain", (_req, res) => {
    res.json({ draining, active: activeBackgroundWorkCount(), pending: pendingRequests });
  });
  app.post(OPENAI_SIP_WEBHOOK_PATH, (_req, res, next) => {
    if (draining || activeBackgroundWorkCount() + pendingRequests >= maxCalls) {
      res.setHeader("Retry-After", "5");
      res.status(503).json({ error: "Voice worker is temporarily unavailable." });
      return;
    }
    pendingRequests += 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      pendingRequests -= 1;
      if (pendingRequests === 0) {
        for (const resolve of admissionDrainWaiters) resolve();
        admissionDrainWaiters.clear();
      }
    };
    res.locals.voiceWorkerAdmissionRelease = finish;
    // A rate limiter/body parser may finish after the client has disconnected,
    // when "finish" is no longer emitted. End is still the terminal decision;
    // an active call handler retains ownership until its finally block.
    const originalEnd = res.end;
    res.end = ((...args: unknown[]) => {
      if (!res.locals.voiceWorkerHandlerActive) finish();
      return Reflect.apply(originalEnd, res, args);
    }) as typeof originalEnd;
    res.once("finish", () => {
      if (!res.locals.voiceWorkerHandlerActive) finish();
    });
    next();
  });
  installWebhookBodyParsers(app);
  app.use(router);
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    res.locals.voiceWorkerAdmissionRelease?.();
    const status = Number(error?.statusCode ?? error?.status);
    res.status(status >= 400 && status < 600 ? status : 503).json({
      error: "Voice call admission could not be completed.",
    });
  };
  app.use(errorHandler);
  return { app, beginDrain, drainAdmissions };
}
