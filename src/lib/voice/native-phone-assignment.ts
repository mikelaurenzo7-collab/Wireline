import { and, eq, isNull } from "drizzle-orm";

import * as schema from "../../db/schema";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import { AppError } from "../api-error";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { isVaultConfigured } from "../secret-vault";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  isSavedRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
} from "../runtime-template-personality";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import {
  deactivateNativeXAIPhoneLine,
  provisionNativeXAIPhone,
  type NativeXAIPhoneStatus,
} from "./xai-phone-activation-service";
import { resolveXAISipAllowedAddresses } from "./xai-sip-config";

export type NativePhoneAssignmentResult = {
  line: typeof schema.phoneNumbers.$inferSelect;
  nativeVoice: NativeXAIPhoneStatus | null;
};

function assertNativeActivationConfigured(): void {
  if (!String(process.env.XAI_API_KEY || "").trim()) {
    throw AppError.serviceUnavailable("Native realtime voice is not configured.");
  }
  if (!isVaultConfigured()) {
    throw AppError.serviceUnavailable("Encrypted provider-secret storage is not configured.");
  }
  resolveXAISipAllowedAddresses();
}

async function restorePreviousRouting(input: {
  userId: string;
  previousAgentId: string | null;
  phoneNumber: string;
}): Promise<void> {
  try {
    if (input.previousAgentId) {
      await provisionNativeXAIPhone({ userId: input.userId, agentId: input.previousAgentId });
    } else {
      await deactivateNativeXAIPhoneLine({
        userId: input.userId,
        phoneNumber: input.phoneNumber,
      });
    }
  } catch (error) {
    log.error("Native phone assignment rollback could not restore provider routing", {
      userId: input.userId,
      previousAgentId: input.previousAgentId,
      phoneSuffix: input.phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
  }
}

async function assignNativePhoneLineUnfenced(input: {
  userId: string;
  lineId: bigint;
  agentId?: string | null;
  campaignLabel?: string;
}): Promise<NativePhoneAssignmentResult> {
  const [current] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(
      and(eq(schema.phoneNumbers.id, input.lineId), eq(schema.phoneNumbers.userId, input.userId)),
    )
    .limit(1);
  if (!current) throw AppError.notFound("Phone number not found");

  const changesAgent = input.agentId !== undefined && input.agentId !== current.agentId;
  if (typeof input.agentId === "string") {
    const [agent] = await drizzle
      .select({
        id: schema.agents.id,
        role: schema.agents.role,
        personality: schema.personality.content,
      })
      .from(schema.agents)
      .leftJoin(
        schema.personality,
        and(
          eq(schema.personality.agentId, schema.agents.id),
          eq(schema.personality.userId, schema.agents.userId),
        ),
      )
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1);
    if (!agent) throw AppError.notFound("Agent not found");
    if (isSavedRuntimeReviewRequired(agent.personality, agent.role)) {
      throw new AppError(409, "RUNTIME_REVIEW_REQUIRED", RUNTIME_REVIEW_REQUIRED_RESPONSE);
    }
    assertNativeActivationConfigured();
  }

  if (changesAgent) {
    // Detach SIP origination before mutating the assigned agent so inbound
    // PSTN uses the configured Twilio failover instead of the previous
    // agent's live session during the assignment window.
    await deactivateNativeXAIPhoneLine({
      userId: input.userId,
      phoneNumber: current.phoneNumber,
    });
  }

  const currentAgentPredicate = current.agentId
    ? eq(schema.phoneNumbers.agentId, current.agentId)
    : isNull(schema.phoneNumbers.agentId);
  let updated: typeof schema.phoneNumbers.$inferSelect;
  try {
    [updated] = await runCompanyIdentityMutation(input.userId, "phone_number_changed", (tx) =>
      tx
        .update(schema.phoneNumbers)
        .set({
          ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
          ...(input.campaignLabel !== undefined
            ? { campaignLabel: input.campaignLabel.trim() || null }
            : {}),
        })
        .where(
          and(
            eq(schema.phoneNumbers.id, input.lineId),
            eq(schema.phoneNumbers.userId, input.userId),
            currentAgentPredicate,
          ),
        )
        .returning(),
    );
    if (!updated) throw AppError.conflict("The phone assignment changed in another request.");
  } catch (error) {
    if (changesAgent) {
      await restorePreviousRouting({
        userId: input.userId,
        previousAgentId: current.agentId,
        phoneNumber: current.phoneNumber,
      });
    }
    throw error;
  }

  if (typeof updated.agentId === "string") {
    try {
      const nativeVoice = await provisionNativeXAIPhone({
        userId: input.userId,
        agentId: updated.agentId,
      });
      if (nativeVoice.binding?.status !== "active") {
        throw AppError.serviceUnavailable("Native phone activation did not reach an active state.");
      }
      return { line: updated, nativeVoice };
    } catch (error) {
      if (changesAgent) {
        await runCompanyIdentityMutation(input.userId, "phone_number_changed", (tx) =>
          tx
            .update(schema.phoneNumbers)
            .set({ agentId: current.agentId, campaignLabel: current.campaignLabel })
            .where(
              and(
                eq(schema.phoneNumbers.id, input.lineId),
                eq(schema.phoneNumbers.userId, input.userId),
                updated.agentId
                  ? eq(schema.phoneNumbers.agentId, updated.agentId)
                  : isNull(schema.phoneNumbers.agentId),
              ),
            ),
        ).catch((rollbackError) => {
          log.error("Native phone assignment database rollback failed", {
            userId: input.userId,
            lineId: String(input.lineId),
            error: getErrorMessage(rollbackError),
          });
        });
        await restorePreviousRouting({
          userId: input.userId,
          previousAgentId: current.agentId,
          phoneNumber: current.phoneNumber,
        });
      }
      if (error instanceof AppError) throw error;
      throw AppError.serviceUnavailable(
        "The line assignment was not committed because native voice activation could not be verified.",
      );
    }
  }

  return { line: updated, nativeVoice: null };
}

export async function assignNativePhoneLine(input: {
  userId: string;
  lineId: bigint;
  agentId?: string | null;
  campaignLabel?: string;
}): Promise<NativePhoneAssignmentResult> {
  await assertLiveExternalActionAllowed(input.userId, "native_phone_assignment");
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "native_phone_assignment",
    ttlMs: 20 * 60_000,
    perform: () => assignNativePhoneLineUnfenced(input),
  });
  if (!outcome.performed) {
    throw AppError.conflict(
      "This workspace has reached its account-deletion deadline. Phone assignment cannot start.",
    );
  }
  return outcome.result;
}
