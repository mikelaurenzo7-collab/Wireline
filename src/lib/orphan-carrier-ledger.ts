import { sql } from "drizzle-orm";

import { drizzle } from "./server-context";

export const NATIVE_TWILIO_E164_ORPHAN_MARKER = "twilio:e164";
export const NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX = "twilio:purchase:";
export const NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX = "Native Twilio purchase claim:";
export const NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS = 20 * 60_000;

export type NativeTwilioPurchaseClaimPhase =
  "prepared" | "provider_accepted" | "provider_outcome_ambiguous" | "compensation_pending";

export interface NativeTwilioPurchaseClaim {
  userId: string;
  operationId: string;
  phoneNumber: string;
  friendlyName: string;
}

type NativeTwilioPurchaseClaimState = {
  operationId: string;
  friendlyName: string;
  phase: NativeTwilioPurchaseClaimPhase;
};

function returnedRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

function isOperationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function nativeTwilioPurchaseFriendlyName(operationId: string): string {
  if (!isOperationId(operationId)) throw new Error("Invalid native Twilio purchase operation id.");
  // The provider label is a random operation correlation only. Do not put the
  // tenant id, email, business name, or selected phone number in Twilio metadata.
  return `BotBound native ${operationId}`;
}

export function nativeTwilioPurchaseClaimMarker(operationId: string): string {
  if (!isOperationId(operationId)) throw new Error("Invalid native Twilio purchase operation id.");
  return `${NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX}${operationId}`;
}

function serializeNativeTwilioPurchaseClaimState(
  claim: Pick<NativeTwilioPurchaseClaim, "operationId" | "friendlyName">,
  phase: NativeTwilioPurchaseClaimPhase,
): string {
  return `${NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX}${JSON.stringify({
    operationId: claim.operationId,
    friendlyName: claim.friendlyName,
    phase,
  } satisfies NativeTwilioPurchaseClaimState)}`;
}

export function parseNativeTwilioPurchaseClaimState(
  value: string | null | undefined,
): NativeTwilioPurchaseClaimState | null {
  if (!value?.startsWith(NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      value.slice(NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX.length),
    ) as Partial<NativeTwilioPurchaseClaimState>;
    if (
      typeof parsed.operationId !== "string" ||
      !isOperationId(parsed.operationId) ||
      typeof parsed.friendlyName !== "string" ||
      parsed.friendlyName !== nativeTwilioPurchaseFriendlyName(parsed.operationId) ||
      ![
        "prepared",
        "provider_accepted",
        "provider_outcome_ambiguous",
        "compensation_pending",
      ].includes(String(parsed.phase))
    ) {
      return null;
    }
    return parsed as NativeTwilioPurchaseClaimState;
  } catch {
    return null;
  }
}

/**
 * Durably claim an exact E.164 before the Twilio purchase mutation starts.
 *
 * The existing platform-global orphan ledger is intentionally reused: it
 * already survives terminal tenant erasure and is serviced by the carrier
 * reconciler. Its open `(former_user_id, phone_number)` uniqueness also makes
 * an unresolved attempt a hard duplicate-purchase fence.
 */
export async function createPendingNativeTwilioPurchaseClaim(input: {
  userId: string;
  operationId: string;
  phoneNumber: string;
}): Promise<NativeTwilioPurchaseClaim> {
  const claim: NativeTwilioPurchaseClaim = {
    userId: input.userId,
    operationId: input.operationId,
    phoneNumber: input.phoneNumber,
    friendlyName: nativeTwilioPurchaseFriendlyName(input.operationId),
  };
  const result = await drizzle.execute(sql`
    INSERT INTO public.wireline_orphan_carrier_resources
      (former_user_id, phone_number, vapi_number_id, last_error, status)
    VALUES (
      ${input.userId}::uuid,
      ${claim.phoneNumber},
      ${nativeTwilioPurchaseClaimMarker(claim.operationId)},
      ${serializeNativeTwilioPurchaseClaimState(claim, "prepared")},
      'pending'
    )
    ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'
    DO NOTHING
    RETURNING id
  `);
  if (returnedRows(result).length !== 1) {
    throw new Error("A native Twilio purchase claim is already pending for this number.");
  }
  return claim;
}

/** Keep the pre-provider claim live while recording only non-PII lifecycle state. */
export async function retainNativeTwilioPurchaseClaim(
  input: NativeTwilioPurchaseClaim,
  phase: Exclude<NativeTwilioPurchaseClaimPhase, "prepared">,
): Promise<void> {
  const result = await drizzle.execute(sql`
    UPDATE public.wireline_orphan_carrier_resources
    SET last_error = ${serializeNativeTwilioPurchaseClaimState(input, phase)},
        created_at = now()
    WHERE former_user_id = ${input.userId}::uuid
      AND phone_number = ${input.phoneNumber}
      AND vapi_number_id = ${nativeTwilioPurchaseClaimMarker(input.operationId)}
      AND status = 'pending'
    RETURNING id
  `);
  if (returnedRows(result).length !== 1) {
    throw new Error("The durable native Twilio purchase claim could not be retained.");
  }
}

/**
 * Remove a claim only after the carrier allocation is gone or a canonical
 * tenant phone row durably owns it. Zero affected rows is safe: a concurrent
 * reconciler may already have established the same terminal outcome.
 */
export async function clearNativeTwilioPurchaseClaim(input: {
  userId: string;
  operationId: string;
  phoneNumber: string;
}): Promise<void> {
  await drizzle.execute(sql`
    DELETE FROM public.wireline_orphan_carrier_resources
    WHERE former_user_id = ${input.userId}::uuid
      AND phone_number = ${input.phoneNumber}
      AND vapi_number_id = ${nativeTwilioPurchaseClaimMarker(input.operationId)}
      AND status = 'pending'
  `);
}

export interface PendingOrphanCarrierResource {
  userId: string;
  phoneNumber: string;
  carrierId?: string | null;
  error: string;
}

/**
 * Persist provider identifiers before returning from a failed teardown or
 * provisioning rollback. The partial unique index keeps retries idempotent while
 * refreshing the most useful provider id and failure diagnostic.
 *
 * A native Twilio purchase can be accepted before the PN SID reaches Wireline.
 * Stamp that E.164-only case with a non-Vapi marker so the janitor skips legacy
 * Vapi discovery and goes directly to Twilio E.164 reconciliation.
 */
export async function recordPendingOrphanCarrierResource(
  input: PendingOrphanCarrierResource,
): Promise<void> {
  const error = input.error.slice(0, 2000);
  const carrierId =
    input.carrierId ??
    (error.startsWith("Ambiguous native Twilio purchase:")
      ? NATIVE_TWILIO_E164_ORPHAN_MARKER
      : null);
  const result = await drizzle.execute(sql`
    INSERT INTO public.wireline_orphan_carrier_resources
      (former_user_id, phone_number, vapi_number_id, last_error, status)
    VALUES (
      ${input.userId}::uuid,
      ${input.phoneNumber},
      ${carrierId},
      ${error},
      'pending'
    )
    ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'
    DO UPDATE SET
      vapi_number_id = COALESCE(
        EXCLUDED.vapi_number_id,
        public.wireline_orphan_carrier_resources.vapi_number_id
      ),
      last_error = EXCLUDED.last_error
    WHERE COALESCE(
      public.wireline_orphan_carrier_resources.vapi_number_id,
      ''
    ) NOT LIKE ${`${NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX}%`}
    RETURNING id
  `);
  if (returnedRows(result).length !== 1) {
    // Never overwrite the exact friendly-name correlation of an in-flight
    // native purchase with a less-specific generic teardown record.
    throw new Error("A native Twilio purchase claim already owns this cleanup key.");
  }
}
