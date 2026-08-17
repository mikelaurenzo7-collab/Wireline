/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { xaiPhoneBindings, type XAIPhoneBinding } from "../../db/xai-voice-schema";
import { AppError } from "../api-error";
import { findAgentPhoneLine, isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { encryptSecret, isVaultConfigured, lastFour } from "../secret-vault";
import { drizzle, fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import {
  XAI_PHONE_NUMBERS_URL,
  XAI_TWILIO_ORIGINATION_FRIENDLY_NAME,
  XAI_TWILIO_TRUNK_FRIENDLY_NAME,
  normalizeXAIPhoneNumber,
  resolveXAISipAllowedAddresses,
  twilioVoiceFallbackUrl,
  xaiSecureTrunkingEnabled,
  xaiSharedTwilioOriginationUri,
  xaiVoiceWebhookUrl,
} from "./xai-sip-config";

const PROVISIONING_CLAIM_TTL_MS = 10 * 60 * 1000;
const XAI_REGISTRATION_TIMEOUT_MS = 20_000;

export const XAI_OUTCOME_AMBIGUOUS = "XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS";
export const XAI_ACTIVATION_FAILED = "NATIVE_PHONE_ACTIVATION_FAILED";

type XAIPhoneRegistrationPayload = {
  phone_number?: {
    phone_number_id?: unknown;
    webhook_id?: unknown;
  };
  webhook?: {
    webhook_id?: unknown;
    dispatch_signing_secret?: unknown;
  };
  phone_number_id?: unknown;
  webhook_id?: unknown;
  dispatch_signing_secret?: unknown;
};

type XAIPhoneRegistrationResult = {
  xaiPhoneNumberId: string;
  xaiWebhookId: string;
  dispatchSigningSecret: string;
};

type ProvisioningClaim = {
  binding: XAIPhoneBinding;
  token: string | null;
  reused: boolean;
};

export type NativeXAIPhoneStatus = {
  configured: boolean;
  binding: {
    id: string;
    agentId: string;
    phoneNumber: string;
    status: XAIPhoneBinding["status"];
    twilioPhoneNumberSid: string | null;
    twilioSipTrunkSid: string | null;
    xaiPhoneNumberId: string | null;
    xaiWebhookId: string | null;
    webhookSecretLastFour: string | null;
    activatedAt: Date | null;
    updatedAt: Date;
    lastError: string | null;
  } | null;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Exact xAI BYO-trunk registration contract. */
export function buildXAIPhoneRegistrationBody(input: {
  phoneNumber: string;
  webhookUrl: string;
  allowedAddresses: string[];
}) {
  return {
    origin: "byo_trunk" as const,
    name: `Wireline · ${input.phoneNumber}`,
    phone_number: input.phoneNumber,
    webhook: {
      name: `Wireline voice · ${input.phoneNumber}`,
      url: input.webhookUrl,
    },
    sip_auth: {
      allowed_addresses: [...input.allowedAddresses],
    },
  };
}

export function parseXAIPhoneRegistrationPayload(
  payload: XAIPhoneRegistrationPayload,
): XAIPhoneRegistrationResult {
  const xaiPhoneNumberId =
    stringField(payload.phone_number?.phone_number_id) || stringField(payload.phone_number_id);
  const xaiWebhookId =
    stringField(payload.webhook?.webhook_id) ||
    stringField(payload.phone_number?.webhook_id) ||
    stringField(payload.webhook_id);
  const dispatchSigningSecret =
    stringField(payload.webhook?.dispatch_signing_secret) ||
    stringField(payload.dispatch_signing_secret);

  if (!xaiPhoneNumberId || !xaiWebhookId || !dispatchSigningSecret) {
    throw new Error(XAI_OUTCOME_AMBIGUOUS);
  }
  return { xaiPhoneNumberId, xaiWebhookId, dispatchSigningSecret };
}

export function isAmbiguousXAIRegistrationStatus(status: number): boolean {
  // These statuses and all provider/server failures may have occurred after the
  // number was created but before the response reached Wireline. Retrying a
  // non-idempotent registration could create a second webhook/secret pair.
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function completeBinding(binding: XAIPhoneBinding): boolean {
  return Boolean(
    binding.status === "active" &&
      binding.twilioPhoneNumberSid &&
      binding.twilioSipTrunkSid &&
      binding.xaiPhoneNumberId &&
      binding.xaiWebhookId &&
      binding.webhookSecretEncrypted,
  );
}

function publicActivationError(code: string | null): string | null {
  if (!code) return null;
  if (code === XAI_OUTCOME_AMBIGUOUS) {
    return "Activation state requires operator reconciliation before this line can be retried.";
  }
  return "Activation did not complete. The platform configuration must be repaired before retrying.";
}

function publicBinding(binding: XAIPhoneBinding): NonNullable<NativeXAIPhoneStatus["binding"]> {
  return {
    id: binding.id,
    agentId: binding.agentId,
    phoneNumber: binding.phoneNumber,
    status: binding.status,
    twilioPhoneNumberSid: binding.twilioPhoneNumberSid,
    twilioSipTrunkSid: binding.twilioSipTrunkSid,
    xaiPhoneNumberId: binding.xaiPhoneNumberId,
    xaiWebhookId: binding.xaiWebhookId,
    webhookSecretLastFour: binding.webhookSecretLastFour,
    activatedAt: binding.activatedAt,
    updatedAt: binding.updatedAt,
    lastError: publicActivationError(binding.lastError),
  };
}

function nativePhoneConfigurationReady(): boolean {
  if (!process.env.XAI_API_KEY?.trim() || !getTwilioClient() || !isVaultConfigured()) return false;
  try {
    resolveXAISipAllowedAddresses();
    return true;
  } catch {
    return false;
  }
}

async function claimProvisioning(input: {
  userId: string;
  agentId: string;
  phoneNumber: string;
}): Promise<ProvisioningClaim> {
  return drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-phone:${input.phoneNumber}`}))`,
    );

    const [existing] = await tx
      .select()
      .from(xaiPhoneBindings)
      .where(
        and(
          eq(xaiPhoneBindings.userId, input.userId),
          eq(xaiPhoneBindings.phoneNumber, input.phoneNumber),
        ),
      )
      .limit(1);

    if (existing && completeBinding(existing)) {
      return { binding: existing, token: null, reused: true };
    }
    if (existing?.lastError === XAI_OUTCOME_AMBIGUOUS) {
      throw AppError.serviceUnavailable(
        "Phone activation cannot be retried until the provider registration is reconciled.",
      );
    }

    const now = new Date();
    if (
      existing?.status === "provisioning" &&
      existing.provisioningToken &&
      existing.provisioningClaimedAt &&
      now.getTime() - existing.provisioningClaimedAt.getTime() < PROVISIONING_CLAIM_TTL_MS
    ) {
      throw AppError.conflict("This phone line is already being activated.");
    }

    const token = randomUUID();
    if (existing) {
      const [claimed] = await tx
        .update(xaiPhoneBindings)
        .set({
          agentId: input.agentId,
          status: "provisioning",
          provisioningToken: token,
          provisioningClaimedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(
          and(eq(xaiPhoneBindings.id, existing.id), eq(xaiPhoneBindings.userId, input.userId)),
        )
        .returning();
      if (!claimed) throw AppError.conflict("This phone line could not be claimed for activation.");
      return { binding: claimed, token, reused: false };
    }

    const [created] = await tx
      .insert(xaiPhoneBindings)
      .values({
        userId: input.userId,
        agentId: input.agentId,
        phoneNumber: input.phoneNumber,
        status: "provisioning",
        provisioningToken: token,
        provisioningClaimedAt: now,
      })
      .returning();
    if (!created) throw AppError.internal("Phone activation claim could not be persisted.");
    return { binding: created, token, reused: false };
  });
}

async function updateClaim(
  userId: string,
  bindingId: string,
  token: string,
  patch: Partial<typeof xaiPhoneBindings.$inferInsert>,
): Promise<XAIPhoneBinding> {
  const [updated] = await drizzle
    .update(xaiPhoneBindings)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(xaiPhoneBindings.id, bindingId),
        eq(xaiPhoneBindings.userId, userId),
        eq(xaiPhoneBindings.provisioningToken, token),
      ),
    )
    .returning();
  if (!updated) throw AppError.conflict("The phone activation lease expired or was replaced.");
  return updated;
}

async function failClaim(input: {
  userId: string;
  bindingId: string;
  token: string;
  code: string;
}): Promise<void> {
  try {
    await updateClaim(input.userId, input.bindingId, input.token, {
      status: "error",
      provisioningToken: null,
      provisioningClaimedAt: null,
      lastError: input.code,
    });
  } catch (persistError) {
    log.error("Native phone activation failure state could not be persisted", {
      bindingId: input.bindingId,
      code: input.code,
      error: getErrorMessage(persistError),
    });
  }
}

async function resolveTwilioPhoneSid(phoneNumber: string, candidate?: string | null): Promise<string> {
  if (isTwilioPhoneNumberSid(candidate)) return candidate;
  const client = getTwilioClient() as any;
  if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");

  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 2 });
  const matches = rows.filter(
    (row: { sid?: unknown; phoneNumber?: unknown }) =>
      typeof row.sid === "string" && normalizeXAIPhoneNumber(row.phoneNumber) === phoneNumber,
  );
  if (matches.length !== 1) {
    throw AppError.conflict(
      matches.length > 1
        ? "Multiple carrier records match this phone line. Resolve the inventory before activation."
        : "This agent line is not owned by the configured carrier account.",
    );
  }
  return String(matches[0].sid);
}

async function ensureTwilioTrunk(): Promise<string> {
  const client = getTwilioClient() as any;
  if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");

  const configuredSid = String(process.env.TWILIO_XAI_SIP_TRUNK_SID || "").trim();
  let trunk: any = null;
  if (/^TK[a-f0-9]{32}$/i.test(configuredSid)) {
    trunk = await client.trunking.v1.trunks(configuredSid).fetch();
  } else {
    const trunks = await client.trunking.v1.trunks.list({ limit: 100 });
    trunk = trunks.find(
      (candidate: { friendlyName?: unknown }) =>
        candidate.friendlyName === XAI_TWILIO_TRUNK_FRIENDLY_NAME,
    );
    if (!trunk) {
      trunk = await client.trunking.v1.trunks.create({
        friendlyName: XAI_TWILIO_TRUNK_FRIENDLY_NAME,
        transferMode: "enable-all",
        secure: xaiSecureTrunkingEnabled(),
        disasterRecoveryMethod: "POST",
        disasterRecoveryUrl: twilioVoiceFallbackUrl(),
      });
    }
  }

  const trunkSid = String(trunk?.sid || "").trim();
  if (!/^TK[a-f0-9]{32}$/i.test(trunkSid)) {
    throw new Error("Carrier did not return a valid Elastic SIP trunk identifier.");
  }

  await client.trunking.v1.trunks(trunkSid).update({
    friendlyName: XAI_TWILIO_TRUNK_FRIENDLY_NAME,
    transferMode: "enable-all",
    secure: xaiSecureTrunkingEnabled(),
    disasterRecoveryMethod: "POST",
    disasterRecoveryUrl: twilioVoiceFallbackUrl(),
  });

  const originations = await client.trunking.v1.trunks(trunkSid).originationUrls.list({
    limit: 100,
  });
  const sipUrl = xaiSharedTwilioOriginationUri();
  if (!originations.some((row: { sipUrl?: unknown }) => String(row.sipUrl || "") === sipUrl)) {
    await client.trunking.v1.trunks(trunkSid).originationUrls.create({
      enabled: true,
      friendlyName: XAI_TWILIO_ORIGINATION_FRIENDLY_NAME,
      priority: 10,
      weight: 10,
      sipUrl,
    });
  }
  return trunkSid;
}

async function attachPhoneToTrunk(trunkSid: string, phoneNumberSid: string): Promise<void> {
  const client = getTwilioClient() as any;
  if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");
  const attached = await client.trunking.v1.trunks(trunkSid).phoneNumbers.list({ limit: 1_000 });
  if (
    attached.some(
      (row: { sid?: unknown; phoneNumberSid?: unknown }) =>
        row.sid === phoneNumberSid || row.phoneNumberSid === phoneNumberSid,
    )
  ) {
    return;
  }
  await client.trunking.v1.trunks(trunkSid).phoneNumbers.create({ phoneNumberSid });
}

async function registerPhoneWithXAI(phoneNumber: string): Promise<XAIPhoneRegistrationResult> {
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey) throw AppError.serviceUnavailable("Realtime voice is not configured.");

  let response: Response;
  try {
    response = await fetchWithTimeout(
      XAI_PHONE_NUMBERS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildXAIPhoneRegistrationBody({
            phoneNumber,
            webhookUrl: xaiVoiceWebhookUrl(),
            allowedAddresses: resolveXAISipAllowedAddresses(),
          }),
        ),
      },
      XAI_REGISTRATION_TIMEOUT_MS,
    );
  } catch (error) {
    const ambiguous = new Error(XAI_OUTCOME_AMBIGUOUS);
    (ambiguous as Error & { cause?: unknown }).cause = error;
    throw ambiguous;
  }

  const responseText = await response.text();
  if (!response.ok) {
    if (isAmbiguousXAIRegistrationStatus(response.status)) {
      throw new Error(XAI_OUTCOME_AMBIGUOUS);
    }
    // Response bodies may contain provider diagnostics, identifiers, or request
    // fragments. Status is sufficient for console correlation; never return or
    // log the body on this tenant-facing path.
    log.warn("Realtime voice phone registration rejected", { status: response.status });
    throw AppError.fromHttpStatus(
      response.status,
      "Phone activation was rejected by the realtime voice provider.",
    );
  }

  let payload: XAIPhoneRegistrationPayload;
  try {
    payload = JSON.parse(responseText) as XAIPhoneRegistrationPayload;
  } catch {
    throw new Error(XAI_OUTCOME_AMBIGUOUS);
  }
  return parseXAIPhoneRegistrationPayload(payload);
}

export async function getNativeXAIPhoneStatus(
  userId: string,
  agentId?: string,
): Promise<NativeXAIPhoneStatus> {
  const conditions = [eq(xaiPhoneBindings.userId, userId)];
  if (agentId) conditions.push(eq(xaiPhoneBindings.agentId, agentId));
  const [binding] = await drizzle
    .select()
    .from(xaiPhoneBindings)
    .where(and(...conditions))
    .orderBy(desc(xaiPhoneBindings.updatedAt))
    .limit(1);

  return {
    configured: nativePhoneConfigurationReady(),
    binding: binding ? publicBinding(binding) : null,
  };
}

export async function provisionNativeXAIPhone(input: {
  userId: string;
  agentId: string;
}): Promise<NativeXAIPhoneStatus> {
  if (!isVaultConfigured()) {
    throw AppError.serviceUnavailable("Encrypted provider-secret storage is not configured.");
  }
  if (!String(process.env.XAI_API_KEY || "").trim()) {
    throw AppError.serviceUnavailable("Realtime voice is not configured.");
  }
  if (!getTwilioClient()) throw AppError.serviceUnavailable("Twilio voice is not configured.");
  resolveXAISipAllowedAddresses();

  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
    .limit(1);
  if (!agent) throw AppError.notFound("Agent not found.");

  const line = await findAgentPhoneLine(input.userId, input.agentId);
  const phoneNumber = normalizeXAIPhoneNumber(line?.phoneNumber);
  if (!line || !phoneNumber) {
    throw AppError.conflict(
      "Provision a dedicated Twilio phone line for this agent before activating native voice.",
    );
  }

  const claim = await claimProvisioning({
    userId: input.userId,
    agentId: input.agentId,
    phoneNumber,
  });
  if (claim.reused) return { configured: true, binding: publicBinding(claim.binding) };
  if (!claim.token) throw AppError.internal("Phone activation lease is missing.");

  let binding = claim.binding;
  let unpersistedProviderRegistration = false;
  try {
    const phoneNumberSid = await resolveTwilioPhoneSid(phoneNumber, line.vapiNumberId);
    binding = await updateClaim(input.userId, binding.id, claim.token, {
      twilioPhoneNumberSid: phoneNumberSid,
    });

    const trunkSid = binding.twilioSipTrunkSid || (await ensureTwilioTrunk());
    await attachPhoneToTrunk(trunkSid, phoneNumberSid);
    binding = await updateClaim(input.userId, binding.id, claim.token, {
      twilioSipTrunkSid: trunkSid,
    });

    if (!binding.xaiPhoneNumberId || !binding.xaiWebhookId || !binding.webhookSecretEncrypted) {
      const registration = await registerPhoneWithXAI(phoneNumber);
      unpersistedProviderRegistration = true;
      const encryptedSecret = encryptSecret(registration.dispatchSigningSecret);
      binding = await updateClaim(input.userId, binding.id, claim.token, {
        xaiPhoneNumberId: registration.xaiPhoneNumberId,
        xaiWebhookId: registration.xaiWebhookId,
        webhookSecretEncrypted: encryptedSecret,
        webhookSecretLastFour: lastFour(registration.dispatchSigningSecret),
      });
      unpersistedProviderRegistration = false;
    }

    binding = await updateClaim(input.userId, binding.id, claim.token, {
      status: "active",
      provisioningToken: null,
      provisioningClaimedAt: null,
      lastError: null,
      activatedAt: binding.activatedAt || new Date(),
    });

    log.info("Native Twilio + xAI phone binding activated", {
      userId: input.userId,
      agentId: input.agentId,
      bindingId: binding.id,
      phoneSuffix: phoneNumber.slice(-4),
      trunkSidSuffix: String(binding.twilioSipTrunkSid || "").slice(-6),
    });
    return { configured: true, binding: publicBinding(binding) };
  } catch (error) {
    const ambiguous =
      unpersistedProviderRegistration || getErrorMessage(error) === XAI_OUTCOME_AMBIGUOUS;
    const code = ambiguous ? XAI_OUTCOME_AMBIGUOUS : XAI_ACTIVATION_FAILED;
    await failClaim({
      userId: input.userId,
      bindingId: binding.id,
      token: claim.token,
      code,
    });

    if (error instanceof AppError) throw error;
    if (ambiguous) {
      log.error("Phone registration outcome is ambiguous; automatic retry is blocked", {
        userId: input.userId,
        agentId: input.agentId,
        bindingId: binding.id,
      });
      throw AppError.serviceUnavailable(
        "Phone activation could not be confirmed. Automatic retry is blocked until provider state is reconciled.",
      );
    }
    log.error("Native Twilio + xAI phone activation failed", {
      userId: input.userId,
      agentId: input.agentId,
      bindingId: binding.id,
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable("Native phone activation failed.");
  }
}
