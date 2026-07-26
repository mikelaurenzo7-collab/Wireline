/* eslint-disable @typescript-eslint/no-explicit-any -- Drizzle's transaction callback receives a PgTransaction whose full generic type is unwieldy to spell out; `tx: any` matches the pattern used across the data layer. */
/**
 * Prepaid credit wallet — an append-only USD ledger (wireline_credit_ledger).
 *
 * Credits are purchased on the WEB (Stripe); the iOS app is read-only on
 * billing to stay clear of Apple's IAP rules. Credits absorb voice-minute
 * overage before Stripe metering: a user with no balance bills exactly as
 * before, so this is purely additive.
 *
 * Concurrency: every mutation runs inside a transaction holding a per-user
 * advisory lock, so concurrent debits/credits can't race on the balance. The
 * (user, ref_type, ref_id) unique index makes each movement idempotent under
 * webhook/Vapi retries.
 */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, sql, desc } from "drizzle-orm";

export interface LedgerEntry {
  id: string;
  deltaUsd: number;
  balanceAfterUsd: number;
  entryKind: string;
  reason: string;
  customerReason: string | null;
  createdAt: string | null;
}

export interface LedgerRef {
  type: string;
  id: string;
  entryKind?: "top_up" | "burn" | "refund" | "adjustment" | "grant" | "reversal";
  idempotencyKey?: string;
  source?: string;
  provider?: string;
  providerEventId?: string;
  providerObjectId?: string;
  customerReason?: string;
  metadata?: Record<string, unknown>;
}

/** Current balance in USD (sum of all deltas; 0 when there are no rows). */
export async function getCreditBalanceUsd(userId: string): Promise<number> {
  const [row] = await drizzle
    .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId));
  return Number(row?.balance ?? 0);
}

/** Recent ledger entries, newest first. */
export async function getRecentLedger(userId: string, limit = 20): Promise<LedgerEntry[]> {
  const rows = await drizzle
    .select({
      id: schema.creditLedger.id,
      deltaUsd: schema.creditLedger.deltaUsd,
      balanceAfterUsd: schema.creditLedger.balanceAfterUsd,
      entryKind: schema.creditLedger.entryKind,
      reason: schema.creditLedger.reason,
      customerReason: schema.creditLedger.customerReason,
      createdAt: schema.creditLedger.createdAt,
    })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(Math.min(Math.max(1, limit), 100));
  return rows.map((r) => ({
    id: r.id,
    deltaUsd: Number(r.deltaUsd),
    balanceAfterUsd: Number(r.balanceAfterUsd),
    entryKind: r.entryKind,
    reason: r.reason,
    customerReason: r.customerReason,
    createdAt: r.createdAt ? new Date(r.createdAt as unknown as string).toISOString() : null,
  }));
}

/** Round to whole cents to avoid float drift in the ledger. */
function cents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

async function appendLedger(
  userId: string,
  deltaUsd: number,
  reason: string,
  ref?: LedgerRef,
): Promise<{ applied: number; balance: number }> {
  return drizzle.transaction(async (tx: any) => {
    // Serialize all wallet mutations for this user.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [sumRow] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId));
    const balance = Number(sumRow?.balance ?? 0);
    const balanceAfter = cents(balance + deltaUsd);

    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        userId,
        deltaUsd: String(cents(deltaUsd)),
        balanceAfterUsd: String(balanceAfter),
        entryKind: ref?.entryKind ?? (deltaUsd > 0 ? "top_up" : "burn"),
        reason,
        customerReason: ref?.customerReason ?? reason,
        refType: ref?.type ?? null,
        refId: ref?.id ?? null,
        idempotencyKey: ref?.idempotencyKey ?? (ref ? `${ref.type}:${ref.id}` : null),
        source: ref?.source ?? "wireline",
        provider: ref?.provider ?? null,
        providerEventId: ref?.providerEventId ?? null,
        providerObjectId: ref?.providerObjectId ?? null,
        metadata: ref?.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: schema.creditLedger.id });

    // Conflict → this movement already happened (idempotent retry): no change.
    if (inserted.length === 0) return { applied: 0, balance };
    return { applied: deltaUsd, balance: balanceAfter };
  });
}

export interface CreditMutationResult {
  balance: number;
  applied: number;
}

/**
 * Add credit (a web Stripe top-up or a manual grant). Idempotent per `ref`.
 * Throws on persistence failure so webhook handlers can retry.
 */
export async function addCredit(
  userId: string,
  amountUsd: number,
  reason: string,
  ref?: LedgerRef,
): Promise<CreditMutationResult> {
  const amount = cents(amountUsd);
  if (!(amount > 0)) {
    const balance = await getCreditBalanceUsd(userId);
    return { balance, applied: 0 };
  }
  const { applied, balance } = await appendLedger(userId, amount, reason, ref);
  return { balance, applied };
}

/**
 * Reverse a prior credit — e.g. a refunded or disputed web top-up. Idempotent
 * per `ref`. Throws on persistence failure.
 */
export async function reverseCredit(
  userId: string,
  amountUsd: number,
  reason: string,
  ref?: LedgerRef,
): Promise<CreditMutationResult> {
  const amount = cents(amountUsd);
  if (!(amount > 0)) {
    const balance = await getCreditBalanceUsd(userId);
    return { balance, applied: 0 };
  }
  const { applied, balance } = await appendLedger(userId, -amount, reason, ref);
  return { balance, applied: Math.abs(applied) };
}

/**
 * Debit Conversation Balance for pay-as-you-go voice usage. Debits up to the
 * available balance (partial coverage) so we never silently absorb COGS.
 * Idempotent per call id.
 */
export async function debitForVoiceUsage(
  userId: string,
  costUsd: number,
  vapiCallId: string,
): Promise<number> {
  const cost = cents(costUsd);
  if (!(cost > 0)) return 0;
  try {
    return await drizzle.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      const [sumRow] = await tx
        .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.userId, userId));
      const balance = Number(sumRow?.balance ?? 0);
      if (balance <= 0) return 0;

      const debitAmount = cents(Math.min(balance, cost));
      const inserted = await tx
        .insert(schema.creditLedger)
        .values({
          userId,
          deltaUsd: String(-debitAmount),
          balanceAfterUsd: String(cents(balance - debitAmount)),
          entryKind: "burn",
          reason: "voice_usage",
          customerReason: "Voice minutes covered by Conversation Balance",
          refType: "voice_usage",
          refId: vapiCallId,
          idempotencyKey: `voice_usage:${vapiCallId}`,
          source: "vapi",
          provider: "vapi",
          providerObjectId: vapiCallId,
          metadata: { burn_reason: "voice_usage", requested_usd: cost, debited_usd: debitAmount },
        })
        .onConflictDoNothing()
        .returning({ id: schema.creditLedger.id });
      return inserted.length === 0 ? 0 : debitAmount;
    });
  } catch (err) {
    log.error("debitForVoiceUsage failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
