/**
 * Live Video session settlement.
 *
 * A session reserves its whole allowance slice (5 minutes, ×2 for FULL engines)
 * atomically at mint time, before the browser has proven it can reach the
 * provider at all. That ceiling is deliberate — it is what makes the
 * pause-at-limit promise real and what protects the modeled margin — but it was
 * also final: the only release path covered a server-side mint failure. A
 * customer behind a corporate firewall that blocks WebRTC could press Start
 * twelve times, never see a single frame, and have spent the entire month.
 *
 * Settlement closes that. The mint hands the client a signed receipt; when the
 * stage closes, the client reports how many seconds of presenter it actually
 * watched, and the unused whole minutes go back.
 *
 * Single-use is enforced through the shared Redis control plane. When that
 * store is unavailable the refund is DECLINED rather than applied twice: a
 * missed refund leaves the tenant exactly where today's code already leaves
 * them, while a double refund would hand back allowance that was really spent.
 * Every declined settlement is logged so the gap is visible rather than silent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

import { log } from "../server-context";
import { isVaultConfigured, getDataKey } from "../secret-vault";
import { liveVideoSessionReservationMinutes } from "./live-video-policy";
import { releaseLiveVideoSessionReservation } from "./live-video-usage";

const RECEIPT_LABEL = "live-video-settlement-v1";
const RECEIPT_TTL_SECONDS = 60 * 60;
const CLAIM_KEY_PREFIX = "wireline:live-video:settlement:";
/** Outlives the receipt so a replay after expiry still cannot double-refund. */
const CLAIM_TTL_SECONDS = 24 * 60 * 60;

let redis: Redis | null = null;
const developmentClaims = new Set<string>();

function getRedis(): Redis | null {
  // Unit tests must never claim production settlement nonces merely because a
  // hosted build injects the real Upstash credentials. The Vercel deep-audit
  // subprocess explicitly runs with NODE_ENV=test; keep that boundary
  // authoritative even if this module previously cached a client.
  if (process.env.NODE_ENV === "test") return null;
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/**
 * Settlement refunds are single-use through Redis. Production must not mint a
 * session it cannot later settle, or a blocked WebRTC path burns the month.
 */
export function isLiveVideoSettlementStoreReady(): boolean {
  if (process.env.NODE_ENV === "test") return true;
  if (getRedis()) return true;
  return !isProductionRuntime();
}

/**
 * Fails closed in production rather than falling back to a public constant.
 *
 * The receipt authorizes a write against the allowance ledger. Signing it with
 * a well-known development string would let any authenticated tenant forge
 * current-period claims with fresh nonces and refund itself without ever
 * minting a matching reservation — the allowance cap would stop existing.
 */
function receiptKey(): string {
  if (!isVaultConfigured()) {
    if (isProductionRuntime()) {
      throw new Error(
        "WIRELINE_DATA_KEY is required to sign Live Video settlement receipts in production",
      );
    }
    return createHmac("sha256", "wireline-dev-live-video-settlement")
      .update(RECEIPT_LABEL)
      .digest("hex");
  }
  return createHmac("sha256", getDataKey().toString("base64")).update(RECEIPT_LABEL).digest("hex");
}

export type LiveVideoSettlementClaim = {
  userId: string;
  periodKey: string;
  reservedMinutes: number;
  creditsPerMinute: number;
  nonce: string;
  /** Server mint time. The floor on how much of the session really elapsed. */
  issuedAtMs: number;
  /** Provider hard cap, so a late settle cannot be charged past the session. */
  maxSessionSeconds: number;
  expiresAtMs: number;
};

/**
 * Sign a single-use settlement receipt. The payload is not secret — it carries
 * no tenant data beyond the opaque user id the holder already authenticated as,
 * and the server re-checks that ownership before refunding anything.
 */
export function signLiveVideoSettlementReceipt(
  claim: Omit<LiveVideoSettlementClaim, "expiresAtMs" | "issuedAtMs">,
  nowMs: number = Date.now(),
): string {
  const payload: LiveVideoSettlementClaim = {
    ...claim,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + RECEIPT_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", receiptKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyLiveVideoSettlementReceipt(
  receipt: unknown,
  nowMs: number = Date.now(),
): LiveVideoSettlementClaim | null {
  if (typeof receipt !== "string" || receipt.length > 2048) return null;
  const dot = receipt.indexOf(".");
  if (dot <= 0) return null;
  const encoded = receipt.slice(0, dot);
  const signature = receipt.slice(dot + 1);
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", receiptKey()).update(encoded).digest("base64url");
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<LiveVideoSettlementClaim> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    if (typeof parsed.periodKey !== "string" || !parsed.periodKey) return null;
    if (typeof parsed.nonce !== "string" || !parsed.nonce) return null;
    if (!Number.isFinite(parsed.reservedMinutes) || (parsed.reservedMinutes as number) <= 0) {
      return null;
    }
    if (!Number.isFinite(parsed.expiresAtMs) || (parsed.expiresAtMs as number) <= nowMs) {
      return null;
    }
    if (!Number.isFinite(parsed.issuedAtMs) || (parsed.issuedAtMs as number) > nowMs) return null;
    return {
      userId: parsed.userId,
      periodKey: parsed.periodKey,
      reservedMinutes: Math.min(
        liveVideoSessionReservationMinutes(4),
        Math.floor(parsed.reservedMinutes as number),
      ),
      creditsPerMinute: Number.isFinite(parsed.creditsPerMinute)
        ? Math.min(4, Math.max(1, Math.floor(parsed.creditsPerMinute as number)))
        : 1,
      nonce: parsed.nonce,
      issuedAtMs: parsed.issuedAtMs as number,
      maxSessionSeconds: Number.isFinite(parsed.maxSessionSeconds)
        ? Math.max(0, Math.floor(parsed.maxSessionSeconds as number))
        : 0,
      expiresAtMs: parsed.expiresAtMs as number,
    };
  } catch {
    return null;
  }
}

/**
 * Seconds this session must be charged for.
 *
 * The client's own figure is a claim, not evidence: a modified client could
 * report 0 immediately after minting, take the whole reservation back, and keep
 * talking to a provider session that is still running — repeating that per
 * receipt would remove the monthly cap entirely. The server knows when it
 * minted the token, so wall-clock elapsed time since then is a hard floor on
 * how much of the session can possibly have been used.
 *
 * Charged = max(client-reported, server-elapsed), clamped to the provider cap
 * because the session cannot outlive it. Settling promptly — which the stage
 * does — makes the two agree; settling late only ever charges more, which is
 * the same conservative direction as not refunding at all.
 */
export function liveVideoChargeableSeconds(input: {
  clientWatchedSeconds: number;
  issuedAtMs: number;
  maxSessionSeconds: number;
  nowMs?: number;
}): number {
  const now = input.nowMs ?? Date.now();
  const claimed = Number.isFinite(input.clientWatchedSeconds)
    ? Math.max(0, input.clientWatchedSeconds)
    : 0;
  const elapsed = Number.isFinite(input.issuedAtMs)
    ? Math.max(0, (now - input.issuedAtMs) / 1000)
    : 0;
  const cap = input.maxSessionSeconds > 0 ? input.maxSessionSeconds : Number.POSITIVE_INFINITY;
  return Math.min(cap, Math.max(claimed, elapsed));
}

/**
 * Allowance minutes to hand back for a session that consumed `chargedSeconds`.
 *
 * Whole minutes only, rounded UP in the tenant's disfavour so a 61-second
 * session is charged the two minutes it really occupied, and scaled by the
 * engine's credit rate exactly as the reservation was.
 */
export function liveVideoRefundMinutes(
  reservedMinutes: number,
  chargedSeconds: number,
  creditsPerMinute = 1,
): number {
  const credits = Number.isFinite(creditsPerMinute)
    ? Math.min(4, Math.max(1, Math.floor(creditsPerMinute)))
    : 1;
  const charged = Number.isFinite(chargedSeconds) ? Math.max(0, chargedSeconds) : 0;
  const consumed = Math.ceil(charged / 60) * credits;
  return Math.max(0, Math.min(reservedMinutes, reservedMinutes - consumed));
}

export type LiveVideoSettlementClaimResult = "claimed" | "duplicate" | "unavailable";

/**
 * Claim the right to refund one session exactly once.
 *
 * Exported because this — not the ledger write behind it — is the property that
 * makes settlement safe to retry from an unreliable client.
 */
export async function claimLiveVideoSettlementOnce(
  nonce: string,
): Promise<LiveVideoSettlementClaimResult> {
  const store = getRedis();
  if (store) {
    try {
      const result = await store.set(`${CLAIM_KEY_PREFIX}${nonce}`, Date.now(), {
        nx: true,
        ex: CLAIM_TTL_SECONDS,
      });
      return result === "OK" ? "claimed" : "duplicate";
    } catch {
      return "unavailable";
    }
  }
  if (isProductionRuntime()) {
    return "unavailable";
  }
  if (developmentClaims.has(nonce)) return "duplicate";
  developmentClaims.add(nonce);
  return "claimed";
}

/**
 * Hand a claim back when the ledger write it guarded did not happen.
 *
 * The claim and the quota update cannot share a transaction — one is in Redis
 * and one is in Postgres. Without this, a refund whose UPDATE threw would leave
 * the nonce burned for a full day and every retry answering "already settled",
 * so the tenant could never recover minutes they genuinely did not use. The
 * asymmetry is deliberate: releasing a claim can only ever permit a retry of a
 * refund that has not been applied.
 */
async function releaseLiveVideoSettlementClaim(nonce: string): Promise<void> {
  const store = getRedis();
  if (store) {
    await store.del(`${CLAIM_KEY_PREFIX}${nonce}`).catch(() => undefined);
    return;
  }
  developmentClaims.delete(nonce);
}

export type LiveVideoSettlementResult = {
  settled: boolean;
  refundedMinutes: number;
  reason: "settled" | "nothing_to_refund" | "already_settled" | "claim_unavailable";
};

/** Refund the unused slice of one session's reservation. Safe to call twice. */
export async function settleLiveVideoSession(input: {
  claim: LiveVideoSettlementClaim;
  watchedSeconds: number;
  nowMs?: number;
}): Promise<LiveVideoSettlementResult> {
  // Server-anchored, not client-reported — see liveVideoChargeableSeconds.
  const chargedSeconds = liveVideoChargeableSeconds({
    clientWatchedSeconds: input.watchedSeconds,
    issuedAtMs: input.claim.issuedAtMs,
    maxSessionSeconds: input.claim.maxSessionSeconds,
    nowMs: input.nowMs,
  });
  const refundedMinutes = liveVideoRefundMinutes(
    input.claim.reservedMinutes,
    chargedSeconds,
    input.claim.creditsPerMinute,
  );
  if (refundedMinutes <= 0) {
    return { settled: true, refundedMinutes: 0, reason: "nothing_to_refund" };
  }

  const claimed = await claimLiveVideoSettlementOnce(input.claim.nonce);
  if (claimed === "duplicate") {
    return { settled: false, refundedMinutes: 0, reason: "already_settled" };
  }
  if (claimed === "unavailable") {
    // Declining is the conservative direction: the tenant keeps today's
    // behavior instead of risking a refund applied twice.
    log.warn("Live Video settlement declined, idempotency store unavailable", {
      periodKey: input.claim.periodKey,
      refundedMinutes,
    });
    return { settled: false, refundedMinutes: 0, reason: "claim_unavailable" };
  }

  try {
    await releaseLiveVideoSessionReservation(
      input.claim.userId,
      input.claim.periodKey,
      refundedMinutes,
    );
  } catch (error) {
    // The claim guarded a write that did not land. Give it back so a retry can
    // still recover minutes the tenant genuinely did not use, instead of the
    // nonce sitting burned for a day answering "already settled".
    await releaseLiveVideoSettlementClaim(input.claim.nonce);
    throw error;
  }
  return { settled: true, refundedMinutes, reason: "settled" };
}

export function resetLiveVideoSettlementClaimsForTests(): void {
  developmentClaims.clear();
  redis = null;
}
