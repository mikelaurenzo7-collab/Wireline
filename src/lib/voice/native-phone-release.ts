import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { AppError } from "../api-error";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import { resolveOwnedTwilioNumberSid } from "./native-phone-carrier";

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

  let carrierId: string | null;
  try {
    carrierId = isTwilioPhoneNumberSid(row.vapiNumberId)
      ? row.vapiNumberId
      : await resolveOwnedTwilioNumberSid(phoneNumber, row.vapiNumberId);
  } catch (error) {
    log.warn("Twilio ownership lookup failed before number release", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: "The carrier could not verify number ownership. The line remains attached for retry.",
    };
  }
  if (!carrierId) {
    return {
      ok: false,
      error:
        "This line is not uniquely owned by the configured Twilio account. It remains attached for operator reconciliation.",
    };
  }

  try {
    await releaseTwilioLine(carrierId);
  } catch (error) {
    log.warn("Twilio number release could not be confirmed", {
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
    log.error("Twilio carrier released but local phone retirement failed", {
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
