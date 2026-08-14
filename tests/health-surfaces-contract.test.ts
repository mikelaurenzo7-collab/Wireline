import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealthModelTiering } from "../src/lib/health-model-policy";
import { probeOpenAIModelDiagnostic } from "../src/lib/health-model-probe";
import {
  GEMINI_STRUCTURED_FALLBACK_MODEL,
  STRUCTURED_PRIMARY_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  VAPI_VOICE_FALLBACK_PROVIDER,
} from "../src/lib/ai-models";
import { evaluatePlatformOperationalSlos } from "../src/lib/platform-operational-slos";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

describe("health surfaces contract", () => {
  it("requires platform admin for integrations health", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).toMatch(/\/integrations"[\s\S]*requirePlatformAdmin/);
  });

  it("does not publish unconditional SLO availability claims", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).not.toContain("99.5%");
    expect(source).not.toContain("P0/P1 post-incident report within 72 hours");
    expect(source).toContain("evaluatePlatformOperationalSlos");
  });

  it("returns evidence-backed platform SLO statuses", () => {
    const ok = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(["ok", "degraded", "insufficient_data"]).toContain(ok.status);
    expect(ok.targets.availability.status).toBe("ok");
    expect(ok.targets.availability.evidence).toMatchObject({ db_ok: true });

    const degraded = evaluatePlatformOperationalSlos({ dbOk: false, dbLatencyMs: 4000 });
    expect(degraded.targets.availability.status).toBe("degraded");
  });

  it("uses platform-wide snapshot for admin and monitor SLO routes", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).toContain("getPlatformSloSnapshot");
    expect(source).not.toMatch(/getTenantSloSnapshot/);
  });

  // Re-pointed from AgentActionEngine.tsx, which never rendered, to the tool
  // permissions surface that now ships. The rule is the same: a tenant editing
  // agent actions reads tenant OAuth posture, never the platform-admin health
  // route (which answers 403 to anyone who is not a platform admin anyway).
  it("keeps tenant tool status off the platform integrations health route", () => {
    const permissions = read("src/components/AgentToolPermissions.tsx");
    expect(permissions).not.toContain("/api/health/integrations");
    expect(permissions).toContain("/api/oauth/crm/status");
  });

  it("accepts bounded browser error reports and forwards them to server telemetry", () => {
    const source = read("src/routes/health-routes.ts");
    const clientReporter = read("src/lib/sentry.ts");

    expect(clientReporter).toContain('"/api/health/report"');
    expect(source).toContain('router.post("/report"');
    expect(source).toContain("clientReportRateLimiter");
    expect(source).toContain("reportError(new Error(message)");
    expect(source).toContain("body.stack.slice(0, 4_000)");
  });

  it("routes standalone public health through the certified shared handler first", () => {
    const registration = read("src/server/register-api-routes.ts");
    const sharedImport = 'import publicHealthHandler from "../entrypoints/public-health-api";';
    const exactRoute = 'app.all("/api/health/public"';
    const broadRouter = 'app.use("/api/health", healthRouter)';

    expect(registration).toContain(sharedImport);
    expect(registration).toContain(exactRoute);
    expect(registration).toContain("publicHealthHandler(req, res).catch(next)");
    expect(registration.indexOf(exactRoute)).toBeLessThan(registration.indexOf(broadRouter));
  });

  it("keeps public status single-owned and authenticated diagnostics cancellable", () => {
    const routeSource = read("src/routes/health-routes.ts");
    const probeSource = read("src/lib/health-model-probe.ts");

    expect(routeSource).not.toContain('router.get("/public"');
    expect(routeSource).not.toContain("PUBLIC_PROBE_TTL_MS");
    expect(routeSource).not.toContain("computePublicHealth");
    expect(routeSource).toContain(
      'import { probeOpenAIModelDiagnostic } from "../lib/health-model-probe";',
    );
    // /models drives three live platform-key OpenAI probes per request, so it
    // must never be reachable by an arbitrary authenticated tenant: monitor
    // token for ops, platform admin for humans (same posture as /slos). The
    // composite is a NAMED middleware so the authz matrix sees it in-chain.
    const gateStart = routeSource.indexOf("function requireMonitorTokenOrPlatformAdmin");
    expect(gateStart).toBeGreaterThan(-1);
    const gate = routeSource.slice(gateStart, routeSource.indexOf("router.get(", gateStart));
    expect(gate).toContain("monitorTokenOk(req)");
    expect(gate).toContain("authenticateUser(req, res,");
    expect(gate).toContain("requirePlatformAdmin(req, res, next)");
    expect(routeSource).toMatch(
      /router\.get\(\s*"\/models",\s*healthRateLimiter,\s*requireMonitorTokenOrPlatformAdmin/,
    );
    expect(probeSource).toContain("const controller = new AbortController()");
    expect(probeSource).toContain('controller.abort(new Error("model probe timed out"))');
    expect(probeSource).toContain("signal: controller.signal");
    expect(probeSource).toContain("clearTimeout(timeout)");
  });

  it("derives authenticated model/provider health from canonical runtime policy", () => {
    const tiering = getHealthModelTiering();
    expect(tiering.voice_runtime).toMatchObject({
      provider: VAPI_TENANT_DEFAULT_PROVIDER,
      model: VAPI_TENANT_DEFAULT_MODEL,
    });
    expect(tiering.voice_fallback).toMatchObject({
      provider: VAPI_VOICE_FALLBACK_PROVIDER,
      model: VAPI_VOICE_FALLBACK_MODEL,
    });
    expect(tiering.reasoning_layer).toMatchObject({
      provider: "openai",
      model: STRUCTURED_PRIMARY_MODEL,
    });
    expect(tiering.reasoning_fallback).toMatchObject({
      provider: "google",
      model: GEMINI_STRUCTURED_FALLBACK_MODEL,
    });

    const routeSource = read("src/routes/health-routes.ts");
    expect(routeSource).toContain("llm_tiering: getHealthModelTiering()");
    expect(routeSource).not.toMatch(/voice_fallback:\s*\{\s*provider:\s*"google"/);
  });

  it("does not call OpenAI when the diagnostic key is absent", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(probeOpenAIModelDiagnostic("test-model", 25, fetchImpl)).resolves.toMatchObject({
      ok: false,
      model: "test-model",
      error: "OPENAI_API_KEY not configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears the diagnostic deadline after a successful provider response", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(probeOpenAIModelDiagnostic("test-model", 50, fetchImpl)).resolves.toMatchObject({
      ok: true,
      model: "test-model",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts the underlying diagnostic request at the hard deadline", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
      });
    }) as unknown as typeof fetch;

    const pending = probeOpenAIModelDiagnostic("test-model", 50, fetchImpl);
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      model: "test-model",
      error: "model probe timed out",
    });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
