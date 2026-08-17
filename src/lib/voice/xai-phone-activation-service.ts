import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { xaiPhoneBindings } from "../../db/xai-voice-schema";
import { AppError } from "../api-error";
import { findAgentPhoneLine } from "../agent-phone-lines";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import {
  XAI_TWILIO_ORIGINATION_FRIENDLY_NAME,
  XAI_TWILIO_TRUNK_FRIENDLY_NAME,
  normalizeXAIPhoneNumber,
  twilioVoiceFallbackUrl,
  xaiSecureTrunkingEnabled,
  xaiSharedTwilioOriginationUri,
} from "./xai-sip-config";
import {
  getNativeXAIPhoneStatus,
  provisionNativeXAIPhone as provisionNativeXAIPhoneLowLevel,
  type NativeXAIPhoneStatus,
} from "./xai-sip-provisioning";

export { getNativeXAIPhoneStatus };
export type { NativeXAIPhoneStatus };

async function reconcileAgentBinding(input: {
  userId: string;
  agentId: string;
}): Promise<void> {
  const [[agent], line] = await Promise.all([
    drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1),
    findAgentPhoneLine(input.userId, input.agentId),
  ]);
  if (!agent) throw AppError.notFound("Agent not found.");

  const phoneNumber = normalizeXAIPhoneNumber(line?.phoneNumber);
  if (!phoneNumber) return;
  const [binding] = await drizzle
    .select()
    .from(xaiPhoneBindings)
    .where(
      and(
        eq(xaiPhoneBindings.userId, input.userId),
        eq(xaiPhoneBindings.phoneNumber, phoneNumber),
      ),
    )
    .limit(1);
  const complete = Boolean(
    binding?.status === "active" &&
      binding.xaiPhoneNumberId &&
      binding.xaiWebhookId &&
      binding.webhookSecretEncrypted &&
      binding.twilioPhoneNumberSid &&
      binding.twilioSipTrunkSid,
  );
  if (!binding || !complete || binding.agentId === input.agentId) return;

  const [rebound] = await drizzle
    .update(xaiPhoneBindings)
    .set({ agentId: input.agentId, updatedAt: new Date() })
    .where(
      and(
        eq(xaiPhoneBindings.id, binding.id),
        eq(xaiPhoneBindings.userId, input.userId),
        eq(xaiPhoneBindings.agentId, binding.agentId),
      ),
    )
    .returning({ id: xaiPhoneBindings.id });
  if (!rebound) {
    throw AppError.conflict("The phone line assignment changed while native voice was activating.");
  }

  log.info("Rebound complete native phone registration to current agent", {
    userId: input.userId,
    agentId: input.agentId,
    bindingId: binding.id,
    phoneSuffix: phoneNumber.slice(-4),
  });
}

async function repairTwilioRouting(
  binding: NonNullable<NativeXAIPhoneStatus["binding"]> | null | undefined,
): Promise<void> {
  if (!binding?.twilioSipTrunkSid || !binding.twilioPhoneNumberSid) return;
  const client = getTwilioClient() as any;
  if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");

  const trunk = client.trunking.v1.trunks(binding.twilioSipTrunkSid);
  await trunk.update({
    friendlyName: XAI_TWILIO_TRUNK_FRIENDLY_NAME,
    transferMode: "enable-all",
    secure: xaiSecureTrunkingEnabled(),
    disasterRecoveryMethod: "POST",
    disasterRecoveryUrl: twilioVoiceFallbackUrl(),
  });

  const attached = await trunk.phoneNumbers.list({ limit: 1_000 });
  const hasPhone = attached.some(
    (row: { sid?: unknown; phoneNumberSid?: unknown }) =>
      row.sid === binding.twilioPhoneNumberSid ||
      row.phoneNumberSid === binding.twilioPhoneNumberSid,
  );
  if (!hasPhone) {
    await trunk.phoneNumbers.create({ phoneNumberSid: binding.twilioPhoneNumberSid });
  }

  const collection = trunk.originationUrls;
  const originations = await collection.list({ limit: 100 });
  const sipUrl = xaiSharedTwilioOriginationUri();
  const existing = originations.find(
    (row: { sipUrl?: unknown; friendlyName?: unknown }) =>
      String(row.sipUrl || "") === sipUrl ||
      String(row.friendlyName || "") === XAI_TWILIO_ORIGINATION_FRIENDLY_NAME,
  );
  const payload = {
    enabled: true,
    friendlyName: XAI_TWILIO_ORIGINATION_FRIENDLY_NAME,
    priority: 10,
    weight: 10,
    sipUrl,
  };
  const sid = String(existing?.sid || "").trim();
  if (sid) await collection(sid).update(payload);
  else await collection.create(payload);
}

export async function provisionNativeXAIPhone(input: {
  userId: string;
  agentId: string;
}): Promise<NativeXAIPhoneStatus> {
  await reconcileAgentBinding(input);
  const result = await provisionNativeXAIPhoneLowLevel(input);
  try {
    await repairTwilioRouting(result.binding);
  } catch (error) {
    log.error("Native phone activation could not reconcile Twilio routing", {
      userId: input.userId,
      agentId: input.agentId,
      bindingId: result.binding?.id,
      error: getErrorMessage(error),
    });
    if (error instanceof AppError) throw error;
    throw AppError.serviceUnavailable(
      "The native phone registration exists, but its carrier route could not be verified.",
    );
  }
  return result;
}
