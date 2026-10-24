import { sql } from "drizzle-orm";
import { auditLog } from "../db/schema";

export type ProviderSpendMeter = "managed_ai" | "live_voice" | "usage_metered";

/** Cloud computer work billed to the customer through usage meters (USAGE_BILLING_ENABLED). */
const USAGE_METERED_ACTIONS = new Set(["computer.browse", "computer.browser"]);

function isUsageMeteredReceipt(receipt: { action: unknown; metadata?: unknown }): boolean {
  const metadata = receipt.metadata;
  return (
    typeof receipt.action === "string" &&
    USAGE_METERED_ACTIONS.has(receipt.action) &&
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).usage_metered === true
  );
}

/** Only the server's PSTN SIP receipt belongs to the separately funded voice meter. */
export function providerSpendMeter(receipt: {
  action: unknown;
  provider: unknown;
  metadata?: unknown;
}): ProviderSpendMeter {
  if (isUsageMeteredReceipt(receipt)) return "usage_metered";
  const metadata = receipt.metadata;
  return (receipt.action === "voice.realtime.session" &&
    receipt.provider === "openai" &&
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).surface === "openai_sip") ||
    (receipt.action === "voice.phone_test.carrier" &&
      receipt.provider === "twilio" &&
      metadata !== null &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).surface === "phone_test") ||
    (receipt.action === "voice.outbound.carrier" &&
      receipt.provider === "twilio" &&
      metadata !== null &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).surface === "native_outbound")
    ? "live_voice"
    : "managed_ai";
}

/** Matches legacy receipts too; missing/unknown metadata stays on the guarded AI meter. */
export function managedAiSpendPredicate() {
  return sql`not coalesce(
    ${auditLog.action} in ('computer.browse', 'computer.browser')
    and ${auditLog.metadata}->>'usage_metered' = 'true'
    or ${auditLog.action} = 'voice.realtime.session'
    and ${auditLog.provider} = 'openai'
    and ${auditLog.metadata}->>'surface' = 'openai_sip'
    or ${auditLog.action} = 'voice.phone_test.carrier'
    and ${auditLog.provider} = 'twilio'
    and ${auditLog.metadata}->>'surface' = 'phone_test'
    or ${auditLog.action} = 'voice.outbound.carrier'
    and ${auditLog.provider} = 'twilio'
    and ${auditLog.metadata}->>'surface' = 'native_outbound', false)`;
}
