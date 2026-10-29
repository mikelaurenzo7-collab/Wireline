import "../lib/load-env";
import "express-async-errors";
import { sql } from "drizzle-orm";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { activeBackgroundWorkCount, drainBackgroundWork } from "../lib/background-work";
import {
  reportVoiceShutdown,
  resolveVoiceHostShutdownGraceSeconds,
} from "../lib/voice/voice-worker-shutdown";
import { tryResolveDatabaseConnection } from "../lib/database-connection";
import { getCanonicalAppUrl } from "../lib/app-url";
import {
  openAISipConfigured,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";
import { voiceWorkerServiceSecret } from "../lib/voice/openai-sip-worker-config";
import { createVoiceWorkerApp } from "../lib/voice/openai-sip-worker-app";
import { installClonedMediaServer } from "../lib/voice/elevenlabs-media-bridge";
import { installGeminiMediaBridge } from "../lib/voice/gemini-media-bridge";
import openAISipRouter from "../routes/openai-sip-routes";
import {
  readVoiceWorkerReadiness,
  voiceWorkerSourceRevision,
} from "../lib/voice/openai-sip-worker-readiness";
import { reportError } from "../lib/error-reporter";
import { getErrorMessage } from "../lib/server-utils";

// The same safety nets as the API. Without them Node turns a stray rejection
// into an uncaught exception, and the fatal-process guard ends every live call
// with no log line and no error report.
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { error: getErrorMessage(reason) });
  reportError(reason, { tags: { surface: "voice-worker", kind: "unhandledRejection" } });
});
process.on("uncaughtException", (error) => {
  log.error("uncaughtException", { error: getErrorMessage(error) });
  reportError(error, { tags: { surface: "voice-worker", kind: "uncaughtException" } });
});

// A synthetic tenant validates RLS role/GUC access without customer reads.
const checkWorkerDatabase = () =>
  tenantStore.run("00000000-0000-4000-8000-000000000000", () =>
    drizzle.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);
      await tx.execute(sql`SELECT 1`);
    }),
  );

async function startVoiceWorker() {
  if (process.env.VERCEL === "1")
    throw new Error("The voice worker requires a persistent Node process.");
  process.env.WIRELINE_VOICE_WORKER = "true";
  voiceWorkerServiceSecret();
  voiceWorkerSourceRevision();
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
  await checkWorkerDatabase();
  const maxCalls = Number(process.env.WIRELINE_VOICE_WORKER_MAX_CALLS || 10);
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid worker PORT.");
  const { app, beginDrain, drainAdmissions, canAdmit } = createVoiceWorkerApp(
    openAISipRouter,
    maxCalls,
    () => readVoiceWorkerReadiness(checkWorkerDatabase),
  );
  const server = app.listen(port, "0.0.0.0", () => {
    log.info("Persistent voice worker ready", {
      port,
      maxCalls,
      maxCallSeconds: resolveOpenAISipSessionMaxSeconds(),
    });
  });
  let stopping = false;
  installClonedMediaServer(server, { port, maxCalls, canAdmit });
  installGeminiMediaBridge(server);
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    beginDrain();
    // Render kills the old instance maxShutdownDelaySeconds after SIGTERM.
    // Make any call that outlives that grace visible instead of silent.
    const cancelShutdownReport = reportVoiceShutdown({
      load: () => ({ active: activeBackgroundWorkCount(), pending: 0 }),
      log,
      hostGraceSeconds: resolveVoiceHostShutdownGraceSeconds(),
    });
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
    cancelShutdownReport();
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
