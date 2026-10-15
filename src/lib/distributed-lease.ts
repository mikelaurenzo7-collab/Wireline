import { randomUUID } from "node:crypto";

import type { Redis } from "@upstash/redis";
import { createUpstashRedis } from "./upstash-redis";

const KEY_PREFIX = "botbound:lease:";

let redis: Redis | null = null;
const memoryLeases = new Map<string, { token: string; expiresAt: number }>();

export type DistributedLease = {
  backend: "redis" | "memory";
  renew: () => Promise<boolean>;
  release: () => Promise<void>;
};

export type DistributedLeaseDecision =
  { status: "acquired"; lease: DistributedLease } | { status: "held" } | { status: "unavailable" };

function configuredRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = createUpstashRedis(url, token);
  return redis;
}

function productionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export async function acquireDistributedLease(
  name: string,
  ttlMs: number,
): Promise<DistributedLeaseDecision> {
  const normalizedName = name.trim();
  if (!/^[a-z0-9:_-]{1,120}$/i.test(normalizedName) || !Number.isFinite(ttlMs) || ttlMs < 5_000) {
    return { status: "unavailable" };
  }
  const key = `${KEY_PREFIX}${normalizedName}`;
  const token = randomUUID();
  const store = configuredRedis();
  if (store) {
    try {
      const acquired = await store.set(key, token, { nx: true, px: Math.floor(ttlMs) });
      if (acquired !== "OK") return { status: "held" };
      return {
        status: "acquired",
        lease: {
          backend: "redis",
          renew: async () => {
            const result = await store.eval<[string, string], number>(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
              [key],
              [token, String(Math.floor(ttlMs))],
            );
            return Number(result) === 1;
          },
          release: async () => {
            await store.eval<[string], number>(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
              [key],
              [token],
            );
          },
        },
      };
    } catch {
      return { status: "unavailable" };
    }
  }

  if (productionRuntime()) return { status: "unavailable" };
  const now = Date.now();
  const existing = memoryLeases.get(key);
  if (existing && existing.expiresAt > now) return { status: "held" };
  memoryLeases.set(key, { token, expiresAt: now + ttlMs });
  return {
    status: "acquired",
    lease: {
      backend: "memory",
      renew: async () => {
        const current = memoryLeases.get(key);
        if (current?.token !== token) return false;
        current.expiresAt = Date.now() + ttlMs;
        return true;
      },
      release: async () => {
        if (memoryLeases.get(key)?.token === token) memoryLeases.delete(key);
      },
    },
  };
}

export function resetDistributedLeasesForTests(): void {
  memoryLeases.clear();
  redis = null;
}
