import { sql } from "drizzle-orm";

import { drizzle } from "./server-context";

export const NATIVE_TWILIO_E164_ORPHAN_MARKER = "twilio:e164";

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
  await drizzle.execute(sql`
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
  `);
}
