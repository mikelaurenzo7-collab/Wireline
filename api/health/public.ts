import type { IncomingMessage, ServerResponse } from "node:http";
import { Redis } from "@upstash/redis";

import {
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
} from "../../src/lib/ai-models";
import {
  buildPublicHealthPayload,
  probeOpenAIModel,
  type PublicHealthLevel,
  type PublicHealthPayload,
} from "../../src/lib/public-health-probe";

const RESULT_KEY = "wireline:health:public:v2";
const LOCK_KEY = "wireline:health:public:probe-lock:v2";
const RESULT_TTL_SECONDS = 120;
const LOCK_TTL_SECONDS = 12;
const CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";
const LEVELS = new Set<PublicHealthLevel>(["operational", "degraded", "outage"]);

let redis: Redis | null = null;
let localCache: PublicHealthPayload | null = null;

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
): void {
  setCommonHeaders(res);
  res.statusCode = statusCode;
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload));
}

function unavailablePayload(code: string): PublicHealthPayload & { code: string } {
  return {
    overall: "degraded",
    components: {
      voice_runtime: "degraded",
      voice_fallback: process.env.GEMINI_API_KEY ? "operational" : "degraded",
      reasoning: "degraded",
    },
    last_checked: new Date().toISOString(),
    code,
  };
}

async function readCached(client: Redis): Promise<PublicHealthPayload | null> {
  const cached = await client.get<PublicHealthPayload>(RESULT_KEY);
  if (!validPayload(cached)) return null;
  localCache = cached;
  return cached;
}

async function waitForConcurrentProbe(client: Redis): Promise<PublicHealthPayload | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 125));
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
      sendJson(req, res, 200, cached);
      return;
    }

    const lock = await client.set(LOCK_KEY, Date.now(), {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (lock !== "OK") {
      const concurrent = await waitForConcurrentProbe(client);
      if (concurrent) {
        sendJson(req, res, 200, concurrent);
        return;
      }
      if (localCache) {
        sendJson(req, res, 200, localCache);
        return;
      }
      sendJson(req, res, 503, unavailablePayload("PROBE_REFRESH_IN_PROGRESS"));
      return;
    }

    const [voice, reasoning] = await Promise.all([
      probeOpenAIModel(VAPI_TENANT_DEFAULT_MODEL, process.env.OPENAI_API_KEY),
      probeOpenAIModel(OPENAI_STRUCTURED_PRIMARY_MODEL, process.env.OPENAI_API_KEY),
    ]);
    const payload = buildPublicHealthPayload({
      voice,
      reasoning,
      voiceFallbackConfigured: !!process.env.GEMINI_API_KEY,
    });
    localCache = payload;
    await client.set(RESULT_KEY, payload, { ex: RESULT_TTL_SECONDS });
    sendJson(req, res, 200, payload);
  } catch (error) {
    console.warn("Public health distributed cache unavailable; refusing metered probe", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (localCache) {
      sendJson(req, res, 200, localCache);
      return;
    }
    sendJson(req, res, 503, unavailablePayload("DISTRIBUTED_CACHE_UNAVAILABLE"));
  }
}
