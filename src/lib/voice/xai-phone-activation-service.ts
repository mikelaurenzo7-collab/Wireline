import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { xaiPhoneBindings } from "../../db/xai-voice-schema";
import { AppError } from "../api-error";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import { isAmbiguousTwilioPhoneMutationError } from "./native-phone-carrier";
import { normalizeXAIPhoneNumber } from "./xai-sip-config";
import {
  XAI_OUTCOME_AMBIGUOUS,
  getNativeXAIPhoneStatus,
  provisionNativeXAIPhone as provisionNativeXAIPhoneLowLevel,
  type NativeXAIPhoneStatus,
} from "./xai-sip-provisioning";

export { getNativeXAIPhoneStatus };
export type { NativeXAIPhoneStatus };

const XAI_DEACTIVATION_FAILED = "XAI_PHONE_DEACTIVATION_FAILED";
const XAI_DEACTIVATION_OUTCOME_AMBIGUOUS =
  "XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS";

type DeactivationClaimRow = {
  binding_id: string;
  claim_token: string;
  twilio_phone_number_sid: string | null;
  twilio_sip_trunk_sid: string | null;
  prior_last_error: string | null;
};

type DeactivationClaim = {
  bindingId: string;
  token: string;
  twilioPhoneNumberSid: string | null;
  twilioSipTrunkSid: string | null;
  priorLastError: string | null;
};

function twilioStatus(error: unknown): number | null {
  const status = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

async function claimDeactivation(input: {
  userId: string;
  phoneNumber: string;
}): Promise<DeactivationClaim | null> {
  const token = randomUUID();
  try {
    return await drizzle.transaction(async (tx) => {
      const result = (await tx.execute(sql`
        SELECT
          binding_id,
          claim_token,
          twilio_phone_number_sid,
          twilio_sip_trunk_sid,
          prior_last_error
        FROM public.wireline_claim_xai_phone_deactivation(
          ${input.userId}::uuid,
          ${input.phoneNumber},
          ${token}::uuid
        )
      `)) as unknown as { rows?: DeactivationClaimRow[] };
      const row = result.rows?.[0];
      if (!row) return null;
      if (!row.binding_id || row.claim_token !== token) {
        throw AppError.conflict("The native phone deactivation lease was replaced.");
      }
      return {
        bindingId: row.binding_id,
        token,
        twilioPhoneNumberSid: row.twilio_phone_number_sid,
        twilioSipTrunkSid: row.twilio_sip_trunk_sid,
        priorLastError: row.prior_last_error,
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = getErrorMessage(error);
    if (message.includes("XAI_PHONE_ALREADY_PROVISIONING")) {
      throw AppError.conflict(
        "This phone line is currently changing routing. Retry after that operation finishes.",
      );
    }
    if (message.includes("XAI_PHONE_OWNED_BY_ANOTHER_TENANT")) {
      throw AppError.conflict("This phone registration is active in another workspace.");
    }
    if (message.includes("XAI_PHONE_OWNERSHIP_MISMATCH")) {
      throw AppError.conflict("This phone line is no longer owned by this workspace.");
    }
    if (message.includes("XAI_PHONE_TENANT_MISMATCH")) {
      throw AppError.fromHttpStatus(403, "The phone operation is not bound to this workspace.");
    }
    if (message.includes("XAI_PHONE_INVALID_CLAIM")) {
      throw AppError.badRequest("The native phone deactivation claim is invalid.");
    }
    throw error;
  }
}

async function settleDeactivation(
  userId: string,
  claim: DeactivationClaim,
  patch: Partial<typeof xaiPhoneBindings.$inferInsert>,
) {
  const [updated] = await drizzle
    .update(xaiPhoneBindings)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(xaiPhoneBindings.id, claim.bindingId),
        eq(xaiPhoneBindings.userId, userId),
        eq(xaiPhoneBindings.provisioningToken, claim.token),
      ),
    )
    .returning({ id: xaiPhoneBindings.id });
  if (!updated) {
    throw AppError.conflict("The native phone deactivation lease expired or was replaced.");
  }
}

/**
 * Detach a line from the native SIP trunk before it becomes unassigned. xAI's
 * public Direct SIP API documents registration but no deletion endpoint, so the
 * durable registration is retained as `retired` and can be reactivated without
 * inventing an unsupported provider operation or losing its one-time secret.
 *
 * The database claim uses the same E.164 advisory lock as activation. Release
 * and reassignment therefore cannot cross an in-flight Twilio/xAI operation,
 * and an ambiguous detach remains blocked from automatic reuse until a later
 * deactivation pass or an operator reconciles provider state.
 */
export async function deactivateNativeXAIPhoneLine(input: {
  userId: string;
  phoneNumber: string;
}): Promise<void> {
  const phoneNumber = normalizeXAIPhoneNumber(input.phoneNumber);
  if (!phoneNumber) throw AppError.badRequest("A valid phone line is required.");

  const claim = await claimDeactivation({ userId: input.userId, phoneNumber });
  if (!claim) return;

  let providerMutationAttempted = false;
  try {
    if (claim.twilioSipTrunkSid && claim.twilioPhoneNumberSid) {
      const client = getTwilioClient();
      if (!client) throw AppError.serviceUnavailable("Twilio voice is not configured.");
      const trunk = client.trunking.v1.trunks(claim.twilioSipTrunkSid);
      const attached = await trunk.phoneNumbers.list({ limit: 1_000 });
      const association = attached.find(
        (row) =>
          row.sid === claim.twilioPhoneNumberSid ||
          row.phoneNumberSid === claim.twilioPhoneNumberSid,
      );
      const associationSid = String(association?.sid || claim.twilioPhoneNumberSid).trim();
      if (association && associationSid) {
        providerMutationAttempted = true;
        try {
          await trunk.phoneNumbers(associationSid).remove();
        } catch (error) {
          if (twilioStatus(error) !== 404) throw error;
        }
      }
    }

    await settleDeactivation(input.userId, claim, {
      status: "retired",
      provisioningToken: null,
      provisioningClaimedAt: null,
      // A registration whose one-time xAI result was ambiguous may be detached
      // from Twilio, but it must never become automatically reusable.
      lastError: claim.priorLastError === XAI_OUTCOME_AMBIGUOUS ? XAI_OUTCOME_AMBIGUOUS : null,
    });

    log.info("Native Twilio routing detached and registration retired", {
      userId: input.userId,
      bindingId: claim.bindingId,
      phoneSuffix: phoneNumber.slice(-4),
    });
  } catch (error) {
    const ambiguous = providerMutationAttempted && isAmbiguousTwilioPhoneMutationError(error);
    const failureCode =
      claim.priorLastError === XAI_OUTCOME_AMBIGUOUS
        ? XAI_OUTCOME_AMBIGUOUS
        : ambiguous
          ? XAI_DEACTIVATION_OUTCOME_AMBIGUOUS
          : XAI_DEACTIVATION_FAILED;

    try {
      await settleDeactivation(input.userId, claim, {
        status: "error",
        provisioningToken: null,
        provisioningClaimedAt: null,
        lastError: failureCode,
      });
    } catch (persistError) {
      log.error("Native phone deactivation failure state could not be persisted", {
        userId: input.userId,
        bindingId: claim.bindingId,
        priorState: claim.priorLastError,
        error: getErrorMessage(persistError),
      });
    }

    log.error("Native Twilio routing could not be safely detached", {
      userId: input.userId,
      bindingId: claim.bindingId,
      phoneSuffix: phoneNumber.slice(-4),
      ambiguous,
      error: getErrorMessage(error),
    });
    if (error instanceof AppError) throw error;
    throw AppError.serviceUnavailable(
      ambiguous
        ? "The carrier detach outcome is uncertain. Automatic reuse is blocked until provider state is reconciled."
        : "The phone line could not be detached from native voice. No local ownership change was committed.",
    );
  }
}

/**
 * The low-level provisioner owns the complete lease: Twilio trunk verification,
 * phone attachment, xAI registration, and final activation all finish before
 * status returns to active. No provider-side repair runs after the lease closes.
 */
export async function provisionNativeXAIPhone(input: {
  userId: string;
  agentId: string;
}): Promise<NativeXAIPhoneStatus> {
  try {
    return await provisionNativeXAIPhoneLowLevel(input);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("XAI_PHONE_DEACTIVATION_UNRESOLVED")) {
      throw AppError.serviceUnavailable(
        "Phone activation is blocked until the previous carrier detach is reconciled.",
      );
    }
    throw error;
  }
}
