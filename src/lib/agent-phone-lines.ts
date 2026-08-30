/**
 * Per-agent Twilio lines used for PSTN transport and SMS sender resolution.
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";

/** Twilio incoming-phone-number SIDs start with PN. */
export function isTwilioPhoneNumberSid(id: string | null | undefined): id is string {
  return typeof id === "string" && id.startsWith("PN");
}

export type AgentPhoneLine = {
  id: bigint;
  phoneNumber: string;
  carrierNumberId: string | null;
  agentId: string | null;
};

export async function findAgentPhoneLine(
  userId: string,
  agentId: string,
): Promise<AgentPhoneLine | null> {
  const [row] = await drizzle
    .select({
      id: schema.phoneNumbers.id,
      phoneNumber: schema.phoneNumbers.phoneNumber,
      carrierNumberId: schema.phoneNumbers.vapiNumberId,
      agentId: schema.phoneNumbers.agentId,
    })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.agentId, agentId)))
    .limit(1);
  return row ?? null;
}

export async function resolveAgentSmsFromNumber(
  userId: string,
  agentId?: string | null,
): Promise<string | null> {
  if (agentId) {
    const line = await findAgentPhoneLine(userId, agentId);
    if (line?.phoneNumber) return line.phoneNumber;
  }

  const [settings] = await drizzle
    .select({ twilioSmsFromNumber: schema.settings.twilioSmsFromNumber })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  return settings?.twilioSmsFromNumber?.trim() || null;
}

/** Set tenant-wide telecom defaults when the first line is provisioned. */
export async function ensureTenantTelecomDefaults(
  userId: string,
  opts: { phoneNumberE164?: string; smsCapable?: boolean },
): Promise<void> {
  const [settings] = await drizzle
    .select({
      twilioSmsFromNumber: schema.settings.twilioSmsFromNumber,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  if (!settings) return;

  const patch: Partial<typeof schema.settings.$inferInsert> = {};
  // SMS "from" must be a Twilio-owned sender so STOP/HELP identity and carrier
  // compliance stay attached to the number that actually sends the message.
  if (opts.smsCapable && opts.phoneNumberE164 && !settings.twilioSmsFromNumber?.trim()) {
    patch.twilioSmsFromNumber = opts.phoneNumberE164;
  }

  if (Object.keys(patch).length === 0) return;

  await drizzle.update(schema.settings).set(patch).where(eq(schema.settings.userId, userId));
}
