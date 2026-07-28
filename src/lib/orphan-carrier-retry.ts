import { sql } from "drizzle-orm";

import { isTwilioPhoneNumberSid, isVapiPhoneNumberId } from "./agent-phone-lines";
import { releaseCarrierAllocations } from "./carrier-release";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import { listVapiNumbers, releaseVapiNumber } from "./vapi-phone-numbers";

type OrphanCarrierRow = {
  id: string;
  former_user_id: string;
  phone_number: string;
  vapi_number_id: string | null;
};

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
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (rows[0]?.sid) await client.incomingPhoneNumbers(rows[0].sid).remove();
}

export interface OrphanCarrierRetrySummary {
  attempted: number;
  resolved: number;
  failed: number;
}

/**
 * Retry provider teardown after the tenant row has been purged. Provider DELETEs
 * are idempotent, so multiple workers or a later daily sweep can safely revisit
 * the same pending ledger row until every represented allocation is gone.
 */
export async function retryPendingOrphanCarrierResources(
  limit = 25,
): Promise<OrphanCarrierRetrySummary> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await drizzle.execute(sql`
    SELECT id, former_user_id, phone_number, vapi_number_id
    FROM public.wireline_orphan_carrier_resources
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `);
  const rows = rowsFromResult(result);
  const summary: OrphanCarrierRetrySummary = { attempted: rows.length, resolved: 0, failed: 0 };

  for (const row of rows) {
    const client = getTwilioClient();
    let carrierId = row.vapi_number_id;
    const errors: string[] = [];

    // A Vapi import can time out after provider acceptance and before the caller
    // receives the new UUID. Rediscover that partial resource by E.164 so the
    // janitor removes both the Vapi object and underlying Twilio rental.
    if (!carrierId) {
      try {
        const numbers = await listVapiNumbers();
        carrierId = numbers.find((number) => number.number === row.phone_number)?.id ?? null;
      } catch (error) {
        errors.push(`Vapi E.164 discovery: ${getErrorMessage(error)}`);
      }
    }

    const release = await releaseCarrierAllocations(
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
      await drizzle.execute(sql`
        UPDATE public.wireline_orphan_carrier_resources
        SET status = 'resolved', resolved_at = now(), last_error = NULL,
            vapi_number_id = COALESCE(vapi_number_id, ${carrierId})
        WHERE id = ${row.id}::uuid AND status = 'pending'
      `);
      summary.resolved += 1;
      continue;
    }

    const error = errors.join(" | ").slice(0, 2000);
    await drizzle.execute(sql`
      UPDATE public.wireline_orphan_carrier_resources
      SET last_error = ${error},
          vapi_number_id = COALESCE(vapi_number_id, ${carrierId})
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
