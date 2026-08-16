/**
 * Per-agent phone lines — resolve Vapi caller ID and SMS "from" for a tenant agent.
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { and, eq } from "drizzle-orm";

/** Twilio incoming-phone-number SIDs start with PN; Vapi ids are UUIDs. */
export function isTwilioPhoneNumberSid(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("PN");
}

export function isVapiPhoneNumberId(id: string | null | undefined): boolean {
  if (!id || isTwilioPhoneNumberSid(id)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export type AgentPhoneLine = {
  id: bigint;
  phoneNumber: string;
  vapiNumberId: string | null;
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
      vapiNumberId: schema.phoneNumbers.vapiNumberId,
      agentId: schema.phoneNumbers.agentId,
    })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.agentId, agentId)))
    .limit(1);
  return row ?? null;
}

/**
 * Outbound Vapi calls require a Vapi phoneNumberId (UUID), not a raw Twilio SID.
 */
export async function resolveAgentVapiPhoneNumberId(
  userId: string,
  agentId: string,
): Promise<string | null> {
  const line = await findAgentPhoneLine(userId, agentId);
  if (line?.vapiNumberId && isVapiPhoneNumberId(line.vapiNumberId)) {
    return line.vapiNumberId;
  }

  const [settings] = await drizzle
    .select({ vapiPhoneNumberId: schema.settings.vapiPhoneNumberId })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  const fallback = settings?.vapiPhoneNumberId?.trim();
  if (fallback && isVapiPhoneNumberId(fallback)) return fallback;
  return null;
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
  opts: { vapiPhoneNumberId?: string; phoneNumberE164?: string; smsCapable?: boolean },
): Promise<void> {
  const [settings] = await drizzle
    .select({
      vapiPhoneNumberId: schema.settings.vapiPhoneNumberId,
      twilioSmsFromNumber: schema.settings.twilioSmsFromNumber,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  if (!settings) return;

  const patch: Partial<typeof schema.settings.$inferInsert> = {};
  if (
    opts.vapiPhoneNumberId &&
    isVapiPhoneNumberId(opts.vapiPhoneNumberId) &&
    !settings.vapiPhoneNumberId?.trim()
  ) {
    patch.vapiPhoneNumberId = opts.vapiPhoneNumberId;
  }
  // SMS "from" must be a Twilio-owned sender. Vapi-only voice lines can place
  // calls after import, but Twilio will reject (or silently fail) STOP/HELP
  // identity on a number it does not own.
  if (opts.smsCapable && opts.phoneNumberE164 && !settings.twilioSmsFromNumber?.trim()) {
    patch.twilioSmsFromNumber = opts.phoneNumberE164;
  }

  if (Object.keys(patch).length === 0) return;

  await drizzle.update(schema.settings).set(patch).where(eq(schema.settings.userId, userId));
}
