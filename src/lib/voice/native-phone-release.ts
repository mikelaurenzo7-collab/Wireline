import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { releaseTenantNumber as releaseLegacyTenantNumber } from "../phone-provisioning";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import { deactivateNativeXAIPhoneLine } from "./xai-phone-activation-service";

function twilioStatus(error: unknown): number | null {
  const value = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(value) ? value : null;
}

async function releaseTwilioLine(sid: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("BotBound calling is temporarily unavailable.");
  try {
    await client.incomingPhoneNumbers(sid).remove();
  } catch (error) {
    if (twilioStatus(error) === 404) return;
    throw error;
  }
}

async function retireBinding(userId: string, phoneNumber: string): Promise<void> {
  await drizzle.execute(sql`
    SELECT binding_id
    FROM public.wireline_retire_xai_phone_binding(
      ${userId}::uuid,
      ${phoneNumber},
      NULL::uuid,
      NULL::text
    )
  `);
}

async function releaseNativeTenantNumberUnfenced(
  userId: string,
  phoneNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(
      and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.phoneNumber, phoneNumber)),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Number not found for this tenant." };

  const carrierId = row.vapiNumberId;
  if (!isTwilioPhoneNumberSid(carrierId)) {
    const legacy = await releaseLegacyTenantNumber(userId, phoneNumber);
    if (legacy.ok) await retireBinding(userId, phoneNumber).catch(() => {});
    return legacy;
  }

  try {
    await deactivateNativeXAIPhoneLine({ userId, phoneNumber });
  } catch (error) {
    log.warn("Native SIP trunk detach could not be confirmed before number release", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      carrierIdSuffix: carrierId.slice(-6),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: "The SIP route could not be detached. The number remains attached for a safe retry.",
    };
  }

  try {
    await releaseTwilioLine(carrierId);
  } catch (error) {
    log.warn("Native Twilio number release could not be confirmed", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      carrierIdSuffix: carrierId.slice(-6),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: "The carrier could not confirm release. The number remains attached for a safe retry.",
    };
  }

  try {
    await runCompanyIdentityMutation(userId, "phone_number_changed", async (tx) => {
      await tx
        .delete(schema.phoneNumbers)
        .where(and(eq(schema.phoneNumbers.id, row.id), eq(schema.phoneNumbers.userId, userId)));

      const [settings] = await tx
        .select({ twilioSmsFromNumber: schema.settings.twilioSmsFromNumber })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1);
      if (settings?.twilioSmsFromNumber === phoneNumber) {
        const [replacement] = await tx
          .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, userId))
          .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
          .limit(1);
        await tx
          .update(schema.settings)
          .set({ twilioSmsFromNumber: replacement?.phoneNumber ?? null, updatedAt: new Date() })
          .where(eq(schema.settings.userId, userId));
      }
    });
    return { ok: true };
  } catch (error) {
    log.error("Native carrier released but local phone retirement failed", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      carrierIdSuffix: carrierId.slice(-6),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error:
        "The carrier released the number, but BotBound could not finish local cleanup. Retry release to reconcile the workspace.",
    };
  }
}

export async function releaseNativeTenantNumber(
  userId: string,
  phoneNumber: string,
  options: { terminalCleanup?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (options.terminalCleanup) {
    return releaseNativeTenantNumberUnfenced(userId, phoneNumber);
  }
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId,
    operation: "native_phone_release",
    ttlMs: 20 * 60_000,
    perform: () => releaseNativeTenantNumberUnfenced(userId, phoneNumber),
  });
  return outcome.performed
    ? outcome.result
    : {
        ok: false,
        error: "Number release is unavailable while terminal account deletion is in progress.",
      };
}
