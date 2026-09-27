import { sql } from "drizzle-orm";

import { AppError } from "./api-error";
import { acquireCompanyIdentityMutationLock } from "./company-identity-mutation";
import { drizzle } from "./server-context";

export const PHONE_NUMBER_ACQUISITION_WINDOW_DAYS = 31;
const ACQUISITION_ACTION = "phone.number.acquire";
const REJECTED_ACTION = "phone.number.acquire.rejected";
type Executor = Pick<typeof drizzle, "execute">;

function rowsFromResult(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  throw new Error("Phone acquisition ledger returned an invalid result.");
}

/**
 * Caller holds the company identity lock. A slot limits current rentals; this
 * separate receipt limits new upfront carrier charges after a line is released.
 * Receipts are prospective, contain no phone number, and carry zero customer
 * spend/tokens. The retention worker preserves audit events for at least 90 days.
 */
export async function reservePhoneNumberAcquisition(
  tx: Executor,
  input: { userId: string; operationId: string; slots: number },
): Promise<void> {
  const slots = Math.floor(input.slots);
  if (!Number.isFinite(slots) || slots < 1) throw new Error("Invalid phone acquisition limit.");
  const result = await tx.execute(sql`
    SELECT acquisition.idempotency_key AS operation_id,
           acquisition.created_at + (${PHONE_NUMBER_ACQUISITION_WINDOW_DAYS} * interval '1 day') AS eligible_at
    FROM public.wireline_audit_log AS acquisition
    WHERE acquisition.user_id = ${input.userId}::uuid
      AND acquisition.action = ${ACQUISITION_ACTION}
      AND acquisition.created_at > now() - (${PHONE_NUMBER_ACQUISITION_WINDOW_DAYS} * interval '1 day')
      AND NOT EXISTS (
        SELECT 1 FROM public.wireline_audit_log AS rejection
        WHERE rejection.user_id = acquisition.user_id
          AND rejection.action = ${REJECTED_ACTION}
          AND rejection.idempotency_key = acquisition.idempotency_key
      )
    ORDER BY acquisition.created_at ASC, acquisition.id ASC
  `);
  const receipts = rowsFromResult(result);
  if (receipts.length >= slots) {
    // A downgraded workspace may need several older receipts to expire before
    // it has another acquisition available under its current included slots.
    const rawEligibleAt = receipts[receipts.length - slots].eligible_at;
    const eligibleAt = new Date(
      rawEligibleAt instanceof Date ? rawEligibleAt.getTime() : String(rawEligibleAt),
    );
    if (!Number.isFinite(eligibleAt.getTime())) throw new Error("Invalid acquisition expiry.");
    const date = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(eligibleAt);
    throw new AppError(
      409,
      "PHONE_ACQUISITION_LIMIT",
      `Your plan allows ${slots} new phone number${slots === 1 ? "" : "s"} every ${PHONE_NUMBER_ACQUISITION_WINDOW_DAYS} days. Choose again after ${date}, reassign an existing line, or contact support for a replacement.`,
      { eligible_at: eligibleAt.toISOString(), recovery_path: "/phone?tab=setup" },
    );
  }
  const inserted = await tx.execute(sql`
    INSERT INTO public.wireline_audit_log
      (user_id, action, event_type, provider, cost_usd, input_tokens, output_tokens,
       cache_read_tokens, cache_create_tokens, idempotency_key, metadata)
    VALUES (${input.userId}::uuid, ${ACQUISITION_ACTION}, ${ACQUISITION_ACTION}, 'twilio',
            0, 0, 0, 0, 0, ${input.operationId}, '{"purpose":"carrier_acquisition_limit"}'::jsonb)
    ON CONFLICT (user_id, action, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id
  `);
  if (rowsFromResult(inserted).length !== 1) {
    throw new Error("Phone acquisition receipt could not be reserved.");
  }
}

/**
 * Only a definitive carrier rejection may void an attempt. Accepted purchases,
 * compensation, current provider absence and janitor cleanup cannot prove the
 * carrier refunded its upfront fee, so none of them call this helper.
 */
export async function recordRejectedPhoneNumberAcquisition(input: {
  userId: string;
  operationId: string;
}): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await acquireCompanyIdentityMutationLock(tx, input.userId);
    await tx.execute(sql`
      INSERT INTO public.wireline_audit_log
        (user_id, action, event_type, provider, cost_usd, input_tokens, output_tokens,
         cache_read_tokens, cache_create_tokens, idempotency_key, metadata)
      SELECT acquisition.user_id, ${REJECTED_ACTION}, ${REJECTED_ACTION}, 'twilio',
             0, 0, 0, 0, 0, acquisition.idempotency_key,
             '{"reason":"definitive_carrier_rejection"}'::jsonb
      FROM public.wireline_audit_log AS acquisition
      WHERE acquisition.user_id = ${input.userId}::uuid
        AND acquisition.action = ${ACQUISITION_ACTION}
        AND acquisition.idempotency_key = ${input.operationId}
      ON CONFLICT (user_id, action, idempotency_key) WHERE idempotency_key IS NOT NULL
      DO NOTHING
    `);
  });
}
