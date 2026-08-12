import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Redis } from "@upstash/redis";

import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "../lib/ai-models";
import {
  buildPublicHealthPayload,
  probeOpenAIModel,
  probeVapiManagedVoice,
  type PublicHealthLevel,
  type PublicHealthPayload,
  type PublicModelProbe,
} from "../lib/public-health-probe";

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

function deployedSourceCommit(): string | null {
  const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
}

const CACHE_SCOPE = cacheScope();
const SOURCE_COMMIT = deployedSourceCommit();
const RESULT_KEY = `wireline:health:public:v4:${CACHE_SCOPE}`;
const LOCK_KEY = `wireline:health:public:probe-lock:v4:${CACHE_SCOPE}`;
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // A commit SHA is non-secret release metadata. Keeping it in a response header
  // lets capture/release tooling prove that the production URL being recorded is
  // actually serving the same source commit as the clean checkout being certified.
  if (SOURCE_COMMIT) res.setHeader("X-Wireline-Source-Commit", SOURCE_COMMIT);
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  payload: PublicHealthPayload | Record<string, unknown>,
  cacheSource?: "redis" | "probe" | "stale-local",
): void {
  setCommonHeaders(res);
  res.setHeader("Cache-Control", statusCode === 200 ? CACHE_CONTROL : "no-store");
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

function logProviderProbeFailures(
  requestId: string,
  probes: Array<{ component: "voice_runtime" | "reasoning"; probe: PublicModelProbe }>,
): void {
  const failures = probes
    .filter(({ probe }) => !probe.ok)
    .map(({ component, probe }) => ({
      component,
      model: probe.model,
      latency_ms: probe.latency_ms,
      error: probe.error || "provider probe failed",
    }));
  if (failures.length === 0) return;

  // Provider diagnostics belong in internal runtime logs, never the public
  // status payload. Probe errors are already bounded to 240 characters and do
  // not contain request credentials. A degraded upstream probe is operational
  // telemetry, not an application exception, so keep it at warning severity.
  // eslint-disable-next-line no-console
  console.warn("Public health provider probe degraded", {
    requestId,
    cacheScope: CACHE_SCOPE,
    failures,
  });
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
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);

  const method = req.method || "GET";
  if (method === "OPTIONS") {
    setCommonHeaders(res);
    res.setHeader("Cache-Control", "no-store");
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

    // Vapi owns the managed call runtime and its same-provider model fallback.
    // Runtime health therefore probes Vapi's authenticated control plane rather
    // than incorrectly asking Wireline's direct OpenAI key to resolve a model
    // that Vapi serves. A separate credentialed diagnostic can create, read,
    // verify, and delete one inert assistant when those credentials are supplied.
    const managedVoicePromise = probeVapiManagedVoice(process.env.VAPI_PRIVATE_KEY);
    const [voice, reasoning] = await Promise.all([
      managedVoicePromise,
      probeOpenAIModel(OPENAI_STRUCTURED_PRIMARY_MODEL, process.env.OPENAI_API_KEY),
    ]);
    logProviderProbeFailures(requestId, [
      { component: "voice_runtime", probe: voice },
      { component: "reasoning", probe: reasoning },
    ]);
    const payload = buildPublicHealthPayload({
      voice,
      voiceFallback: voice,
      reasoning,
    });
    remember(payload);
    await client.set(RESULT_KEY, payload, { ex: RESULT_TTL_SECONDS });
    sendJson(req, res, 200, payload, "probe");
  } catch (error) {
    console.error("Public health distributed cache unavailable; refusing external probe fan-out", {
      requestId,
      cacheScope: CACHE_SCOPE,
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
