import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// This contract runs in every preview/production boundary suite. The final
// certification commit also runs Wireline's complete TypeScript, ESLint, and
// non-E2E test audit before this branch can be considered mergeable.
describe("distributed public health boundary", () => {
  it("routes the public model status through a dedicated filesystem function", () => {
    const functionSource = read("api/health/public.ts");
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      functions?: Record<string, unknown>;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(functionSource).toContain('from "@upstash/redis"');
    expect(vercelConfig.functions).toHaveProperty("api/health/public.ts");
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/:path*",
      destination: "/api/index.ts",
    });
  });

  it("requires a global cache and lock before any external provider probe", () => {
    const source = read("api/health/public.ts");
    const clientGuard = source.indexOf("if (!client)");
    const lock = source.indexOf("nx: true");
    const probes = source.indexOf("const [voice, voiceFallback, reasoning]");

    expect(source).toContain("const CACHE_SCOPE = cacheScope()");
    expect(source).toContain("wireline:health:public:v3:${CACHE_SCOPE}");
    expect(source).toContain("wireline:health:public:probe-lock:v3:${CACHE_SCOPE}");
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
    const source = read("api/health/public.ts");

    expect(source).toContain("process.env.VERCEL_ENV || process.env.NODE_ENV");
    expect(source).toContain('if (environment === "production") return "production"');
    expect(source).toContain("process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL");
    expect(source).toContain("return `${environment}:${deployment}`");
  });

  it("checks the declared OpenAI voice fallback instead of inferring Gemini readiness", () => {
    const functionSource = read("api/health/public.ts");
    const probeSource = read("src/lib/public-health-probe.ts");

    expect(functionSource).toContain("VAPI_VOICE_FALLBACK_MODEL");
    expect(functionSource).toContain("voiceFallbackPromise");
    expect(functionSource).toContain("const primaryVoiceModel: string");
    expect(functionSource).toContain("const fallbackVoiceModel: string");
    expect(functionSource).not.toContain("GEMINI_API_KEY");
    expect(probeSource).toContain("/v1/models/${encodeURIComponent(model)}");
    expect(probeSource).toContain('method: "GET"');
    expect(probeSource).not.toContain("/v1/responses");
    expect(probeSource).not.toContain("max_output_tokens");
  });

  it("does not cache failures and preserves request correlation outside Express", () => {
    const source = read("api/health/public.ts");

    expect(source).toContain('import { randomUUID } from "node:crypto"');
    expect(source).toContain('res.setHeader("X-Request-Id", requestId)');
    expect(source).toContain('statusCode === 200 ? CACHE_CONTROL : "no-store"');
    expect(source).toContain('res.setHeader("Cache-Control", "no-store")');
    expect(source).toContain("requestId,");
    expect(source).toContain("cacheScope: CACHE_SCOPE");
    expect(source).toContain("console.error(");
    expect(source).not.toContain("console.warn(");
  });

  it("keeps the Express fallback from being the production public status implementation", () => {
    const directFunction = read("api/health/public.ts");
    const expressHealth = read("src/routes/health-routes.ts");

    expect(directFunction).toContain("probeOpenAIModel");
    expect(directFunction).toContain("RESULT_TTL_SECONDS");
    expect(expressHealth).toContain('router.get("/public"');
    expect(expressHealth).toContain("publicProbeCache");
    expect(directFunction).not.toContain("publicProbeCache");
  });
});
