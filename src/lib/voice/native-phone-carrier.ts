import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { liveExternalActionPolicyForUser } from "../account-environment-policy";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { getCanonicalAppUrl } from "../app-url";
import {
  clearNativeTwilioPurchaseClaim,
  createPendingNativeTwilioPurchaseClaim,
  retainNativeTwilioPurchaseClaim,
  type NativeTwilioPurchaseClaim,
} from "../orphan-carrier-ledger";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import {
  normalizeOpenAIPhoneNumber,
  openAISipConfigured,
  twilioOpenAIInboundFallbackUrl,
  twilioOpenAIInboundVoiceUrl,
} from "./openai-sip-config";

export const NATIVE_PROVISIONING_UNAVAILABLE =
  "BotBound could not activate a phone line right now. The platform configuration needs attention; no duplicate purchase will be attempted.";

export type NativeAvailableLocalNumber = {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
};

export type PurchasedNativeNumber = {
  phoneNumber: string;
  sid: string;
  claim: NativeTwilioPurchaseClaim;
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

function routingFields() {
  const appUrl = getCanonicalAppUrl();
  const voiceFallbackUrl = twilioOpenAIInboundFallbackUrl();
  return {
    smsUrl: `${appUrl}/api/twilio-webhook/sms#rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000`,
    smsMethod: "POST" as const,
    voiceUrl: twilioOpenAIInboundVoiceUrl(),
    voiceMethod: "POST" as const,
    voiceFallbackUrl,
    voiceFallbackMethod: "POST" as const,
  };
}

export type NativeNumberRoutingSnapshot = {
  smsUrl?: string | null;
  smsMethod?: string | null;
  voiceUrl?: string | null;
  voiceMethod?: string | null;
  voiceFallbackUrl?: string | null;
  voiceFallbackMethod?: string | null;
};

export function isNativeNumberOpenAIRouted(row: NativeNumberRoutingSnapshot): boolean {
  const expected = routingFields();
  return (
    row.smsUrl === expected.smsUrl &&
    row.smsMethod === expected.smsMethod &&
    row.voiceUrl === expected.voiceUrl &&
    row.voiceMethod === expected.voiceMethod &&
    row.voiceFallbackUrl === expected.voiceFallbackUrl &&
    row.voiceFallbackMethod === expected.voiceFallbackMethod
  );
}

function purchaseFields(friendlyName: string) {
  return { ...routingFields(), friendlyName };
}

export async function listNativeAvailableLocalNumbers(
  userId: string,
  areaCode?: string,
  limit = 8,
): Promise<NativeAvailableLocalNumber[]> {
  await assertNativePhoneExternalActionAllowed(userId, "native_phone_inventory_search");
  return listNativeAvailableLocalNumbersAfterAuthorization(areaCode, limit);
}

async function listNativeAvailableLocalNumbersAfterAuthorization(
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

async function assertNativePhoneExternalActionAllowed(
  userId: string,
  action: string,
): Promise<void> {
  const policy = await liveExternalActionPolicyForUser(userId);
  if (policy.allowed) return;
  log.warn("Native phone provider access blocked by account environment", {
    userId,
    action,
    accountEnvironment: policy.environment ?? "missing",
    code: policy.code,
  });
  throw new AppError(policy.status, policy.code, policy.message);
}

export async function resolveOwnedTwilioNumberSid(
  phoneNumber: string,
  candidateSid?: string | null,
): Promise<string | null> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio number routing is not configured.");
  const normalized = normalizeOpenAIPhoneNumber(phoneNumber);
  if (!normalized) throw AppError.badRequest("The BotBound phone number is invalid.");

  if (isTwilioPhoneNumberSid(candidateSid)) {
    try {
      const row = await client.incomingPhoneNumbers(candidateSid).fetch();
      return normalizeOpenAIPhoneNumber(row.phoneNumber) === normalized ? candidateSid : null;
    } catch (error) {
      if (twilioStatus(error) !== 404) throw error;
    }
  }

  const matches = (await client.incomingPhoneNumbers.list({ phoneNumber: normalized, limit: 10 }))
    .filter((row) => normalizeOpenAIPhoneNumber(row.phoneNumber) === normalized)
    .map((row) => String(row.sid || "").trim())
    .filter(isTwilioPhoneNumberSid);
  return matches.length === 1 ? matches[0]! : null;
}

type ConfigureNativeNumberRoutingInput = {
  userId: string;
  phoneNumber: string;
  carrierNumberId?: string | null;
};

async function configureNativeNumberRoutingAfterAuthorization(
  input: ConfigureNativeNumberRoutingInput,
): Promise<string> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio number routing is not configured.");
  const sid = await resolveOwnedTwilioNumberSid(input.phoneNumber, input.carrierNumberId);
  if (!sid) {
    throw AppError.conflict(
      "The phone number is not uniquely owned by the configured Twilio account.",
    );
  }
  const current = await client.incomingPhoneNumbers(sid).fetch();
  if (isNativeNumberOpenAIRouted(current)) return sid;

  const updated = await client.incomingPhoneNumbers(sid).update(routingFields());
  if (!isNativeNumberOpenAIRouted(updated)) {
    throw AppError.serviceUnavailable(
      "Twilio did not confirm the canonical BotBound phone-number routing.",
    );
  }
  return sid;
}

export async function configureNativeNumberRouting(
  input: ConfigureNativeNumberRoutingInput,
): Promise<string> {
  await assertNativePhoneExternalActionAllowed(input.userId, "native_phone_route_openai");
  return configureNativeNumberRoutingAfterAuthorization(input);
}

export type OwnedTwilioRoutingRepairState =
  | "ready"
  | "not_configured"
  | "blocked"
  | "degraded";

export type OwnedTwilioRoutingRepairResult = {
  state: OwnedTwilioRoutingRepairState;
  confirmedPhoneNumbers: Set<string>;
  failures: Map<string, string>;
};

const OWNED_ROUTING_REPAIR_CONCURRENCY = 5;

/**
 * Rewrite and confirm every owned Twilio voice/SMS webhook against the complete
 * canonical OpenAI inbound configuration. The result is safe to expose as
 * health metadata: provider error details stay in server logs.
 */
export async function repairOwnedTwilioOpenAIRouting(
  userId: string,
): Promise<OwnedTwilioRoutingRepairResult> {
  const confirmedPhoneNumbers = new Set<string>();
  const failures = new Map<string, string>();
  if (!openAISipConfigured()) {
    return { state: "not_configured", confirmedPhoneNumbers, failures };
  }
  const policy = await liveExternalActionPolicyForUser(userId);
  if (!policy.allowed) {
    return { state: "blocked", confirmedPhoneNumbers, failures };
  }

  const rows = await drizzle
    .select({
      phoneNumber: schema.phoneNumbers.phoneNumber,
      carrierNumberId: schema.phoneNumbers.vapiNumberId,
    })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(OWNED_ROUTING_REPAIR_CONCURRENCY, rows.length) },
    async () => {
      for (;;) {
        const row = rows[cursor++];
        if (!row) return;
        try {
          const sid = await configureNativeNumberRoutingAfterAuthorization({
            userId,
            phoneNumber: row.phoneNumber,
            carrierNumberId: row.carrierNumberId,
          });
          if (sid !== row.carrierNumberId && isTwilioPhoneNumberSid(sid)) {
            await drizzle
              .update(schema.phoneNumbers)
              .set({ vapiNumberId: sid })
              .where(
                and(
                  eq(schema.phoneNumbers.userId, userId),
                  eq(schema.phoneNumbers.phoneNumber, row.phoneNumber),
                ),
              );
          }
          confirmedPhoneNumbers.add(row.phoneNumber);
        } catch (error) {
          failures.set(
            row.phoneNumber,
            "BotBound could not confirm this line's Twilio routing. Retry shortly or contact support.",
          );
          log.warn("OpenAI inbound routing repair failed", {
            userId,
            phoneSuffix: row.phoneNumber.slice(-4),
            error: getErrorMessage(error),
          });
        }
      }
    },
  );
  await Promise.all(workers);

  return {
    state: failures.size ? "degraded" : "ready",
    confirmedPhoneNumbers,
    failures,
  };
}

async function recoverAcceptedPurchase(input: {
  phoneNumber: string;
  friendlyName: string;
}): Promise<Omit<PurchasedNativeNumber, "claim"> | null> {
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
  return isTwilioPhoneNumberSid(sid) ? { phoneNumber: input.phoneNumber, sid } : null;
}

async function retainPurchaseClaimOrRaise(
  claim: NativeTwilioPurchaseClaim,
  phase: "provider_accepted" | "provider_outcome_ambiguous" | "compensation_pending",
): Promise<void> {
  try {
    await retainNativeTwilioPurchaseClaim(claim, phase);
  } catch (ledgerError) {
    log.error("Native phone purchase claim could not be retained", {
      userId: claim.userId,
      operationId: claim.operationId,
      phase,
      error: getErrorMessage(ledgerError),
    });
    // Never make a second provider attempt when durable reconciliation state
    // is uncertain. The pre-provider claim remains the terminal cleanup fence.
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }
}

export async function purchaseNativeNumber(input: {
  userId: string;
  areaCode?: string;
  preferredPhoneNumber?: string;
}): Promise<PurchasedNativeNumber> {
  await assertNativePhoneExternalActionAllowed(input.userId, "native_phone_purchase");
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("Twilio number purchasing is not configured.");

  const preferredRaw = String(input.preferredPhoneNumber || "").trim();
  const preferred = normalizeOpenAIPhoneNumber(preferredRaw);
  if (preferredRaw && (!preferred || !/^\+1\d{10}$/.test(preferred))) {
    throw AppError.badRequest("phone_number must be a US E.164 number");
  }
  let phoneNumber = preferred;
  if (!phoneNumber) {
    const candidates = await listNativeAvailableLocalNumbersAfterAuthorization(input.areaCode, 5);
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
  let claim: NativeTwilioPurchaseClaim;
  try {
    claim = await createPendingNativeTwilioPurchaseClaim({
      userId: input.userId,
      operationId,
      phoneNumber,
    });
  } catch (error) {
    log.error("Native phone purchase was stopped before the provider mutation", {
      userId: input.userId,
      operationId,
      phoneSuffix: phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }

  let created: { sid?: string | null; phoneNumber?: string | null };
  try {
    created = await client.incomingPhoneNumbers.create({
      phoneNumber,
      ...purchaseFields(claim.friendlyName),
    });
  } catch (error) {
    if (!isAmbiguousTwilioPhoneMutationError(error)) {
      try {
        await clearNativeTwilioPurchaseClaim(claim);
      } catch (ledgerError) {
        log.error("Rejected native phone purchase claim could not be cleared", {
          userId: input.userId,
          operationId,
          error: getErrorMessage(ledgerError),
        });
        throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
      }
      throw AppError.fromHttpStatus(
        twilioStatus(error) === 400 || twilioStatus(error) === 404 ? 409 : 502,
        preferred
          ? "That phone number is no longer available. Search again and choose another."
          : "The carrier rejected the phone-number purchase.",
      );
    }

    const recovered = await recoverAcceptedPurchase({
      phoneNumber,
      friendlyName: claim.friendlyName,
    }).catch(() => null);
    if (recovered) {
      await retainPurchaseClaimOrRaise(claim, "provider_accepted");
      return { ...recovered, claim };
    }
    await retainPurchaseClaimOrRaise(claim, "provider_outcome_ambiguous");
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }

  const sid = String(created.sid || "").trim();
  const e164 = normalizeOpenAIPhoneNumber(created.phoneNumber) || phoneNumber;
  if (isTwilioPhoneNumberSid(sid)) {
    await retainPurchaseClaimOrRaise(claim, "provider_accepted");
    return { phoneNumber: e164, sid, claim };
  }

  const recovered = await recoverAcceptedPurchase({
    phoneNumber: e164,
    friendlyName: claim.friendlyName,
  }).catch(() => null);
  if (recovered) {
    await retainPurchaseClaimOrRaise(claim, "provider_accepted");
    return { ...recovered, claim };
  }
  await retainPurchaseClaimOrRaise(claim, "provider_outcome_ambiguous");
  throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
}

export async function releasePurchasedNativeNumber(input: {
  userId: string;
  purchase: PurchasedNativeNumber;
  cause: unknown;
}): Promise<void> {
  const client = getTwilioClient();
  if (!client) {
    await retainPurchaseClaimOrRaise(input.purchase.claim, "compensation_pending");
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }

  try {
    await client.incomingPhoneNumbers(input.purchase.sid).remove();
    await clearNativeTwilioPurchaseClaim(input.purchase.claim);
  } catch (error) {
    if (twilioStatus(error) === 404) {
      await clearNativeTwilioPurchaseClaim(input.purchase.claim);
      return;
    }
    await retainPurchaseClaimOrRaise(input.purchase.claim, "compensation_pending");
    log.error("Native phone purchase compensation remains pending", {
      userId: input.userId,
      operationId: input.purchase.claim.operationId,
      phoneSuffix: input.purchase.phoneNumber.slice(-4),
      error: getErrorMessage(error),
      cause: getErrorMessage(input.cause),
    });
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }
}
