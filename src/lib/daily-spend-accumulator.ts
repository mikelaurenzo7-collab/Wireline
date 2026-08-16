/**
 * Distributed 24-hour Claude spend accumulator (Upstash Redis).
 *
 * Serverless cold starts reset in-process counters; this store is shared
 * across all Vercel instances via INCRBY + PEXPIRE on a rolling 24h key.
 */
import { Redis } from "@upstash/redis";
import { log } from "./server-context";

const REDIS_KEY = "wireline:claude:daily-spend:micro";
const WINDOW_MS = 24 * 60 * 60_000;
const MICRO_PER_USD = 1_000_000;

let redis: Redis | null = null;
let warnedNoRedis = false;

/** In-process fallback when Redis is unavailable (dev / misconfigured prod). */
let memWindowStart = Date.now();
let memAccumMicro = 0;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function warnNoRedisOnce(): void {
  if (warnedNoRedis) return;
  warnedNoRedis = true;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    log.warn(
      "[daily-spend] UPSTASH_REDIS_REST_URL not set, 24h Claude cap is per-instance only. " +
        "Configure Upstash Redis for Assistants-wide protection.",
    );
  }
}

function usdFromMicro(micro: number): number {
  return micro / MICRO_PER_USD;
}

function readMemAccumMicro(now = Date.now()): number {
  if (now - memWindowStart > WINDOW_MS) {
    memWindowStart = now;
    memAccumMicro = 0;
  }
  return memAccumMicro;
}

/**
 * Record Claude spend against the system-wide 24h cap.
 */
export async function recordDailySpendUsd(usd: number): Promise<void> {
  if (!(usd > 0)) return;
  const micro = Math.round(usd * MICRO_PER_USD);
  if (micro <= 0) return;

  const r = getRedis();
  if (r) {
    try {
      const totalMicro = (await r.incrby(REDIS_KEY, micro)) as number;
      if (totalMicro === micro) {
        await r.pexpire(REDIS_KEY, WINDOW_MS);
      }
      return;
    } catch (err) {
      log.warn("[daily-spend] Redis INCRBY failed, falling back to memory", {
        error: (err as Error).message,
      });
    }
  } else {
    warnNoRedisOnce();
  }

  const now = Date.now();
  const prev = readMemAccumMicro(now);
  memAccumMicro = prev + micro;
}

/**
 * Current accumulated USD in the rolling 24h window.
 */
export async function getDailySpendUsd(): Promise<number> {
  const r = getRedis();
  if (r) {
    try {
      const raw = await r.get<number | string>(REDIS_KEY);
      const micro = typeof raw === "string" ? Number(raw) : Number(raw ?? 0);
      return usdFromMicro(Number.isFinite(micro) ? micro : 0);
    } catch (err) {
      log.warn("[daily-spend] Redis GET failed, falling back to memory", {
        error: (err as Error).message,
      });
    }
  } else {
    warnNoRedisOnce();
  }
  return usdFromMicro(readMemAccumMicro());
}

/** Ms until the in-memory window resets (Redis TTL not exposed — conservative estimate). */
export function estimateMemWindowResetMs(now = Date.now()): number {
  return Math.max(0, WINDOW_MS - (now - memWindowStart));
}

export type DailySpendWindowBackend = "redis" | "memory";

export interface DailySpendWindowReset {
  resetMs: number;
  backend: DailySpendWindowBackend;
}

/**
 * Ms until the rolling 24h spend window resets — Redis PTTL when available,
 * otherwise the in-process fallback clock.
 */
export async function getDailySpendWindowReset(): Promise<DailySpendWindowReset> {
  const r = getRedis();
  if (r) {
    try {
      const ttl = (await r.pttl(REDIS_KEY)) as number;
      if (Number.isFinite(ttl) && ttl > 0) {
        return { resetMs: ttl, backend: "redis" };
      }
      return { resetMs: WINDOW_MS, backend: "redis" };
    } catch (err) {
      log.warn("[daily-spend] Redis PTTL failed, falling back to memory window", {
        error: (err as Error).message,
      });
    }
  } else {
    warnNoRedisOnce();
  }
  return { resetMs: estimateMemWindowResetMs(), backend: "memory" };
}

/** Test-only reset of in-memory fallback state. */
export function resetDailySpendMemStateForTests(): void {
  memWindowStart = Date.now();
  memAccumMicro = 0;
  warnedNoRedis = false;
}
