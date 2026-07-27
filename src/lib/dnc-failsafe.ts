import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const KEY_PREFIX = "wireline:dnc-failsafe:";
let redis: Redis | null = null;

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function canonicalPhone(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function dncFailsafeKey(userId: string, phone: string): string | null {
  const canonicalUserId = userId.trim();
  const canonicalNumber = canonicalPhone(phone);
  if (!canonicalUserId || canonicalNumber.length < 7) return null;
  const digest = createHash("sha256")
    .update(`${canonicalUserId}:${canonicalNumber}`)
    .digest("hex");
  return `${KEY_PREFIX}${digest}`;
}

/**
 * Emergency compliance ledger used only when a verified STOP cannot be written
 * to Postgres. Entries intentionally do not expire: an opt-out remains binding
 * until a verified START or an authorized data-repair workflow clears it.
 */
export async function recordDncFailsafe(userId: string, phone: string): Promise<boolean> {
  const key = dncFailsafeKey(userId, phone);
  const store = getRedis();
  if (!key || !store) return false;
  try {
    await store.set(key, Date.now());
    return true;
  } catch {
    return false;
  }
}

/** Clear only after the corresponding SMS-created opt-out has been reversed. */
export async function clearDncFailsafe(userId: string, phone: string): Promise<boolean> {
  const key = dncFailsafeKey(userId, phone);
  const store = getRedis();
  if (!key) return false;
  if (!store) return !isProductionLike();
  try {
    await store.del(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Outbound voice treats the failsafe as part of the authoritative DNC gate.
 * Production fails closed if the shared compliance store cannot be checked.
 */
export async function isDncFailsafeBlocked(userId: string, phone: string): Promise<boolean> {
  const key = dncFailsafeKey(userId, phone);
  if (!key) return false;
  const store = getRedis();
  if (!store) {
    if (isProductionLike()) throw new Error("DNC_FAILSAFE_UNAVAILABLE");
    return false;
  }
  try {
    return (await store.exists(key)) === 1;
  } catch {
    if (isProductionLike()) throw new Error("DNC_FAILSAFE_UNAVAILABLE");
    return false;
  }
}

export function resetDncFailsafeForTests(): void {
  redis = null;
}
