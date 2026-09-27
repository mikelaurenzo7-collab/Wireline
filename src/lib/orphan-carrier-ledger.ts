import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { acquireCompanyIdentityMutationLock } from "./company-identity-mutation";
import { getIncludedPhoneLineSlots } from "./phone-line-entitlements";
import { reservePhoneNumberAcquisition } from "./phone-number-acquisition";
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
  agentId?: string;
}

type NativeTwilioPurchaseClaimState = {
  operationId: string;
  friendlyName: string;
  phase: NativeTwilioPurchaseClaimPhase;
  agentId?: string;
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
  claim: Pick<NativeTwilioPurchaseClaim, "operationId" | "friendlyName" | "agentId">,
  phase: NativeTwilioPurchaseClaimPhase,
): string {
  return `${NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX}${JSON.stringify({
    operationId: claim.operationId,
    friendlyName: claim.friendlyName,
    phase,
    ...(claim.agentId ? { agentId: claim.agentId } : {}),
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
      (parsed.agentId !== undefined &&
        (typeof parsed.agentId !== "string" || !parsed.agentId.trim())) ||
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

/** Caller holds the company identity lock; canonical recovery remains allowed. */
export async function assertNoPendingNativeTwilioPurchaseForBot(
  tx: Pick<typeof drizzle, "execute">,
  userId: string,
  agentId: string,
): Promise<void> {
  const result = await tx.execute(sql`
    SELECT orphan.vapi_number_id, orphan.last_error
    FROM public.wireline_orphan_carrier_resources AS orphan
    WHERE orphan.former_user_id = ${userId}::uuid AND orphan.status = 'pending'
      AND orphan.vapi_number_id LIKE ${`${NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX}%`}
      AND NOT EXISTS (
        SELECT 1 FROM public.wireline_phone_numbers AS owned
        WHERE owned.user_id = orphan.former_user_id AND owned.phone_number = orphan.phone_number
      )
  `);
  const pending = returnedRows(result) as { last_error: string | null }[];
  if (
    pending.some((row) => {
      const state = parseNativeTwilioPurchaseClaimState(row.last_error);
      return !state?.agentId || state.agentId === agentId;
    })
  ) {
    throw new AppError(
      409,
      "PHONE_PURCHASE_PENDING",
      "A number purchase for this Bot is still being resolved. Refresh your lines before assigning another number.",
    );
  }
}

/**
 * Reserve a paid phone slot and target Bot before the Twilio mutation starts.
 *
 * The existing platform-global orphan ledger is intentionally reused: it
 * already survives terminal tenant erasure and is serviced by the carrier
 * reconciler. Its open `(former_user_id, phone_number)` uniqueness also makes
 * an unresolved attempt a hard duplicate-purchase fence. The identity lock
 * serializes different-number purchases too: releasing a losing allocation
 * cannot refund the carrier's upfront monthly charge. Uncertain claims retain
 * capacity until reconciliation proves ownership or removal, regardless of age.
 */
export async function createPendingNativeTwilioPurchaseClaim(input: {
  userId: string;
  operationId: string;
  phoneNumber: string;
  agentId?: string;
}): Promise<NativeTwilioPurchaseClaim> {
  const claim: NativeTwilioPurchaseClaim = {
    userId: input.userId,
    operationId: input.operationId,
    phoneNumber: input.phoneNumber,
    friendlyName: nativeTwilioPurchaseFriendlyName(input.operationId),
    ...(input.agentId ? { agentId: input.agentId } : {}),
  };
  return drizzle.transaction(async (tx) => {
    await acquireCompanyIdentityMutationLock(tx, input.userId);
    const slots = await getIncludedPhoneLineSlots(input.userId, tx);
    if (slots <= 0) {
      throw new AppError(
        402,
        "PHONE_CAPACITY_REACHED",
        "An active plan with an available phone number is required.",
      );
    }
    if (input.agentId) {
      const [agent] = await tx
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
        .limit(1);
      if (!agent) throw AppError.notFound("Bot not found.");
    }
    const owned = await tx
      .select({
        phoneNumber: schema.phoneNumbers.phoneNumber,
        agentId: schema.phoneNumbers.agentId,
      })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, input.userId));
    if (
      owned.some(
        (line) =>
          line.phoneNumber === claim.phoneNumber ||
          (input.agentId && line.agentId === input.agentId),
      )
    ) {
      throw AppError.conflict(
        "This number or Bot already has a line. Refresh your lines before trying again.",
      );
    }
    const result = await tx.execute(sql`
      SELECT phone_number, vapi_number_id, last_error
      FROM public.wireline_orphan_carrier_resources
      WHERE former_user_id = ${input.userId}::uuid AND status = 'pending'
    `);
    const ownedNumbers = new Set(owned.map((line) => line.phoneNumber));
    const pending = (
      returnedRows(result) as {
        phone_number: string;
        vapi_number_id: string | null;
        last_error: string | null;
      }[]
    ).filter((row) => !ownedNumbers.has(row.phone_number));
    const botPending =
      input.agentId &&
      pending.some((row) => {
        if (!row.vapi_number_id?.startsWith(NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX))
          return false;
        const state = parseNativeTwilioPurchaseClaimState(row.last_error);
        // Older claims lack Bot attribution: do not assume they belong to a
        // different Bot and buy again while their outcome is unresolved.
        return !state?.agentId || state.agentId === input.agentId;
      });
    if (botPending || pending.some((row) => row.phone_number === claim.phoneNumber)) {
      throw new AppError(
        409,
        "PHONE_PURCHASE_PENDING",
        "A phone purchase is still being resolved. Refresh your lines before trying again.",
      );
    }
    if (owned.length + pending.length >= slots) {
      throw new AppError(
        409,
        "PHONE_CAPACITY_REACHED",
        "Your included phone numbers are allocated or awaiting carrier confirmation. Manage your existing numbers in Calls.",
      );
    }
    await reservePhoneNumberAcquisition(tx, {
      userId: input.userId,
      operationId: input.operationId,
      slots,
    });
    const inserted = await tx.execute(sql`
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
    if (returnedRows(inserted).length !== 1) {
      throw new AppError(
        409,
        "PHONE_PURCHASE_PENDING",
        "A phone purchase is still being resolved. Refresh your lines before trying again.",
      );
    }
    return claim;
  });
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
