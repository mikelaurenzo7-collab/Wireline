import { sql } from "drizzle-orm";

import { drizzle } from "./server-context";

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
 */
export async function recordPendingOrphanCarrierResource(
  input: PendingOrphanCarrierResource,
): Promise<void> {
  const error = input.error.slice(0, 2000);
  await drizzle.execute(sql`
    INSERT INTO public.wireline_orphan_carrier_resources
      (former_user_id, phone_number, vapi_number_id, last_error, status)
    VALUES (
      ${input.userId}::uuid,
      ${input.phoneNumber},
      ${input.carrierId ?? null},
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
