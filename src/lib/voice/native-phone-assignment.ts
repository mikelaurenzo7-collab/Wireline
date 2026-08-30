import { and, eq, isNull } from "drizzle-orm";

import * as schema from "../../db/schema";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";
import { AppError } from "../api-error";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { drizzle } from "../server-context";
import {
  isSavedRuntimeReviewRequired,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
} from "../runtime-template-personality";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { openAISipConfigured } from "./openai-sip-config";

export type OpenAIRealtimeLineStatus = {
  provider: "openai_realtime";
  status: "active";
};

export type NativePhoneAssignmentResult = {
  line: typeof schema.phoneNumbers.$inferSelect;
  nativeVoice: OpenAIRealtimeLineStatus | null;
};

function assertOpenAIRealtimeConfigured(): void {
  if (!openAISipConfigured()) {
    throw AppError.serviceUnavailable("OpenAI Realtime SIP is not configured.");
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
    assertOpenAIRealtimeConfigured();
  }

  const currentAgentPredicate = current.agentId
    ? eq(schema.phoneNumbers.agentId, current.agentId)
    : isNull(schema.phoneNumbers.agentId);
  const [updated] = await runCompanyIdentityMutation(
    input.userId,
    "phone_number_changed",
    (tx) =>
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

  return {
    line: updated,
    nativeVoice: updated.agentId
      ? { provider: "openai_realtime", status: "active" }
      : null,
  };
}

/**
 * Assignment is now a single authoritative database mutation. Every Twilio
 * number points at the same BotBound inbound webhook, and the signed OpenAI
 * incoming-call event resolves the current Bot at call time; no per-Bot
 * provider registration or rollback window remains.
 */
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
