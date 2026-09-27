import { sql } from "drizzle-orm";
import { auditLog } from "../db/schema";

export type ProviderSpendMeter = "managed_ai" | "live_voice";

/** Only the server's PSTN SIP receipt belongs to the separately funded voice meter. */
export function providerSpendMeter(receipt: {
  action: unknown;
  provider: unknown;
  metadata?: unknown;
}): ProviderSpendMeter {
  const metadata = receipt.metadata;
  return receipt.action === "voice.realtime.session" &&
    receipt.provider === "openai" &&
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).surface === "openai_sip"
    ? "live_voice"
    : "managed_ai";
}

/** Matches legacy receipts too; missing/unknown metadata stays on the guarded AI meter. */
export function managedAiSpendPredicate() {
  return sql`not coalesce(
    ${auditLog.action} = 'voice.realtime.session'
    and ${auditLog.provider} = 'openai'
    and ${auditLog.metadata}->>'surface' = 'openai_sip', false)`;
}
