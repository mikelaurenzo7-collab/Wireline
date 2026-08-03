import type { IncomingMessage, ServerResponse } from "node:http";
import { Redis } from "@upstash/redis";

import {
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_VOICE_FALLBACK_MODEL,
} from "../../src/lib/ai-models";
import {
  buildPublicHealthPayload,
  probeOpenAIModel,
  type PublicHealthLevel,
  type PublicHealthPayload,
} from "../../src/lib/public-health-probe";

function cacheScope(): string {
  const environment = String(process.env.VERCEL_ENV || process.env.NODE_ENV || "local")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 24) || "local";
  if (environment === "production") return "production";

  const deployment = String(
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL || "unknown",
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 64) || "unknown";
  return `${environment}:${deployment}`;
}

const CACHE_SCOPE = cacheScope();
const RESULT_KEY = `wireline:health:public:v3:${CACHE_SCOPE}`;
const LOCK_KEY = `wireline:health:public:probe-lock:v3:${CACHE_SCOPE}`;
const RESULT_TTL_SECONDS = 120;
const LOCK_TTL_SECONDS = 12;
const LOCAL_STALE_TTL_MS = 5 * 60_000;
const CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";
const LEVELS = new Set<PublicHealthLevel>(["operational", "degraded", "outage"]);

let redis: Redis | null = null;
let localCache: { payload: PublicHealthPayload; expiresAt: number } | null = null;

function redisClient(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function validPayload(value: unknown): value is PublicHealthPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicHealthPayload>;
  const components = candidate.components;
  return (
    typeof candidate.last_checked === "string" &&
    LEVELS.has(candidate.overall as PublicHealthLevel) &&
    !!components &&
    LEVELS.has(components.voice_runtime as PublicHealthLevel) &&
    LEVELS.has(components.voice_fallback as PublicHealthLevel) &&
    LEVELS.has(components.reasoning as PublicHealthLevel)
  );
}

function remember(payload: PublicHealthPayload): void {
  localCache = { payload, expiresAt: Date.now() + LOCAL_STALE_TTL_MS };
}

function freshLocalCache(): PublicHealthPayload | null {
  if (!localCache) return null;
  if (localCache.expiresAt <= Date.now()) {
    localCache = null;
    return null;
  }
  return localCache.payload;
}

function setCommonHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  payload: PublicHealthPayload | Record<string, unknown>,
  cacheSource?: "redis" | "probe" | "stale-local",
): void {
  setCommonHeaders(res);
  if (cacheSource) res.setHeader("X-Wireline-Health-Source", cacheSource);
  res.statusCode = statusCode;
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload));
}

function unavailablePayload(code: string): PublicHealthPayload & { code: string } {
  return {
    overall: "degraded",
    components: {
      voice_runtime: "degraded",
      voice_fallback: "degraded",
      reasoning: "degraded",
    },
    last_checked: new Date().toISOString(),
    code,
  };
}

async function readCached(client: Redis): Promise<PublicHealthPayload | null> {
  const cached = await client.get<PublicHealthPayload>(RESULT_KEY);
  if (!validPayload(cached)) return null;
  remember(cached);
  return cached;
}

async function waitForConcurrentProbe(client: Redis): Promise<PublicHealthPayload | null> {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const cached = await readCached(client);
    if (cached) return cached;
  }
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET";
  if (method === "OPTIONS") {
    setCommonHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    sendJson(req, res, 405, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const client = redisClient();
  if (!client) {
    sendJson(req, res, 503, unavailablePayload("DISTRIBUTED_CACHE_REQUIRED"));
    return;
  }

  try {
    const cached = await readCached(client);
    if (cached) {
      sendJson(req, res, 200, cached, "redis");
      return;
    }

    const lock = await client.set(LOCK_KEY, Date.now(), {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (lock !== "OK") {
      const concurrent = await waitForConcurrentProbe(client);
      if (concurrent) {
        sendJson(req, res, 200, concurrent, "redis");
        return;
      }
      const stale = freshLocalCache();
      if (stale) {
        sendJson(req, res, 200, stale, "stale-local");
        return;
      }
      sendJson(req, res, 503, unavailablePayload("PROBE_REFRESH_IN_PROGRESS"));
      return;
    }

    const voicePromise = probeOpenAIModel(
      VAPI_TENANT_DEFAULT_MODEL,
      process.env.OPENAI_API_KEY,
    );
    const voiceFallbackPromise =
      VAPI_VOICE_FALLBACK_MODEL === VAPI_TENANT_DEFAULT_MODEL
        ? voicePromise
        : probeOpenAIModel(VAPI_VOICE_FALLBACK_MODEL, process.env.OPENAI_API_KEY);
    const [voice, voiceFallback, reasoning] = await Promise.all([
      voicePromise,
      voiceFallbackPromise,
      probeOpenAIModel(OPENAI_STRUCTURED_PRIMARY_MODEL, process.env.OPENAI_API_KEY),
    ]);
    const payload = buildPublicHealthPayload({ voice, voiceFallback, reasoning });
    remember(payload);
    await client.set(RESULT_KEY, payload, { ex: RESULT_TTL_SECONDS });
    sendJson(req, res, 200, payload, "probe");
  } catch (error) {
    console.warn("Public health distributed cache unavailable; refusing external probe fan-out", {
      error: error instanceof Error ? error.message : String(error),
    });
    const stale = freshLocalCache();
    if (stale) {
      sendJson(req, res, 200, stale, "stale-local");
      return;
    }
    sendJson(req, res, 503, unavailablePayload("DISTRIBUTED_CACHE_UNAVAILABLE"));
  }
}
