import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("server-owned OpenAI Realtime call control", () => {
  it("never returns a provider credential and fails closed without durable hangup", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const creation = control.slice(
      control.indexOf("export async function createServerManagedOpenAIRealtimeCall"),
    );
    expect(control).toContain("realtime/client_secrets");
    expect(creation).toContain('"Content-Type": "application/sdp"');
    expect(creation).toContain('response.headers.get("location")');
    expect(creation).toContain("scheduleAuthoritativeHangup");
    expect(creation).toContain("hangupOpenAIRealtimeCall");
    expect(creation).toContain("providerCallMayExist: true");
    expect(creation).toContain(
      'AppError.fromHttpStatus(502, "Live voice session safety status is unknown.")',
    );
    expect(creation).toContain("Live voice safety controls are temporarily unavailable");
    expect(creation).toContain("keySource: key.source");
    expect(creation).toContain("keyFingerprint: key.fingerprint");
    expect(creation).not.toMatch(/return\s*\{[^}]*ephemeralKey/s);
  });

  it("keeps provider response bodies out of logs, errors, and durable job failures", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const hangup = control.slice(
      control.indexOf("export async function hangupOpenAIRealtimeCall"),
      control.indexOf("async function scheduleAuthoritativeHangup"),
    );
    expect(control).toContain("openAIRealtimeFailureLogFields");
    expect(control).toContain("openAIRealtimeCallMayExistAfterResponse(response)");
    expect(control).toContain('openAIRealtimeProviderFailure(response, "hangup_failed")');
    expect(hangup).toContain('openAIRealtimeFailureFromError(error, "hangup_transport_failed")');
    expect(control).not.toContain("getErrorMessage");
    expect(control).not.toMatch(/body:\s*(secretText|answer|responseBody)/);
    expect(hangup).not.toContain("response.text()");
    expect(hangup).not.toMatch(/body\.slice|body\s*\?/);
  });

  it("uses previous OpenAI keys only for exact-source fingerprint-matched hangups", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const keyring = read("src/lib/voice/openai-realtime-keyring.ts");
    expect(control).toContain("selectOpenAIRealtimeHangupKey");
    expect(keyring).toContain("OPENAI_API_KEY_PREVIOUS");
    expect(keyring).toContain("OPENAI_API_KEY_CHATKIT_PREVIOUS");
    expect(keyring).toContain('generation: "current" | "previous"');
    expect(keyring).toContain("previous?.fingerprint === input.expectedFingerprint");
    expect(keyring).toContain("if (!input.expectedFingerprint) return current");
    expect(keyring).toContain('keyMaterial(env, source, "previous")');
  });

  it("makes provider hangup retry-safe and dispatches it outside provider spend gates", () => {
    const control = read("src/lib/voice/openai-realtime-call-control.ts");
    const queue = read("src/lib/job-queue.ts");
    const worker = read("src/lib/job-worker.ts");
    expect(control).toContain("response.status === 404 || response.status === 409");
    expect(control).toContain('type: "openai_realtime_hangup"');
    expect(control).toContain("expectedKeyFingerprint");
    expect(control).toContain("keySource: input.keySource");
    expect(queue).toContain('"openai_realtime_hangup"');
    const dispatch = worker.slice(worker.indexOf("async function dispatchJob"));
    expect(dispatch.indexOf('job.type === "openai_realtime_hangup"')).toBeLessThan(
      dispatch.indexOf("assertLaunchProviderSpendAllowed(job)"),
    );
    expect(worker).toContain('"openai_realtime_hangup",');
  });

  it("claims durable hangups ahead of backlog and records deadline lateness", () => {
    const queue = read("src/lib/job-queue.ts");
    const worker = read("src/lib/job-worker.ts");
    const priority = queue.slice(
      queue.indexOf("const claimPriority"),
      queue.indexOf("const claimOrder"),
    );
    const hangupDispatch = worker.slice(
      worker.indexOf('if (job.type === "openai_realtime_hangup")'),
      worker.indexOf('if (job.type === "twilio_message_reconciliation")'),
    );

    expect(priority).toContain("when ${schema.jobs.type} = 'openai_realtime_hangup' then 0");
    expect(priority).toContain("when ${schema.jobs.type} = 'purge_old_data' then 2");
    expect(queue).toContain(".orderBy(claimPriority, claimOrder(claimTime), schema.jobs.id)");
    expect(worker).toContain("OPENAI_REALTIME_HANGUP_LATE_WARNING_MS = 90_000");
    expect(worker).toContain("scheduled_at");
    expect(worker).toContain("execution_started_at");
    expect(worker).toContain("lateness_ms");
    expect(hangupDispatch).toContain('outcome: "started_late"');
    expect(hangupDispatch).toContain('outcome: "provider_hangup_confirmed_or_already_closed"');
    expect(hangupDispatch).toContain('outcome: "failed_retryable"');
    expect(hangupDispatch).toContain("persistJobResult(job.id, result)");
  });

  it("runs the authenticated durable sweep every minute with limiter headroom", () => {
    const config = JSON.parse(read("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const routes = read("src/routes/job-routes.ts");
    const rateLimits = read("src/middleware/api-rate-limits.ts");
    const sweep = config.crons.find((cron) => cron.path === "/api/jobs/sweep");

    expect(sweep?.schedule).toBe("* * * * *");
    expect(routes).toContain('router.get("/sweep", cronOrAdminAuth, jobsSweepRateLimit');
    expect(routes).toContain("expectedCronSecret.length >= 16");
    expect(rateLimits).toContain("const JOBS_SWEEP_WINDOW_MS = 15 * 60 * 1000");
    expect(rateLimits).toContain("const JOBS_SWEEP_MAX = 20");
  });

  it("keeps serverless functions alive through the exact browser-call deadline", () => {
    const config = JSON.parse(read("vercel.json")) as {
      functions: Record<string, { maxDuration: number }>;
    };
    const service = read("src/lib/voice/openai-realtime-service.ts");
    expect(service).toContain("OPENAI_REALTIME_SIMULATION_MAX_SECONDS = 300");
    expect(service).toContain("runInBackground");
    expect(service).toContain("hangupOpenAIRealtimeCall");
    expect(config.functions["api/mcp.ts"].maxDuration).toBeGreaterThanOrEqual(360);
    expect(config.functions["api/index.ts"].maxDuration).toBeGreaterThanOrEqual(360);
  });

  it("keeps public admission controls ahead of provider call creation", () => {
    const route = read("src/routes/marketing-runtime-routes.ts");
    const demoCall = route.slice(route.indexOf('"/api/public/demo-call"'));
    expect(demoCall.indexOf("verifyPublicDemoTicket")).toBeLessThan(
      demoCall.indexOf("consumePublicDemoTicket"),
    );
    expect(demoCall.indexOf("consumePublicDemoTicket")).toBeLessThan(
      demoCall.indexOf("admitPublicWebDemoSession"),
    );
    expect(demoCall.indexOf("admitPublicWebDemoSession")).toBeLessThan(
      demoCall.indexOf("createPublicOpenAILiveDemoCall"),
    );
    const service = read("src/lib/voice/openai-public-demo-session.ts");
    expect(service).toContain('action: "voice.realtime.public_demo"');
    expect(service).toContain('accounting_basis: "maximum_session_duration"');
    expect(service.indexOf("createServerManagedOpenAIRealtimeCall")).toBeLessThan(
      service.indexOf("persistPlatformCostRecord({"),
    );
    expect(service.indexOf("public OpenAI Realtime deadline")).toBeLessThan(
      service.indexOf("persistPlatformCostRecord({"),
    );
    expect(service).not.toContain("guestFingerprint,");
  });

  it("exposes only the browser SDP answer and public deadline", () => {
    const service = read("src/lib/voice/openai-public-demo-session.ts");
    const response = service.slice(service.indexOf("return {", service.indexOf("endsAt")));
    expect(response).toContain("sdp: call.sdp");
    expect(response).toContain("maxDurationSeconds");
    expect(response).toContain("endsAt: endsAt.toISOString()");
    expect(response).not.toContain("callId:");
    expect(response).not.toContain("clientSecret");
    expect(response).not.toContain("token:");
  });

  it("does not expose internal lease-control metadata to Studio", () => {
    const service = read("src/lib/voice/openai-live-agent-service.ts");
    const response = service.slice(
      service.indexOf("return {", service.indexOf('log.info("OpenAI live voice call created"')),
      service.indexOf("function tokens"),
    );
    expect(response).toContain("sdp: call.sdp");
    expect(response).toContain("maxDurationSeconds: call.maxDurationSeconds");
    expect(response).not.toContain("keySource");
    expect(response).not.toContain("keyFingerprint");
    expect(response).not.toContain("callId:");
  });
});
