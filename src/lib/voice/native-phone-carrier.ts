import { randomUUID } from "node:crypto";

import { AppError } from "../api-error";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { getCanonicalAppUrl } from "../app-url";
import { recordPendingOrphanCarrierResource } from "../orphan-carrier-ledger";
import { log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import { normalizeXAIPhoneNumber, twilioVoiceFallbackUrl } from "./xai-sip-config";

export const NATIVE_PROVISIONING_UNAVAILABLE =
  "Wireline could not activate a phone line right now. The platform configuration needs attention; no duplicate purchase will be attempted.";

export type NativeAvailableLocalNumber = {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
};

export type PurchasedNativeNumber = {
  phoneNumber: string;
  sid: string;
};

type TwilioMutationError = {
  status?: unknown;
  code?: unknown;
  name?: unknown;
};

function twilioStatus(error: unknown): number | null {
  const status = Number((error as TwilioMutationError | null)?.status);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

export function isAmbiguousTwilioPhoneMutationError(error: unknown): boolean {
  const status = twilioStatus(error);
  if (status === null) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function purchaseFields(friendlyName: string) {
  const appUrl = getCanonicalAppUrl();
  const voiceFallbackUrl = twilioVoiceFallbackUrl();
  return {
    smsUrl: `${appUrl}/api/twilio-webhook/sms#rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000`,
    smsMethod: "POST" as const,
    voiceUrl: voiceFallbackUrl,
    voiceMethod: "POST" as const,
    voiceFallbackUrl,
    voiceFallbackMethod: "POST" as const,
    friendlyName,
  };
}

export async function listNativeAvailableLocalNumbers(
  areaCode?: string,
  limit = 8,
): Promise<NativeAvailableLocalNumber[]> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio number inventory is not configured.");
  if (areaCode && !/^\d{3}$/.test(areaCode)) {
    throw AppError.badRequest("area_code must be a 3-digit US code.");
  }

  const rows = await client.availablePhoneNumbers("US").local.list({
    voiceEnabled: true,
    smsEnabled: true,
    ...(areaCode ? { areaCode: Number(areaCode) } : {}),
    limit: Math.max(1, Math.min(20, Math.floor(limit))),
  });
  return rows
    .map((row) => ({
      phoneNumber: String(row.phoneNumber || ""),
      locality: row.locality ? String(row.locality) : null,
      region: row.region ? String(row.region) : null,
    }))
    .filter((row) => /^\+1\d{10}$/.test(row.phoneNumber));
}

async function recoverAcceptedPurchase(input: {
  phoneNumber: string;
  friendlyName: string;
}): Promise<PurchasedNativeNumber | null> {
  const client = getTwilioClient();
  if (!client) return null;
  const rows = await client.incomingPhoneNumbers.list({
    phoneNumber: input.phoneNumber,
    limit: 10,
  });
  const matching = rows.filter(
    (row) =>
      String(row.phoneNumber || "") === input.phoneNumber &&
      String(row.friendlyName || "") === input.friendlyName,
  );
  if (matching.length !== 1) return null;
  const sid = String(matching[0]?.sid || "").trim();
  return isTwilioPhoneNumberSid(sid)
    ? { phoneNumber: input.phoneNumber, sid }
    : null;
}

async function recordAmbiguousPurchase(input: {
  userId: string;
  phoneNumber: string;
  error: unknown;
}): Promise<void> {
  try {
    await recordPendingOrphanCarrierResource({
      userId: input.userId,
      phoneNumber: input.phoneNumber,
      carrierId: null,
      error: `Ambiguous native Twilio purchase: ${getErrorMessage(input.error)}`,
    });
  } catch (ledgerError) {
    log.error("Ambiguous native phone purchase could not be written to the orphan ledger", {
      userId: input.userId,
      phoneSuffix: input.phoneNumber.slice(-4),
      error: getErrorMessage(ledgerError),
    });
  }
}

export async function purchaseNativeNumber(input: {
  userId: string;
  areaCode?: string;
  preferredPhoneNumber?: string;
}): Promise<PurchasedNativeNumber> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio number purchasing is not configured.");

  const preferred = normalizeXAIPhoneNumber(input.preferredPhoneNumber);
  let phoneNumber = preferred;
  if (!phoneNumber) {
    const candidates = await listNativeAvailableLocalNumbers(input.areaCode, 5);
    phoneNumber = candidates[0]?.phoneNumber || null;
  }
  if (!phoneNumber) {
    throw AppError.fromHttpStatus(
      404,
      input.areaCode
        ? "That area code has no inventory right now. Try another nearby code."
        : "No local phone-number inventory is available right now.",
    );
  }

  const operationId = randomUUID();
  const friendlyName = `Wireline native ${operationId.slice(0, 12)} · ${input.userId.slice(0, 8)}`.slice(
    0,
    64,
  );
  try {
    const created = await client.incomingPhoneNumbers.create({
      phoneNumber,
      ...purchaseFields(friendlyName),
    });
    const sid = String(created.sid || "").trim();
    const e164 = normalizeXAIPhoneNumber(created.phoneNumber) || phoneNumber;
    if (isTwilioPhoneNumberSid(sid)) return { phoneNumber: e164, sid };

    const recovered = await recoverAcceptedPurchase({ phoneNumber: e164, friendlyName });
    if (recovered) return recovered;
    const error = new Error("Twilio accepted the purchase but returned no valid phone-number SID.");
    await recordAmbiguousPurchase({ userId: input.userId, phoneNumber: e164, error });
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const recovered = await recoverAcceptedPurchase({ phoneNumber, friendlyName }).catch(() => null);
    if (recovered) return recovered;

    if (isAmbiguousTwilioPhoneMutationError(error)) {
      await recordAmbiguousPurchase({ userId: input.userId, phoneNumber, error });
      throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
    }
    throw AppError.fromHttpStatus(
      twilioStatus(error) === 400 || twilioStatus(error) === 404 ? 409 : 502,
      preferred
        ? "That phone number is no longer available. Search again and choose another."
        : "The carrier rejected the phone-number purchase.",
    );
  }
}

export async function releasePurchasedNativeNumber(input: {
  userId: string;
  purchase: PurchasedNativeNumber;
  cause: unknown;
}): Promise<void> {
  const client = getTwilioClient();
  if (!client) {
    await recordPendingOrphanCarrierResource({
      userId: input.userId,
      phoneNumber: input.purchase.phoneNumber,
      carrierId: input.purchase.sid,
      error: `Native provisioning compensation unavailable: ${getErrorMessage(input.cause)}`,
    });
    return;
  }

  try {
    await client.incomingPhoneNumbers(input.purchase.sid).remove();
  } catch (error) {
    if (twilioStatus(error) === 404) return;
    await recordPendingOrphanCarrierResource({
      userId: input.userId,
      phoneNumber: input.purchase.phoneNumber,
      carrierId: input.purchase.sid,
      error: `Native provisioning compensation failed: ${getErrorMessage(error)} | cause: ${getErrorMessage(
        input.cause,
      )}`,
    });
  }
}
