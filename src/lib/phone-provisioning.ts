/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Auto-provisions a dedicated voice + SMS line per agent for a tenant.
 *
 * Canonical path (when Twilio + Vapi are configured):
 *   1. Buy US local on Wireline's Twilio account (SMS → /api/twilio-webhook/sms).
 *   2. Import into Vapi (voice runtime + outbound caller ID).
 *   3. Persist wireline_phone_numbers { userId, agentId, e164, vapiNumberId }.
 *
 * Fallback (Vapi only): provision a Vapi-managed number (voice; SMS via Vapi when enabled).
 *
 * Customers never see a carrier bill — COGS are in the monthly tier price.
 */

import { drizzle, log, serialQueryBatch } from "./server-context";
import * as schema from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import { STRIPE_PLANS, planById, type StripePlanId } from "./plan-catalog";
import { includedPhoneSlotsForPlan } from "./phone-line-entitlements";
import { runCompanyIdentityMutation } from "./company-identity-mutation";
import { releaseCarrierAllocations, type CarrierReleaseKind } from "./carrier-release";
import { recordPendingOrphanCarrierResource } from "./orphan-carrier-ledger";
import {
  ensureTenantTelecomDefaults,
  findAgentPhoneLine,
  isTwilioPhoneNumberSid,
  isVapiPhoneNumberId,
} from "./agent-phone-lines";
import {
  importTwilioNumberToVapi,
  listVapiNumbers,
  provisionVapiNumber,
  releaseVapiNumber,
  vapiAccountHeadroom,
} from "./vapi-phone-numbers";

function isAutoProvisioningEnabled(): boolean {
  const flag = process.env.WIRELINE_AUTO_PROVISION_NUMBERS?.toLowerCase().trim();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") return true;
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function appBaseUrl(): string {
  return process.env.APP_URL && process.env.APP_URL.length > 0
    ? process.env.APP_URL.replace(/\/+$/, "")
    : "https://trywireline.com";
}

interface ProvisionOpts {
  agentId?: string;
  areaCode?: string;
  campaignLabel?: string;
}

export interface ProvisionResult {
  ok: boolean;
  phoneNumber?: string;
  vapiNumberId?: string;
  reused?: boolean;
  error?: string;
}

interface CarrierCleanupResult {
  released: boolean;
  queued: boolean;
  error?: string;
}

async function resolveTenantPlan(userId: string): Promise<{
  plan: (typeof STRIPE_PLANS)[number];
  status: string | null;
  phoneSlots: number;
}> {
  const [[row], [settings]] = await Promise.all([
    drizzle
      .select({
        plan: schema.subscriptions.plan,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1),
    drizzle
      .select({ extraAgents: schema.settings.extraAgents })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
  ]);

  const planId = (row?.plan as StripePlanId) || "personal";
  const plan = planById(planId) || STRIPE_PLANS[0];
  const phoneSlots = includedPhoneSlotsForPlan(plan.id, settings?.extraAgents);
  return { plan, status: row?.status ?? null, phoneSlots };
}

async function countExistingNumbers(userId: string): Promise<number> {
  const [row] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));
  return row?.count ?? 0;
}

async function findFirstUnassignedNumber(userId: string) {
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), sql`${schema.phoneNumbers.agentId} IS NULL`))
    .limit(1);
  return row ?? null;
}

async function purchaseTwilioLocalNumber(
  userId: string,
  areaCode?: string,
): Promise<{ phoneNumber: string; sid: string } | null> {
  const client = getTwilioClient();
  if (!client) return null;

  // Twilio retries 5xx responses only when the webhook URL explicitly opts
  // into the 5xx retry policy. The bounded connection/read/total timers keep
  // retries useful without tying up the carrier request budget indefinitely.
  // URL fragments are connection-policy metadata and are excluded from Twilio's
  // signature URL, so webhook verification still sees the canonical endpoint.
  const smsUrl = `${appBaseUrl()}/api/twilio-webhook/sms#rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000`;
  // Vapi owns the primary voice webhook after import; Twilio still needs a
  // voiceFallbackUrl so carrier-side Vapi SIP/webhook failures reach our
  // degraded-mode handler instead of a silent hangup.
  const voiceFallbackUrl = `${appBaseUrl()}/api/twilio-webhook/voice-fallback`;
  const searchParams: any = {
    voiceEnabled: true,
    smsEnabled: true,
    limit: 5,
  };
  if (areaCode && /^\d{3}$/.test(areaCode)) {
    searchParams.areaCode = Number(areaCode);
  }

  let candidates = await client.availablePhoneNumbers("US").local.list(searchParams);
  if (candidates.length === 0 && areaCode) {
    delete searchParams.areaCode;
    candidates = await client.availablePhoneNumbers("US").local.list(searchParams);
  }
  if (candidates.length === 0) return null;

  const chosen = candidates[0];
  try {
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: chosen.phoneNumber,
      smsUrl,
      smsMethod: "POST",
      voiceFallbackUrl,
      voiceFallbackMethod: "POST",
      friendlyName: `Wireline · tenant ${userId.slice(0, 8)}`,
    });
    return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
  } catch (err) {
    // Trial caps, billing blocks, etc. — fall through to Vapi pool provisioning.
    log.warn("Twilio number purchase unavailable, trying Vapi pool", {
      userId,
      error: getErrorMessage(err),
    });
    return null;
  }
}

async function removeTwilioNumberByE164Strict(
  phoneNumber: string,
  client: ReturnType<typeof getTwilioClient> = getTwilioClient(),
): Promise<void> {
  if (!client)
    throw new Error("Twilio client is unavailable — carrier release cannot be verified.");
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (rows[0]?.sid) await client.incomingPhoneNumbers(rows[0].sid).remove();
}

function carrierReleaseKind(carrierId: string | null | undefined): CarrierReleaseKind {
  if (carrierId && isVapiPhoneNumberId(carrierId)) return "vapi";
  if (carrierId && isTwilioPhoneNumberSid(carrierId)) return "twilio_sid";
  return "e164";
}

function carrierReleaseAdapters(client: ReturnType<typeof getTwilioClient>) {
  return {
    twilioAvailable: Boolean(client),
    inspectVapiProvider: async (vapiNumberId: string) => {
      const numbers = await listVapiNumbers();
      return numbers.find((number) => number.id === vapiNumberId)?.provider ?? null;
    },
    releaseVapi: releaseVapiNumber,
    releaseTwilioBySid: async (twilioSid: string) => {
      if (!client) throw new Error("Twilio client is unavailable.");
      await client.incomingPhoneNumbers(twilioSid).remove();
    },
    releaseTwilioByE164: async (phoneNumber: string) => {
      await removeTwilioNumberByE164Strict(phoneNumber, client);
    },
  };
}

/**
 * Strictly compensate a carrier allocation, or persist enough information for
 * the daily orphan janitor to finish. A Vapi import may time out after creating
 * a resource, so an unknown Vapi id is rediscovered by E.164 before teardown.
 */
async function releaseCarrierOrRecord(args: {
  userId: string;
  phoneNumber: string;
  carrierId?: string | null;
  contextError: unknown;
}): Promise<CarrierCleanupResult> {
  const client = getTwilioClient();
  let effectiveCarrierId = args.carrierId ?? null;
  const errors: string[] = [];

  if (!effectiveCarrierId) {
    try {
      const numbers = await listVapiNumbers();
      effectiveCarrierId = numbers.find((number) => number.number === args.phoneNumber)?.id ?? null;
    } catch (discoveryError) {
      errors.push(`Vapi E.164 discovery: ${getErrorMessage(discoveryError)}`);
    }
  }

  const release = await releaseCarrierAllocations(
    {
      kind: carrierReleaseKind(effectiveCarrierId),
      phoneNumber: args.phoneNumber,
      carrierId: effectiveCarrierId,
    },
    carrierReleaseAdapters(client),
  );
  if (!release.ok && release.error) errors.push(release.error);

  if (errors.length === 0) {
    log.info("Carrier compensation completed", {
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      carrierId: effectiveCarrierId,
      cause: getErrorMessage(args.contextError),
    });
    return { released: true, queued: false };
  }

  const error = `${getErrorMessage(args.contextError)} | ${errors.join(" | ")}`.slice(0, 2000);
  try {
    await recordPendingOrphanCarrierResource({
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      carrierId: effectiveCarrierId,
      error,
    });
    log.error("Carrier compensation queued in durable orphan ledger", {
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      carrierId: effectiveCarrierId,
      error,
    });
    return { released: false, queued: true, error };
  } catch (ledgerError) {
    const ledgerMessage = getErrorMessage(ledgerError);
    log.error("Carrier compensation and durable handoff both failed", {
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      carrierId: effectiveCarrierId,
      error,
      ledgerError: ledgerMessage,
    });
    return {
      released: false,
      queued: false,
      error: `${error} | orphan ledger: ${ledgerMessage}`.slice(0, 2000),
    };
  }
}

async function compensateProvisionedNumber(args: {
  userId: string;
  phoneNumber: string;
  vapiNumberId: string;
  persistenceError: unknown;
}): Promise<CarrierCleanupResult> {
  return releaseCarrierOrRecord({
    userId: args.userId,
    phoneNumber: args.phoneNumber,
    carrierId: args.vapiNumberId,
    contextError: args.persistenceError,
  });
}

export async function provisionTenantNumber(
  userId: string,
  opts: ProvisionOpts = {},
): Promise<ProvisionResult> {
  if (!isAutoProvisioningEnabled()) {
    return {
      ok: false,
      error: "Auto-provisioning disabled (non-prod or WIRELINE_AUTO_PROVISION_NUMBERS=false).",
    };
  }

  if (!process.env.VAPI_PRIVATE_KEY?.trim()) {
    return { ok: false, error: "Vapi not configured on platform (VAPI_PRIVATE_KEY)." };
  }

  if (opts.agentId) {
    const existingLine = await findAgentPhoneLine(userId, opts.agentId);
    if (existingLine) {
      return {
        ok: true,
        phoneNumber: existingLine.phoneNumber,
        vapiNumberId: existingLine.vapiNumberId ?? undefined,
        reused: true,
      };
    }
  }

  const { plan, phoneSlots } = await resolveTenantPlan(userId);
  const existing = await countExistingNumbers(userId);

  if (existing >= phoneSlots) {
    const reusable = await findFirstUnassignedNumber(userId);
    if (reusable && opts.agentId) {
      await drizzle
        .update(schema.phoneNumbers)
        .set({ agentId: opts.agentId })
        .where(eq(schema.phoneNumbers.id, reusable.id));
      await ensureTenantTelecomDefaults(userId, {
        vapiPhoneNumberId: reusable.vapiNumberId ?? undefined,
        phoneNumberE164: reusable.phoneNumber,
      });
      return {
        ok: true,
        phoneNumber: reusable.phoneNumber,
        vapiNumberId: reusable.vapiNumberId ?? undefined,
        reused: true,
      };
    }
    return {
      ok: false,
      error: `${plan.name} includes ${phoneSlots} dedicated line${phoneSlots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
    };
  }

  try {
    let vapiNumberId: string;
    let phoneNumber: string;

    const twilioPurchased = await purchaseTwilioLocalNumber(userId, opts.areaCode);
    if (twilioPurchased) {
      // A Vapi import can time out after the provider accepted it. Compensation
      // therefore rediscovers a partial Vapi row by E.164 and releases both
      // providers, or records a durable janitor work item before returning.
      let imported;
      try {
        imported = await importTwilioNumberToVapi({
          number: twilioPurchased.phoneNumber,
          name: `Wireline · ${userId.slice(0, 8)}${opts.agentId ? ` · ${opts.agentId.slice(0, 8)}` : ""}`,
          smsEnabled: false,
        });
      } catch (importErr) {
        const cleanup = await releaseCarrierOrRecord({
          userId,
          phoneNumber: twilioPurchased.phoneNumber,
          contextError: importErr,
        });
        return {
          ok: false,
          error: cleanup.released
            ? "Voice import failed; the carrier allocation was released. Try again."
            : cleanup.queued
              ? "Voice import failed; carrier cleanup was queued safely. Try again shortly."
              : "Voice import failed and cleanup could not be recorded. Support has been alerted.",
        };
      }
      if (!imported.id || !imported.number) {
        const responseError = new Error("Vapi import returned no number id or E.164 value.");
        const cleanup = await releaseCarrierOrRecord({
          userId,
          phoneNumber: twilioPurchased.phoneNumber,
          carrierId: imported.id || null,
          contextError: responseError,
        });
        return {
          ok: false,
          error: cleanup.released
            ? "Voice import returned incomplete data; the carrier allocation was released."
            : cleanup.queued
              ? "Voice import returned incomplete data; carrier cleanup was queued safely."
              : "Voice import returned incomplete data and cleanup could not be recorded.",
        };
      }
      vapiNumberId = imported.id;
      phoneNumber = imported.number;
    } else {
      const headroom = await vapiAccountHeadroom();
      if (headroom.remaining <= 0) {
        return {
          ok: false,
          error:
            "No Vapi number capacity and Twilio purchase unavailable. Configure TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN or release unused numbers.",
        };
      }
      const fresh = await provisionVapiNumber({
        areaCode: opts.areaCode,
        name: `Wireline · ${userId.slice(0, 8)}`,
      });
      if (!fresh.id || !fresh.number) {
        return { ok: false, error: "Vapi provisioning returned no number." };
      }
      vapiNumberId = fresh.id;
      phoneNumber = fresh.number;
    }

    try {
      await runCompanyIdentityMutation(userId, "phone_number_changed", async (tx) => {
        // Re-check capacity under the identity advisory lock after the carrier
        // buy. Two concurrent provisioners can both pass the pre-buy count;
        // the loser releases the purchased number instead of exceeding slots.
        const [{ held }] = await tx
          .select({ held: sql<number>`count(*)` })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, userId));
        if (Number(held || 0) >= phoneSlots) {
          const err = new Error("PHONE_CAPACITY_RACE");
          (err as Error & { code?: string }).code = "PHONE_CAPACITY_RACE";
          throw err;
        }
        await tx.insert(schema.phoneNumbers).values({
          userId,
          phoneNumber,
          vapiNumberId,
          agentId: opts.agentId ?? null,
          campaignLabel: opts.campaignLabel ?? "auto-provisioned",
        });
      });
    } catch (persistenceError) {
      const cleanup = await compensateProvisionedNumber({
        userId,
        phoneNumber,
        vapiNumberId,
        persistenceError,
      });
      if (
        (persistenceError as Error & { code?: string })?.code === "PHONE_CAPACITY_RACE" ||
        /PHONE_CAPACITY_RACE/.test(getErrorMessage(persistenceError))
      ) {
        return {
          ok: false,
          error: cleanup.queued
            ? `${plan.name} capacity was reached; carrier cleanup was queued safely.`
            : `${plan.name} includes ${phoneSlots} dedicated line${phoneSlots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
        };
      }
      return {
        ok: false,
        error: cleanup.released
          ? "Number provisioning could not be saved; the provider allocation was released."
          : cleanup.queued
            ? "Number provisioning could not be saved; carrier cleanup was queued safely."
            : "Number provisioning could not be saved and cleanup could not be recorded.",
      };
    }

    await ensureTenantTelecomDefaults(userId, {
      vapiPhoneNumberId: vapiNumberId,
      phoneNumberE164: phoneNumber,
    });

    log.info("Provisioned tenant number", {
      userId,
      agentId: opts.agentId,
      phoneNumber,
      vapiNumberId,
      planId: plan.id,
      viaTwilio: Boolean(twilioPurchased),
    });

    return { ok: true, phoneNumber, vapiNumberId, reused: false };
  } catch (err) {
    log.error("provisionTenantNumber failed", {
      userId,
      error: getErrorMessage(err),
    });
    return { ok: false, error: getErrorMessage(err) };
  }
}

export async function releaseTenantNumber(
  userId: string,
  phoneNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = getTwilioClient();
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(
      and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.phoneNumber, phoneNumber)),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Number not found for this tenant." };

  const carrierId = row.vapiNumberId;
  const release = await releaseCarrierAllocations(
    {
      kind: carrierReleaseKind(carrierId),
      phoneNumber,
      carrierId,
    },
    carrierReleaseAdapters(client),
  );

  if (!release.ok) {
    log.warn("Carrier number release failed — preserving local ownership row", {
      userId,
      phoneNumber,
      carrierId,
      error: release.error,
    });
    return release;
  }

  try {
    await runCompanyIdentityMutation(userId, "phone_number_changed", async (tx) => {
      await tx.delete(schema.phoneNumbers).where(eq(schema.phoneNumbers.id, row.id));

      // Serialized: inside the runCompanyIdentityMutation transaction callback,
      // immediately after the delete above.
      const [[settingsRow], remainingLines] = await serialQueryBatch([
        tx
          .select({
            vapiPhoneNumberId: schema.settings.vapiPhoneNumberId,
            twilioSmsFromNumber: schema.settings.twilioSmsFromNumber,
          })
          .from(schema.settings)
          .where(eq(schema.settings.userId, userId))
          .limit(1),
        tx
          .select({
            phoneNumber: schema.phoneNumbers.phoneNumber,
            vapiNumberId: schema.phoneNumbers.vapiNumberId,
          })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, userId))
          .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
          .limit(100),
      ]);

      if (settingsRow) {
        const patch: Partial<typeof schema.settings.$inferInsert> = {};
        if (carrierId && settingsRow.vapiPhoneNumberId === carrierId) {
          patch.vapiPhoneNumberId =
            remainingLines.find((line: { phoneNumber: string; vapiNumberId: string | null }) =>
              isVapiPhoneNumberId(line.vapiNumberId),
            )?.vapiNumberId ?? null;
        }
        if (settingsRow.twilioSmsFromNumber === phoneNumber) {
          patch.twilioSmsFromNumber = remainingLines[0]?.phoneNumber ?? null;
        }
        if (Object.keys(patch).length > 0) {
          patch.updatedAt = new Date();
          await tx.update(schema.settings).set(patch).where(eq(schema.settings.userId, userId));
        }
      }
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}
