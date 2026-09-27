import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { planById } from "./plan-catalog";
import { isOwnerEmail } from "./platform-owner-emails";
import { drizzle } from "./server-context";
import { VOICE_COMPLETION_GRACE_MINUTES } from "./voice-funding-policy";
import { resolveAllowanceWindow } from "./paid-allowance-period";

export { VOICE_COMPLETION_GRACE_MINUTES } from "./voice-funding-policy";

type FundingTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];
type FundingReader = Pick<typeof drizzle, "select">;
type FundingReceipt = typeof schema.creditLedger.$inferSelect;
export type VoiceCallFunding = {
  maxSeconds: number;
  prepaidHoldUsd: number;
  graceMinutes: number;
  startedAtMs: number;
  deadlineAtMs: number;
  includedMinutes: number;
  rateUsd: number;
  planId: string;
  periodKey: string;
  /** Confirmed non-delivery permanently closes customer liability. */
  released?: boolean;
};
export type VoiceFundingReleaseDisposition =
  "definite_preaccept" | "confirmed_startup_failure" | "confirmed_unanswered";

const cents = (value: number): number => Math.round(value * 100) / 100;
const admissionKey = (callId: string): string => `voice_admission:${callId}`;

async function receipt(tx: FundingReader, userId: string, key: string) {
  const [row] = await tx
    .select()
    .from(schema.creditLedger)
    .where(and(eq(schema.creditLedger.userId, userId), eq(schema.creditLedger.idempotencyKey, key)))
    .limit(1);
  return row;
}

async function balanceUsd(tx: FundingTransaction, userId: string): Promise<number> {
  const [row] = await tx
    .select({
      balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)`,
    })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId));
  const balance = Number(row?.balance);
  if (!Number.isFinite(balance))
    throw AppError.serviceUnavailable("Call funding could not be verified.");
  return cents(balance);
}

function savedFunding(row: FundingReceipt): VoiceCallFunding {
  const metadata = row.metadata as Record<string, unknown>;
  const maxSeconds = Number(metadata.max_seconds);
  const prepaidHoldUsd = Number(metadata.prepaid_hold_usd);
  const graceMinutes = Number(metadata.grace_minutes);
  const startedAtMs = Number(metadata.started_at_ms);
  const deadlineAtMs = Number(metadata.deadline_at_ms);
  const includedMinutes = Number(metadata.included_minutes);
  const rateUsd = Number(metadata.rate_usd);
  const planId = metadata.plan_id;
  const periodKey = metadata.period_key;
  if (
    metadata.funding_version !== 1 ||
    !Number.isSafeInteger(maxSeconds) ||
    maxSeconds <= 0 ||
    !Number.isFinite(prepaidHoldUsd) ||
    prepaidHoldUsd < 0 ||
    !Number.isSafeInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > VOICE_COMPLETION_GRACE_MINUTES ||
    !Number.isSafeInteger(startedAtMs) ||
    startedAtMs <= 0 ||
    deadlineAtMs !== startedAtMs + maxSeconds * 1000 ||
    cents(-Number(row.deltaUsd)) !== cents(prepaidHoldUsd) ||
    !Number.isSafeInteger(includedMinutes) ||
    includedMinutes < 0 ||
    includedMinutes > Math.ceil(maxSeconds / 60) ||
    !Number.isFinite(rateUsd) ||
    rateUsd <= 0 ||
    typeof planId !== "string" ||
    !planId ||
    typeof periodKey !== "string" ||
    !/^(?:\d{4}-\d{2}|paid:[A-Za-z0-9_]+:\d{1,16})$/.test(periodKey)
  ) {
    throw AppError.serviceUnavailable("The call funding receipt could not be verified.");
  }
  return {
    maxSeconds,
    prepaidHoldUsd,
    graceMinutes,
    startedAtMs,
    deadlineAtMs,
    includedMinutes,
    rateUsd,
    planId,
    periodKey,
  };
}

/** Durable timing only; this does not grant admission or reopen a settled hold. */
export async function getVoiceCallFunding(
  userId: string,
  providerCallId: string,
): Promise<VoiceCallFunding | null> {
  return getVoiceCallFundingInTransaction(drizzle, { userId, providerCallId });
}

export async function getVoiceCallFundingInTransaction(
  reader: FundingReader,
  { userId, providerCallId }: { userId: string; providerCallId: string },
): Promise<VoiceCallFunding | null> {
  const row = await receipt(reader, userId, admissionKey(providerCallId));
  return row
    ? {
        ...savedFunding(row),
        released: Boolean(
          await receipt(reader, userId, `voice_admission_release:${providerCallId}`),
        ),
      }
    : null;
}

/**
 * Called inside the fresh provider claim transaction, before acceptance. Holds
 * use the same wallet lock as every debit/top-up. One unresolved channel call
 * may own included minutes and completion grace; no expiry silently releases
 * an ambiguous accepted call. Existing legacy/owner plans retain their path.
 */
export async function reserveVoiceCallFunding(
  tx: FundingTransaction,
  opts: {
    userId: string;
    providerCallId: string;
    maxSeconds: number;
  },
): Promise<VoiceCallFunding | null> {
  if (
    !opts.userId ||
    !opts.providerCallId ||
    opts.providerCallId === "unknown" ||
    !Number.isSafeInteger(opts.maxSeconds) ||
    opts.maxSeconds <= 0
  ) {
    throw AppError.badRequest("A valid call and duration are required for funding.");
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.userId}))`);
  const existing = await receipt(tx, opts.userId, admissionKey(opts.providerCallId));
  if (existing) {
    if (
      (await receipt(tx, opts.userId, `voice_completion:${opts.providerCallId}`)) ||
      (await receipt(tx, opts.userId, `voice_admission_release:${opts.providerCallId}`))
    ) {
      throw new AppError(
        409,
        "VOICE_FUNDING_SETTLED",
        "This call's funding has already been settled.",
      );
    }
    return savedFunding(existing);
  }

  const [billing] = await tx
    .select({
      email: schema.users.email,
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
    })
    .from(schema.users)
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.users.id))
    .where(eq(schema.users.id, opts.userId))
    .limit(1);
  if (billing && isOwnerEmail(billing.email)) return null;
  const plan = planById(billing?.plan);
  if (
    !plan ||
    !plan.channels.includes("voice") ||
    !["active", "trialing"].includes(billing?.status ?? "")
  ) {
    throw new AppError(402, "VOICE_PLAN_REQUIRED", "An active Calls plan is required.");
  }
  if (plan.catalogFamily !== "channels") return null;

  // Also covers outbound claims and an earlier call awaiting metering. Unlike
  // presence, a financial hold must never age out before definitive settlement.
  const [pending] = await tx
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, opts.userId),
        eq(schema.creditLedger.refType, "voice_admission"),
        sql`NOT EXISTS (
        SELECT 1 FROM wireline_credit_ledger AS settled
        WHERE settled.user_id = ${schema.creditLedger.userId}
          AND settled.ref_id = ${schema.creditLedger.refId}
          AND settled.ref_type IN ('voice_completion', 'voice_admission_release')
      )`,
      ),
    )
    .limit(1);
  if (pending) {
    throw new AppError(
      429,
      "VOICE_FUNDING_IN_USE",
      "Another call is active or awaiting settlement. Please try again shortly.",
    );
  }

  const balance = await balanceUsd(tx, opts.userId);
  const { key: periodKey } = await resolveAllowanceWindow(tx, opts.userId);
  const [usage] = await tx
    .select({ used: schema.quotaUsage.used })
    .from(schema.quotaUsage)
    .where(
      and(
        eq(schema.quotaUsage.userId, opts.userId),
        eq(schema.quotaUsage.dimension, "voice_minutes_monthly"),
        eq(schema.quotaUsage.periodKey, periodKey),
      ),
    )
    .limit(1);
  const used = Number(usage?.used ?? 0);
  const rate = plan.overage_per_min_usd;
  if (!Number.isSafeInteger(used) || used < 0 || !(rate > 0)) {
    throw AppError.serviceUnavailable("Call funding could not be verified.");
  }
  const includedRemaining = Math.max(0, plan.voice_minutes_monthly - used);
  const prepaidMinutes = Math.floor(Math.round(balance * 100) / Math.round(rate * 100));
  const fundedMinutes = includedRemaining + Math.max(0, prepaidMinutes);
  if (balance < 0 || fundedMinutes < 1) {
    throw new AppError(
      402,
      "VOICE_FUNDING_REQUIRED",
      "Add Runtime Balance before starting another call.",
      {
        recovery_path: "/settings/billing",
      },
    );
  }
  const maxSeconds = Math.min(
    opts.maxSeconds,
    (fundedMinutes + VOICE_COMPLETION_GRACE_MINUTES) * 60,
  );
  const admittedMinutes = Math.ceil(maxSeconds / 60);
  const heldMinutes = Math.max(0, Math.min(admittedMinutes, fundedMinutes) - includedRemaining);
  const prepaidHoldUsd = cents(heldMinutes * rate);
  const graceMinutes = Math.max(0, admittedMinutes - fundedMinutes);
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + maxSeconds * 1000;
  await tx.insert(schema.creditLedger).values({
    userId: opts.userId,
    deltaUsd: String(-prepaidHoldUsd),
    balanceAfterUsd: String(cents(balance - prepaidHoldUsd)),
    entryKind: prepaidHoldUsd > 0 ? "burn" : "adjustment",
    reason: "voice_admission",
    customerReason: "Live-call funding hold",
    refType: "voice_admission",
    refId: opts.providerCallId,
    idempotencyKey: admissionKey(opts.providerCallId),
    source: "voice",
    providerObjectId: opts.providerCallId,
    metadata: {
      funding_version: 1,
      plan_id: plan.id,
      period_key: periodKey,
      max_seconds: maxSeconds,
      prepaid_hold_usd: prepaidHoldUsd,
      grace_minutes: graceMinutes,
      included_minutes: Math.min(includedRemaining, admittedMinutes),
      rate_usd: rate,
      started_at_ms: startedAtMs,
      deadline_at_ms: deadlineAtMs,
    },
  });
  return {
    maxSeconds,
    prepaidHoldUsd,
    graceMinutes,
    startedAtMs,
    deadlineAtMs,
    includedMinutes: Math.min(includedRemaining, admittedMinutes),
    rateUsd: rate,
    planId: plan.id,
    periodKey,
  };
}

/** Refund only after definitive preaccept failure or confirmed non-delivery. */
export async function releaseVoiceCallFunding(
  userId: string,
  providerCallId: string,
  disposition: VoiceFundingReleaseDisposition = "definite_preaccept",
): Promise<void> {
  await drizzle.transaction((tx) =>
    releaseVoiceCallFundingInTransaction(tx, { userId, providerCallId, disposition }),
  );
}

export async function releaseVoiceCallFundingInTransaction(
  tx: FundingTransaction,
  {
    userId,
    providerCallId,
    disposition = "definite_preaccept",
  }: {
    userId: string;
    providerCallId: string;
    disposition?: VoiceFundingReleaseDisposition;
  },
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
  const admission = await receipt(tx, userId, admissionKey(providerCallId));
  if (
    !admission ||
    (await receipt(tx, userId, `voice_completion:${providerCallId}`)) ||
    (await receipt(tx, userId, `voice_admission_release:${providerCallId}`))
  )
    return;
  // Completion claimed its usage under the same wallet lock. Its durable
  // finalizer now owns the hold; a concurrent failure callback cannot refund it.
  const [usage] = await tx
    .select({ providerCallId: schema.voiceUsageEvents.providerCallId })
    .from(schema.voiceUsageEvents)
    .where(
      and(
        eq(schema.voiceUsageEvents.userId, userId),
        eq(schema.voiceUsageEvents.providerCallId, providerCallId),
      ),
    )
    .limit(1);
  if (usage) return;
  const { prepaidHoldUsd } = savedFunding(admission);
  const balance = await balanceUsd(tx, userId);
  await tx.insert(schema.creditLedger).values({
    userId,
    deltaUsd: String(prepaidHoldUsd),
    balanceAfterUsd: String(cents(balance + prepaidHoldUsd)),
    entryKind: "refund",
    reason: "voice_admission_release",
    customerReason: "Unused live-call funding returned",
    refType: "voice_admission_release",
    refId: providerCallId,
    idempotencyKey: `voice_admission_release:${providerCallId}`,
    source: "voice",
    providerObjectId: providerCallId,
    metadata: { funding_version: 1, released_usd: prepaidHoldUsd, disposition },
  });
}

/** Net settlement is one wallet movement: no refund/debit failure gap. */
export async function settleVoiceCallFunding(opts: {
  userId: string;
  providerCallId: string;
  costUsd: number;
  billableMinutes: number;
  rateUsd: number;
}): Promise<{ applied: number; balance: number } | null> {
  if (!Number.isFinite(opts.costUsd) || opts.costUsd < 0)
    throw new Error("Invalid completed voice cost");
  return drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.userId}))`);
    const admission = await receipt(tx, opts.userId, admissionKey(opts.providerCallId));
    if (!admission) return null;
    const balance = await balanceUsd(tx, opts.userId);
    if (await receipt(tx, opts.userId, `voice_completion:${opts.providerCallId}`)) {
      return { applied: 0, balance };
    }
    const funding = savedFunding(admission);
    const released = await receipt(
      tx,
      opts.userId,
      `voice_admission_release:${opts.providerCallId}`,
    );
    const hold = released ? 0 : funding.prepaidHoldUsd;
    const maximumCharge = cents(funding.prepaidHoldUsd + funding.graceMinutes * funding.rateUsd);
    // Returned funds may already have funded another action. A later provider
    // contradiction cannot reopen a definitively released customer obligation.
    const cost = released ? 0 : cents(Math.min(opts.costUsd, maximumCharge));
    const delta = cents(hold - cost);
    const balanceAfter = cents(balance + delta);
    await tx.insert(schema.creditLedger).values({
      userId: opts.userId,
      deltaUsd: String(delta),
      balanceAfterUsd: String(balanceAfter),
      entryKind: released ? "adjustment" : delta > 0 ? "refund" : "burn",
      reason: "voice_completion_grace",
      customerReason: released
        ? "Call funding already returned"
        : delta > 0
          ? "Unused live-call funding returned"
          : "Completed live-call usage",
      refType: "voice_completion",
      refId: opts.providerCallId,
      idempotencyKey: `voice_completion:${opts.providerCallId}`,
      source: "voice",
      providerObjectId: opts.providerCallId,
      metadata: {
        funding_version: 1,
        policy: "bounded_completion_grace",
        prepaid_hold_usd: hold,
        charged_usd: cost,
        billable_minutes: opts.billableMinutes,
        rate_usd: funding.rateUsd,
        ...(released
          ? {
              excluded_after_confirmed_release: true,
              reported_cost_usd: opts.costUsd,
              reconciliation_required: opts.costUsd > 0,
            }
          : {}),
      },
    });
    return { applied: Math.max(0, -delta), balance: balanceAfter };
  });
}
