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

import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import { STRIPE_PLANS, planById, type StripePlanId } from "./plan-catalog";
import { includedPhoneSlotsForPlan } from "./phone-line-entitlements";
import { runCompanyIdentityMutation } from "./company-identity-mutation";
import {
  ensureTenantTelecomDefaults,
  findAgentPhoneLine,
  isTwilioPhoneNumberSid,
  isVapiPhoneNumberId,
} from "./agent-phone-lines";
import {
  importTwilioNumberToVapi,
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

  const smsUrl = `${appBaseUrl()}/api/twilio-webhook/sms`;
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

async function removeTwilioNumberByE164(phoneNumber: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) return;
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (rows[0]?.sid) {
    await client
      .incomingPhoneNumbers(rows[0].sid)
      .remove()
      .catch(() => undefined);
  }
}

async function compensateProvisionedNumber(args: {
  userId: string;
  phoneNumber: string;
  vapiNumberId: string;
  removeTwilio: boolean;
  persistenceError: unknown;
}): Promise<void> {
  await releaseVapiNumber(args.vapiNumberId).catch((releaseError) => {
    log.error("Failed to release Vapi number after persistence failure", {
      userId: args.userId,
      phoneNumber: args.phoneNumber,
      vapiNumberId: args.vapiNumberId,
      error: getErrorMessage(releaseError),
    });
  });
  if (args.removeTwilio) {
    await removeTwilioNumberByE164(args.phoneNumber);
  }
  log.error("Provider number released after local persistence failure", {
    userId: args.userId,
    phoneNumber: args.phoneNumber,
    vapiNumberId: args.vapiNumberId,
    error: getErrorMessage(args.persistenceError),
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
      // If the Vapi import throws (timeout, 5xx), release the just-purchased
      // Twilio number — otherwise it orphans as a silent ~$1.15/mo billing
      // leak that neither the DB nor Vapi knows about.
      let imported;
      try {
        imported = await importTwilioNumberToVapi({
          number: twilioPurchased.phoneNumber,
          name: `Wireline · ${userId.slice(0, 8)}${opts.agentId ? ` · ${opts.agentId.slice(0, 8)}` : ""}`,
          smsEnabled: false,
        });
      } catch (importErr) {
        await removeTwilioNumberByE164(twilioPurchased.phoneNumber);
        log.error("Vapi import failed after Twilio purchase — number released", {
          userId,
          phoneNumber: twilioPurchased.phoneNumber,
          error: getErrorMessage(importErr),
        });
        return { ok: false, error: "Voice import failed — number released. Try again." };
      }
      if (!imported.id || !imported.number) {
        await removeTwilioNumberByE164(twilioPurchased.phoneNumber);
        return { ok: false, error: "Vapi import succeeded but returned no number id." };
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
      await compensateProvisionedNumber({
        userId,
        phoneNumber,
        vapiNumberId,
        removeTwilio: Boolean(twilioPurchased),
        persistenceError,
      });
      if (
        (persistenceError as Error & { code?: string })?.code === "PHONE_CAPACITY_RACE" ||
        /PHONE_CAPACITY_RACE/.test(getErrorMessage(persistenceError))
      ) {
        return {
          ok: false,
          error: `${plan.name} includes ${phoneSlots} dedicated line${phoneSlots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
        };
      }
      return {
        ok: false,
        error: "Number provisioning could not be saved; the provider allocation was released.",
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

  try {
    const carrierId = row.vapiNumberId;
    if (carrierId && isVapiPhoneNumberId(carrierId)) {
      await releaseVapiNumber(carrierId).catch((err) => {
        log.warn("Vapi release returned error (likely already released)", {
          vapiNumberId: carrierId,
          error: getErrorMessage(err),
        });
      });
    } else if (client && carrierId && isTwilioPhoneNumberSid(carrierId)) {
      await client
        .incomingPhoneNumbers(carrierId)
        .remove()
        .catch((err) => {
          log.warn("Twilio release by SID failed", {
            twilioSid: carrierId,
            error: getErrorMessage(err),
          });
        });
    } else if (client) {
      await removeTwilioNumberByE164(phoneNumber);
    }

    await runCompanyIdentityMutation(userId, "phone_number_changed", async (tx) => {
      await tx.delete(schema.phoneNumbers).where(eq(schema.phoneNumbers.id, row.id));
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}
