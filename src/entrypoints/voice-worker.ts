import "../lib/load-env";
import "express-async-errors";
import { sql } from "drizzle-orm";
import { drizzle, log } from "../lib/server-context";
import { drainBackgroundWork } from "../lib/background-work";
import { tryResolveDatabaseConnection } from "../lib/database-connection";
import { getCanonicalAppUrl } from "../lib/app-url";
import {
  openAISipConfigured,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";
import { voiceWorkerServiceSecret } from "../lib/voice/openai-sip-worker-config";
import { createVoiceWorkerApp } from "../lib/voice/openai-sip-worker-app";
import openAISipRouter from "../routes/openai-sip-routes";

async function startVoiceWorker() {
  if (process.env.VERCEL === "1")
    throw new Error("The voice worker requires a persistent Node process.");
  process.env.WIRELINE_VOICE_WORKER = "true";
  voiceWorkerServiceSecret();
  if (!tryResolveDatabaseConnection()) throw new Error("Voice worker database is not configured.");
  if (!openAISipConfigured())
    throw new Error("Voice worker OpenAI SIP configuration is incomplete.");
  if ((process.env.INTERNAL_JWT_SECRET?.trim().length || 0) < 32) {
    throw new Error("Voice worker INTERNAL_JWT_SECRET is not configured.");
  }
  const appUrl = new URL(getCanonicalAppUrl());
  if (
    appUrl.protocol !== "https:" ||
    appUrl.username ||
    appUrl.password ||
    appUrl.search ||
    appUrl.hash ||
    appUrl.pathname !== "/"
  ) {
    throw new Error("Voice worker APP_URL must be the canonical HTTPS web app origin.");
  }
  // Read-only startup check. A worker must not advertise readiness before it
  // can reach the shared persistence used for tenant and call ownership.
  await drizzle.execute(sql`SELECT 1`);
  const maxCalls = Number(process.env.WIRELINE_VOICE_WORKER_MAX_CALLS || 10);
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid worker PORT.");
  const { app, beginDrain, drainAdmissions } = createVoiceWorkerApp(openAISipRouter, maxCalls);
  const server = app.listen(port, "0.0.0.0", () => {
    log.info("Persistent voice worker ready", {
      port,
      maxCalls,
      maxCallSeconds: resolveOpenAISipSessionMaxSeconds(),
    });
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    beginDrain();
    // The host must allow this grace, or use authenticated /drain and wait for
    // zero active calls BEFORE sending SIGTERM. A 30s host deadline is unsafe.
    const deadline = setTimeout(
      () => process.exit(1),
      (resolveOpenAISipSessionMaxSeconds() + 300) * 1000,
    );
    deadline.unref();
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    await closed;
    await drainAdmissions();
    await drainBackgroundWork();
    clearTimeout(deadline);
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    void stop();
  });
  process.on("SIGINT", () => {
    void stop();
  });
}
void startVoiceWorker().catch((error: unknown) => {
  log.error("Voice worker startup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
