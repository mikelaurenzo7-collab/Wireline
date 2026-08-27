import { sql } from "drizzle-orm";

import { isTwilioPhoneNumberSid, isVapiPhoneNumberId } from "./agent-phone-lines";
import { releaseCarrierAllocations } from "./carrier-release";
import {
  NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX,
  NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX,
  NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS,
  nativeTwilioPurchaseClaimMarker,
  parseNativeTwilioPurchaseClaimState,
} from "./orphan-carrier-ledger";
import { drizzle, log, tenantStore } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import { listVapiNumbers, releaseVapiNumber } from "./vapi-phone-numbers";

type OrphanCarrierRow = {
  id: string;
  former_user_id: string;
  phone_number: string;
  vapi_number_id: string | null;
  last_error: string | null;
  created_at: Date | string;
};

// Native provisioning's durable provider lease is 20 minutes. The daily
// platform janitor waits longer than that crash horizon; terminal deletion has
// its own lock/lease drain and therefore reconciles immediately.
export const NATIVE_TWILIO_PURCHASE_CLAIM_JANITOR_DELAY_MS =
  NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS + 10 * 60_000;

export function nativeTwilioPurchaseClaimIsStaleForJanitor(
  createdAt: Date | string,
  nowMs = Date.now(),
): boolean {
  const createdAtMs = new Date(createdAt).getTime();
  return (
    Number.isFinite(createdAtMs) &&
    createdAtMs <= nowMs - NATIVE_TWILIO_PURCHASE_CLAIM_JANITOR_DELAY_MS
  );
}

function rowsFromResult(result: unknown): OrphanCarrierRow[] {
  if (Array.isArray(result)) return result as OrphanCarrierRow[];
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as OrphanCarrierRow[];
  }
  return [];
}

async function releaseTwilioNumberByE164(
  phoneNumber: string,
  client: NonNullable<ReturnType<typeof getTwilioClient>>,
): Promise<void> {
  const sid = await discoverTwilioNumberIdByE164(phoneNumber);
  if (sid) await client.incomingPhoneNumbers(sid).remove();
}

function twilioResourceIsGone(error: unknown): boolean {
  const carrierError = error as { status?: unknown; statusCode?: unknown } | null;
  return Number(carrierError?.status ?? carrierError?.statusCode) === 404;
}

async function discoverTwilioPurchaseClaimSid(
  phoneNumber: string,
  friendlyName: string,
  client: NonNullable<ReturnType<typeof getTwilioClient>>,
): Promise<string | null> {
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 10 });
  const matching = rows.filter(
    (row) =>
      String(row.phoneNumber || "") === phoneNumber &&
      String(row.friendlyName || "") === friendlyName,
  );
  if (matching.length > 1) {
    throw new Error("Multiple Twilio phone numbers match one native purchase claim.");
  }
  const sid = String(matching[0]?.sid || "").trim();
  return isTwilioPhoneNumberSid(sid) ? sid : null;
}

async function deletePendingOrphanCarrierRow(id: string): Promise<void> {
  await drizzle.execute(sql`
    DELETE FROM public.wireline_orphan_carrier_resources
    WHERE id = ${id}::uuid AND status = 'pending'
  `);
}

export async function discoverTwilioNumberIdByE164(phoneNumber: string): Promise<string | null> {
  const client = getTwilioClient();
  if (!client) return null;
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  const sid = String(rows[0]?.sid || "").trim();
  return isTwilioPhoneNumberSid(sid) ? sid : null;
}

async function hasCurrentCanonicalOwner(phoneNumber: string): Promise<boolean> {
  const result = await drizzle.execute(sql`
    SELECT user_id
    FROM public.wireline_phone_numbers
    WHERE phone_number = ${phoneNumber}
    LIMIT 1
  `);
  return rowsFromResult(result).length > 0;
}

async function hasActiveProviderOperationLease(userId: string): Promise<boolean> {
  const result = await drizzle.execute(sql`
    SELECT 1
    FROM public.wireline_account_operation_leases
    WHERE user_id = ${userId}::uuid
      AND kind = 'provider'
      AND expires_at > now()
    LIMIT 1
  `);
  return rowsFromResult(result).length > 0;
}

export interface OrphanCarrierRetrySummary {
  attempted: number;
  resolved: number;
  failed: number;
}

export interface NativeTwilioPurchaseClaimReconciliationSummary {
  attempted: number;
  released: number;
  confirmedAbsent: number;
  canonicalOwnership: number;
}

/**
 * Terminal deletion's authoritative fence for purchases whose provider lease
 * has expired. An expired timer is never evidence that Twilio rejected the
 * mutation: list the exact E.164 + non-PII friendly name, release a match, and
 * only then retire the durable pre-provider claim. Any provider/ledger failure
 * throws so local tenant erasure cannot destroy the last cleanup correlation.
 */
export async function reconcileNativeTwilioPurchaseClaimsForTerminalDeletion(
  userId: string,
): Promise<NativeTwilioPurchaseClaimReconciliationSummary> {
  return tenantStore.exit(() => reconcileNativeTwilioPurchaseClaimsOutsideTenantContext(userId));
}

async function reconcileNativeTwilioPurchaseClaimsOutsideTenantContext(
  userId: string,
): Promise<NativeTwilioPurchaseClaimReconciliationSummary> {
  const result = await drizzle.execute(sql`
    SELECT id, former_user_id, phone_number, vapi_number_id, last_error, created_at
    FROM public.wireline_orphan_carrier_resources
    WHERE former_user_id = ${userId}::uuid
      AND status = 'pending'
      AND last_error LIKE ${`${NATIVE_TWILIO_PURCHASE_CLAIM_STATE_PREFIX}%`}
    ORDER BY created_at ASC
  `);
  const rows = rowsFromResult(result);
  const summary: NativeTwilioPurchaseClaimReconciliationSummary = {
    attempted: rows.length,
    released: 0,
    confirmedAbsent: 0,
    canonicalOwnership: 0,
  };
  if (rows.length === 0) return summary;

  const client = getTwilioClient();
  if (!client) {
    throw new Error(
      "Twilio purchase-claim reconciliation is unavailable; deferring account purge.",
    );
  }

  for (const row of rows) {
    const claim = parseNativeTwilioPurchaseClaimState(row.last_error);
    if (!claim || row.vapi_number_id !== nativeTwilioPurchaseClaimMarker(claim.operationId)) {
      throw new Error(
        `Native Twilio purchase claim ${row.id} is malformed; deferring account purge.`,
      );
    }

    // A canonical row (for this deleting tenant or a later assignee) is the
    // stronger ownership record. Leave carrier release to that row's normal
    // lifecycle and retire only the stale pre-provider claim.
    if (await hasCurrentCanonicalOwner(row.phone_number)) {
      await deletePendingOrphanCarrierRow(row.id);
      summary.canonicalOwnership += 1;
      continue;
    }

    const sid = await discoverTwilioPurchaseClaimSid(row.phone_number, claim.friendlyName, client);
    if (!sid) {
      await deletePendingOrphanCarrierRow(row.id);
      summary.confirmedAbsent += 1;
      continue;
    }

    try {
      await client.incomingPhoneNumbers(sid).remove();
    } catch (error) {
      if (!twilioResourceIsGone(error)) throw error;
    }
    await deletePendingOrphanCarrierRow(row.id);
    summary.released += 1;
  }
  return summary;
}

/**
 * Retry provider teardown after the tenant row has been purged. Provider DELETEs
 * are idempotent, so multiple workers or a later daily sweep can safely revisit
 * the same pending ledger row until every represented allocation is gone.
 */
export async function retryPendingOrphanCarrierResources(
  limit = 25,
): Promise<OrphanCarrierRetrySummary> {
  return tenantStore.exit(() => retryPendingOrphanCarrierResourcesOutsideTenantContext(limit));
}

async function retryPendingOrphanCarrierResourcesOutsideTenantContext(
  limit = 25,
): Promise<OrphanCarrierRetrySummary> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await drizzle.execute(sql`
    SELECT orphan.id,
           orphan.former_user_id,
           orphan.phone_number,
           orphan.vapi_number_id,
           orphan.last_error,
           orphan.created_at
    FROM public.wireline_orphan_carrier_resources AS orphan
    WHERE orphan.status = 'pending'
      AND (
        orphan.vapi_number_id NOT LIKE ${`${NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX}%`}
        OR (
          orphan.created_at <= now() - (${Math.floor(
            NATIVE_TWILIO_PURCHASE_CLAIM_JANITOR_DELAY_MS / 1000,
          )} * interval '1 second')
          AND NOT EXISTS (
            SELECT 1
            FROM public.wireline_account_operation_leases AS lease
            WHERE lease.user_id = orphan.former_user_id
              AND lease.kind = 'provider'
              AND lease.expires_at > now()
          )
        )
      )
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `);
  // Keep the age boundary in code as well as SQL. It prevents an accidental
  // query regression (and makes the provider-before-janitor race executable in
  // tests) from retiring a claim while its purchase call is still in flight.
  const rows: OrphanCarrierRow[] = [];
  for (const row of rowsFromResult(result)) {
    if (!row.vapi_number_id?.startsWith(NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX)) {
      rows.push(row);
      continue;
    }
    if (!nativeTwilioPurchaseClaimIsStaleForJanitor(row.created_at)) continue;
    // Defensive mirror of the SQL anti-join. If a query refactor accidentally
    // returns a stale but still-leased claim, code still refuses to race the
    // provider operation that owns it.
    if (await hasActiveProviderOperationLease(row.former_user_id)) continue;
    rows.push(row);
  }
  const summary: OrphanCarrierRetrySummary = { attempted: rows.length, resolved: 0, failed: 0 };

  for (const raw of rows) {
    const row = { ...raw, vapiNumberId: raw.vapi_number_id };
    // A number can be reassigned after the former tenant is purged. Never
    // rediscover or release a carrier object that now backs a canonical row.
    if (await hasCurrentCanonicalOwner(row.phone_number)) {
      await drizzle.execute(sql`
        DELETE FROM public.wireline_orphan_carrier_resources
        WHERE id = ${row.id}::uuid AND status = 'pending'
      `);
      summary.resolved += 1;
      log.warn("Orphan carrier retry skipped a reassigned number", {
        orphanId: row.id,
        formerUserId: row.former_user_id,
        phoneNumber: row.phone_number,
      });
      continue;
    }

    const client = getTwilioClient();
    let carrierId = row.vapiNumberId;
    const errors: string[] = [];
    const purchaseClaim = parseNativeTwilioPurchaseClaimState(row.last_error);
    const purchaseClaimMarker = row.vapiNumberId?.startsWith(
      NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX,
    );
    let purchaseClaimConfirmedAbsent = false;

    if (purchaseClaimMarker) {
      if (
        !purchaseClaim ||
        row.vapiNumberId !== nativeTwilioPurchaseClaimMarker(purchaseClaim.operationId)
      ) {
        errors.push("Native Twilio purchase claim metadata is malformed.");
      } else if (!client) {
        errors.push("Twilio client is unavailable.");
      } else {
        try {
          const discovered = await discoverTwilioPurchaseClaimSid(
            row.phone_number,
            purchaseClaim.friendlyName,
            client,
          );
          if (discovered) carrierId = discovered;
          else purchaseClaimConfirmedAbsent = true;
        } catch (error) {
          errors.push(`Twilio purchase-claim discovery: ${getErrorMessage(error)}`);
        }
      }
    } else if (row.vapiNumberId === "twilio:e164") {
      try {
        const discovered = await discoverTwilioNumberIdByE164(row.phone_number);
        if (discovered) carrierId = discovered;
      } catch (error) {
        errors.push(`Twilio E.164 discovery: ${getErrorMessage(error)}`);
      }
    } else if (!carrierId) {
      // A Vapi import can time out after provider acceptance and before the caller
      // receives the new UUID. Rediscover that partial resource by E.164 so the
      // janitor removes both the Vapi object and underlying Twilio rental.
      try {
        const numbers = await listVapiNumbers();
        carrierId = numbers.find((number) => number.number === row.phone_number)?.id ?? null;
      } catch (error) {
        errors.push(`Vapi E.164 discovery: ${getErrorMessage(error)}`);
      }
    }

    if (purchaseClaimConfirmedAbsent && errors.length === 0) {
      await deletePendingOrphanCarrierRow(row.id);
      summary.resolved += 1;
      continue;
    }

    const release =
      errors.length > 0
        ? { ok: false as const, error: null }
        : await releaseCarrierAllocations(
            {
              kind:
                carrierId && isVapiPhoneNumberId(carrierId)
                  ? "vapi"
                  : carrierId && isTwilioPhoneNumberSid(carrierId)
                    ? "twilio_sid"
                    : "e164",
              phoneNumber: row.phone_number,
              carrierId,
            },
            {
              twilioAvailable: Boolean(client),
              inspectVapiProvider: async (vapiNumberId) => {
                const numbers = await listVapiNumbers();
                return numbers.find((number) => number.id === vapiNumberId)?.provider ?? null;
              },
              releaseVapi: releaseVapiNumber,
              releaseTwilioBySid: async (twilioSid) => {
                if (!client) throw new Error("Twilio client is unavailable.");
                await client.incomingPhoneNumbers(twilioSid).remove();
              },
              releaseTwilioByE164: async (phoneNumber) => {
                if (!client) throw new Error("Twilio client is unavailable.");
                await releaseTwilioNumberByE164(phoneNumber, client);
              },
            },
          );
    if (!release.ok && release.error) errors.push(release.error);

    if (errors.length === 0) {
      await deletePendingOrphanCarrierRow(row.id);
      summary.resolved += 1;
      continue;
    }

    const error = purchaseClaim
      ? row.last_error || "Native Twilio purchase claim reconciliation remains pending."
      : errors.join(" | ").slice(0, 2000);
    // Rotate a failed item to the tail of the FIFO so a permanently failing
    // allocation cannot monopolize the bounded daily batch.
    await drizzle.execute(sql`
      UPDATE public.wireline_orphan_carrier_resources
      SET last_error = ${error},
          vapi_number_id = COALESCE(vapi_number_id, ${carrierId}),
          created_at = now()
      WHERE id = ${row.id}::uuid AND status = 'pending'
    `);
    summary.failed += 1;
    log.warn("Orphan carrier retry remains pending", {
      orphanId: row.id,
      formerUserId: row.former_user_id,
      phoneNumber: row.phone_number,
      carrierId,
      error,
    });
  }

  if (summary.failed > 0) {
    throw new Error(
      `Orphan carrier retry left ${summary.failed} of ${summary.attempted} resource(s) pending.`,
    );
  }

  return summary;
}
