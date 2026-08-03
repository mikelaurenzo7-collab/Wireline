import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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

    expect(source).toContain('const RESULT_KEY = "wireline:health:public:v3"');
    expect(source).toContain('const LOCK_KEY = "wireline:health:public:probe-lock:v3"');
    expect(source).toContain('unavailablePayload("DISTRIBUTED_CACHE_REQUIRED")');
    expect(source).toContain('unavailablePayload("DISTRIBUTED_CACHE_UNAVAILABLE")');
    expect(source).toContain("LOCAL_STALE_TTL_MS");
    expect(source).toContain('"stale-local"');
    expect(source).not.toContain("let localCache: PublicHealthPayload | null");
    expect(clientGuard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(clientGuard);
    expect(probes).toBeGreaterThan(lock);
  });

  it("checks the declared OpenAI voice fallback instead of inferring Gemini readiness", () => {
    const functionSource = read("api/health/public.ts");
    const probeSource = read("src/lib/public-health-probe.ts");

    expect(functionSource).toContain("VAPI_VOICE_FALLBACK_MODEL");
    expect(functionSource).toContain("voiceFallbackPromise");
    expect(functionSource).not.toContain("GEMINI_API_KEY");
    expect(probeSource).toContain("/v1/models/${encodeURIComponent(model)}");
    expect(probeSource).toContain('method: "GET"');
    expect(probeSource).not.toContain("/v1/responses");
    expect(probeSource).not.toContain("max_output_tokens");
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
