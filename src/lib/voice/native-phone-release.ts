import { and, desc, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { xaiPhoneBindings } from "../../db/xai-voice-schema";
import { AppError } from "../api-error";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { releaseTenantNumber as releaseLegacyTenantNumber } from "../phone-provisioning";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";

function twilioStatus(error: unknown): number | null {
  const value = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(value) ? value : null;
}

async function releaseTwilioLine(sid: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");
  try {
    await client.incomingPhoneNumbers(sid).remove();
  } catch (error) {
    if (twilioStatus(error) === 404) return;
    throw error;
  }
}

async function retireBinding(userId: string, phoneNumber: string): Promise<void> {
  await drizzle
    .update(xaiPhoneBindings)
    .set({
      status: "retired",
      provisioningToken: null,
      provisioningClaimedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(xaiPhoneBindings.userId, userId),
        eq(xaiPhoneBindings.phoneNumber, phoneNumber),
      ),
    );
}

export async function releaseNativeTenantNumber(
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
        .update(xaiPhoneBindings)
        .set({
          status: "retired",
          provisioningToken: null,
          provisioningClaimedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(xaiPhoneBindings.userId, userId),
            eq(xaiPhoneBindings.phoneNumber, phoneNumber),
          ),
        );
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
        "The carrier released the number, but Wireline could not finish local cleanup. Retry release to reconcile the workspace.",
    };
  }
}
