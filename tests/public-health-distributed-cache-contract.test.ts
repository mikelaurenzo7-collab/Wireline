import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// This contract runs in every preview/production boundary suite. The final
// certification commit also runs Wireline's complete TypeScript, ESLint, and
// non-E2E test audit before this branch can be considered mergeable.
describe("distributed public health boundary", () => {
  it("routes through a dedicated filesystem function backed by a bundled artifact", () => {
    const bridge = read("api/health/public.ts");
    const implementation = read("src/entrypoints/public-health-api.ts");
    const smoke = read("scripts/smoke-public-health-bundle.mjs");
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      buildCommand?: string;
      functions?: Record<string, { includeFiles?: string }>;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(bridge).toContain('import { createRequire } from "node:module"');
    expect(bridge).toContain('require("../../dist/public-health-api.cjs")');
    expect(bridge).not.toContain("../../src/");
    expect(implementation).toContain('from "@upstash/redis"');
    expect(vercelConfig.functions?.["api/health/public.ts"]?.includeFiles).toBe(
      "dist/public-health-api.cjs",
    );
    expect(vercelConfig.buildCommand).toContain("src/entrypoints/public-health-api.ts");
    expect(vercelConfig.buildCommand).toContain("--outfile=dist/public-health-api.cjs");
    expect(vercelConfig.buildCommand).toContain("scripts/smoke-public-health-bundle.mjs");
    expect(smoke).toContain('require("../dist/public-health-api.cjs")');
    expect(smoke).toContain('typeof handler !== "function"');
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/:path*",
      destination: "/api/index.ts",
    });
  });

  it("requires a global cache and lock before any external provider probe", () => {
    const source = read("src/entrypoints/public-health-api.ts");
    const clientGuard = source.indexOf("if (!client)");
    const lock = source.indexOf("nx: true");
    const probes = source.indexOf("const [voice, reasoning]");

    expect(source).toContain("const CACHE_SCOPE = cacheScope()");
    expect(source).toContain("wireline:health:public:v4:${CACHE_SCOPE}");
    expect(source).toContain("wireline:health:public:probe-lock:v4:${CACHE_SCOPE}");
    expect(source).toContain('unavailablePayload("DISTRIBUTED_CACHE_REQUIRED")');
    expect(source).toContain('unavailablePayload("DISTRIBUTED_CACHE_UNAVAILABLE")');
    expect(source).toContain("LOCAL_STALE_TTL_MS");
    expect(source).toContain('"stale-local"');
    expect(source).not.toContain("let localCache: PublicHealthPayload | null");
    expect(clientGuard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(clientGuard);
    expect(probes).toBeGreaterThan(lock);
  });

  it("isolates production status from previews and other deployments", () => {
    const source = read("src/entrypoints/public-health-api.ts");

    expect(source).toContain("process.env.VERCEL_ENV || process.env.NODE_ENV");
    expect(source).toContain('if (environment === "production") return "production"');
    expect(source).toContain("process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL");
    expect(source).toContain("return `${environment}:${deployment}`");
  });

  it("probes each runtime through its owning execution surface", () => {
    const functionSource = read("src/entrypoints/public-health-api.ts");
    const probeSource = read("src/lib/public-health-probe.ts");

    expect(functionSource).toContain("probeVapiManagedVoice(process.env.VAPI_PRIVATE_KEY)");
    expect(functionSource).toContain("voiceFallback: voice");
    expect(functionSource).toContain(
      "probeOpenAIModel(OPENAI_STRUCTURED_PRIMARY_MODEL, process.env.OPENAI_API_KEY)",
    );
    expect(functionSource).not.toContain("VAPI_VOICE_FALLBACK_MODEL");

    // Vapi can be verified without generating a call or model output.
    expect(probeSource).toContain('url: "https://api.vapi.ai/assistant?limit=1"');
    expect(probeSource).toContain('method: "GET"');

    // Reasoning health must exercise the same Responses endpoint customers use,
    // not the model-catalog metadata plane that repeatedly produced false public
    // degradations while the application runtime itself remained healthy.
    expect(probeSource).toContain('fetch("https://api.openai.com/v1/responses"');
    expect(probeSource).toContain('method: "POST"');
    expect(probeSource).toContain("max_output_tokens: 16");
    expect(probeSource).toContain('reasoning: { effort: "none" }');
    expect(probeSource).toContain('text: { verbosity: "low" }');
    expect(probeSource).toContain("store: false");
    expect(probeSource).not.toContain("/v1/models/${encodeURIComponent(model)}");
  });

  it("certifies the exact Vapi primary and fallback schema in deep previews", () => {
    const build = read("scripts/vercel-build.mjs");
    const audit = read("scripts/check-vapi-payload-contract-live.mts");

    expect(build).toContain('run("npx", ["tsx", "scripts/check-vapi-payload-contract-live.mts"])');
    expect(build).not.toContain("check-vapi-payload-contract-live.mjs");
    expect(audit).toContain("VAPI_TENANT_DEFAULT_PROVIDER");
    expect(audit).toContain("VAPI_TENANT_DEFAULT_MODEL");
    expect(audit).toContain("VAPI_DEFAULT_FALLBACK_MODELS");
    expect(audit).toContain("fallbackModels: expectedFallbackModels");
    expect(audit).toContain("sameStringArray(model?.fallbackModels, expectedFallbackModels)");
    expect(audit).toContain('method: "DELETE"');
    expect(audit).not.toContain("/call");
    expect(audit).not.toContain("/chat");
  });

  it("does not cache failures, preserves request correlation, and keeps diagnostics internal", () => {
    const source = read("src/entrypoints/public-health-api.ts");

    expect(source).toContain('import { randomUUID } from "node:crypto"');
    expect(source).toContain('res.setHeader("X-Request-Id", requestId)');
    expect(source).toContain('statusCode === 200 ? CACHE_CONTROL : "no-store"');
    expect(source).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(source).toContain("requestId,");
    expect(source).toContain("cacheScope: CACHE_SCOPE");
    expect(source).toContain("console.error(");
    expect(source).toContain('console.warn("Public health provider probe degraded"');
    expect(source).toContain("eslint-disable-next-line no-console");
    expect(source).toContain("failures,");
    expect(source).not.toContain("payload: failures");
  });

  it("keeps the certified shared handler as the only public status implementation", () => {
    const directFunction = read("src/entrypoints/public-health-api.ts");
    const expressHealth = read("src/routes/health-routes.ts");
    const registration = read("src/server/register-api-routes.ts");

    expect(directFunction).toContain("probeVapiManagedVoice");
    expect(directFunction).toContain("probeOpenAIModel");
    expect(directFunction).toContain("RESULT_TTL_SECONDS");
    expect(directFunction).not.toContain("publicProbeCache");
    expect(expressHealth).not.toContain('router.get("/public"');
    expect(expressHealth).not.toContain("publicProbeCache");
    expect(expressHealth).not.toContain("computePublicHealth");
    expect(registration).toContain(
      'import publicHealthHandler from "../entrypoints/public-health-api";',
    );
    expect(registration).toContain('app.all("/api/health/public"');
  });
});