import { and, eq, isNull, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { liveExternalActionPolicyForUser } from "../account-environment-policy";
import { AppError } from "../api-error";
import { ensureTenantTelecomDefaults, findAgentPhoneLine } from "../agent-phone-lines";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { getIncludedPhoneLineSlots } from "../phone-line-entitlements";
import {
  clearNativeTwilioPurchaseClaim,
  NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS,
} from "../orphan-carrier-ledger";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import {
  NATIVE_PROVISIONING_UNAVAILABLE,
  configureNativeNumberRouting,
  purchaseNativeNumber,
  releasePurchasedNativeNumber,
  type PurchasedNativeNumber,
} from "./native-phone-carrier";
import { openAISipConfigured } from "./openai-sip-config";

const NATIVE_ACTIVATION_PENDING =
  "The number is reserved in your workspace, but live-call routing could not be confirmed. Retry activation from Phone; do not purchase another line.";

export type NativePhoneProvisionResult = {
  ok: boolean;
  phoneNumber?: string;
  carrierNumberId?: string;
  reused?: boolean;
  activationPending?: boolean;
  error?: string;
  code?: string;
};

type PersistOutcome =
  | { kind: "inserted"; line: typeof schema.phoneNumbers.$inferSelect }
  | { kind: "existing_agent"; line: typeof schema.phoneNumbers.$inferSelect }
  | { kind: "capacity" };

function autoProvisioningEnabled(): boolean {
  const flag = String(process.env.WIRELINE_AUTO_PROVISION_NUMBERS || "")
    .trim()
    .toLowerCase();
  if (["false", "0", "off"].includes(flag)) return false;
  if (["true", "1", "on"].includes(flag)) return true;
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function assertNativeActivationConfigured(): void {
  if (!openAISipConfigured()) {
    throw AppError.serviceUnavailable("OpenAI Realtime SIP is not configured.");
  }
}

async function persistPurchasedNumber(input: {
  userId: string;
  agentId?: string;
  campaignLabel?: string;
  phoneSlots: number;
  purchase: PurchasedNativeNumber;
}): Promise<PersistOutcome> {
  return runCompanyIdentityMutation(input.userId, "phone_number_changed", async (tx) => {
    if (input.agentId) {
      const [existing] = await tx
        .select()
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, input.userId),
            eq(schema.phoneNumbers.agentId, input.agentId),
          ),
        )
        .limit(1);
      if (existing) return { kind: "existing_agent" as const, line: existing };
    }

    const [{ held }] = await tx
      .select({ held: sql<number>`count(*)` })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, input.userId));
    if (Number(held || 0) >= input.phoneSlots) return { kind: "capacity" as const };

    const [line] = await tx
      .insert(schema.phoneNumbers)
      .values({
        userId: input.userId,
        phoneNumber: input.purchase.phoneNumber,
        // Transitional column name; native rows deliberately store the Twilio PN SID.
        vapiNumberId: input.purchase.sid,
        agentId: input.agentId ?? null,
        campaignLabel: input.campaignLabel ?? "twilio-openai-realtime",
      })
      .returning();
    if (!line) throw new Error("Native phone ownership row was not persisted.");
    return { kind: "inserted" as const, line };
  });
}

async function activateLine(input: {
  userId: string;
  agentId: string;
  lineId: bigint;
  phoneNumber: string;
  carrierNumberId: string | null;
  reused: boolean;
}): Promise<NativePhoneProvisionResult> {
  try {
    const carrierNumberId = await configureNativeNumberRouting({
      userId: input.userId,
      phoneNumber: input.phoneNumber,
      carrierNumberId: input.carrierNumberId,
    });
    if (carrierNumberId !== input.carrierNumberId) {
      await drizzle
        .update(schema.phoneNumbers)
        .set({ vapiNumberId: carrierNumberId })
        .where(
          and(
            eq(schema.phoneNumbers.id, input.lineId),
            eq(schema.phoneNumbers.userId, input.userId),
          ),
        );
    }
    return {
      ok: true,
      phoneNumber: input.phoneNumber,
      carrierNumberId,
      reused: input.reused,
    };
  } catch (error) {
    log.error("Twilio line exists but OpenAI routing could not be confirmed", {
      userId: input.userId,
      agentId: input.agentId,
      phoneSuffix: input.phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      phoneNumber: input.phoneNumber,
      carrierNumberId: input.carrierNumberId || undefined,
      reused: input.reused,
      activationPending: true,
      code: "NATIVE_VOICE_ACTIVATION_PENDING",
      error: NATIVE_ACTIVATION_PENDING,
    };
  }
}

async function provisionNativeTenantNumberUnfenced(input: {
  userId: string;
  agentId?: string;
  areaCode?: string;
  preferredPhoneNumber?: string;
  campaignLabel?: string;
}): Promise<NativePhoneProvisionResult> {
  if (!autoProvisioningEnabled()) {
    return {
      ok: false,
      code: "PHONE_PROVISIONING_DISABLED",
      error: NATIVE_PROVISIONING_UNAVAILABLE,
    };
  }
  if (!getTwilioClient()) {
    return { ok: false, code: "TWILIO_NOT_CONFIGURED", error: NATIVE_PROVISIONING_UNAVAILABLE };
  }
  try {
    assertNativeActivationConfigured();
  } catch (error) {
    log.error("Native phone provisioning blocked because OpenAI Realtime SIP is not configured", {
      userId: input.userId,
      agentId: input.agentId ?? null,
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      code: "PHONE_RUNTIME_NOT_CONFIGURED",
      error:
        "Phone activation is temporarily unavailable because live-call routing is not configured. No number was purchased.",
    };
  }

  if (input.agentId) {
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1);
    if (!agent) return { ok: false, code: "NOT_FOUND", error: "Agent not found." };
    const existingLine = await findAgentPhoneLine(input.userId, input.agentId);
    if (existingLine) {
      return activateLine({
        userId: input.userId,
        agentId: input.agentId,
        lineId: existingLine.id,
        phoneNumber: existingLine.phoneNumber,
        carrierNumberId: existingLine.carrierNumberId,
        reused: true,
      });
    }
  }

  const phoneSlots = await getIncludedPhoneLineSlots(input.userId);
  const [{ held }] = await drizzle
    .select({ held: sql<number>`count(*)` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, input.userId));
  const atCapacity = Number(held || 0) >= phoneSlots;
  if (input.agentId && (atCapacity || (!input.areaCode && !input.preferredPhoneNumber))) {
    const agentId = input.agentId;
    // Automatic identity setup should use a number already owned by the tenant
    // before adding recurring carrier cost. Serialize both the Bot recheck and
    // the detached-line claim so concurrent setup requests cannot attach two
    // existing lines to the same Bot.
    const claimed = await runCompanyIdentityMutation<
      typeof schema.phoneNumbers.$inferSelect | null
    >(input.userId, "phone_number_changed", async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, input.userId),
            eq(schema.phoneNumbers.agentId, agentId),
          ),
        )
        .limit(1);
      if (existing) return existing;

      const [reusable] = await tx
        .select()
        .from(schema.phoneNumbers)
        .where(
          and(eq(schema.phoneNumbers.userId, input.userId), isNull(schema.phoneNumbers.agentId)),
        )
        .limit(1);
      if (!reusable) return null;

      const [row] = await tx
        .update(schema.phoneNumbers)
        .set({ agentId })
        .where(
          and(
            eq(schema.phoneNumbers.id, reusable.id),
            eq(schema.phoneNumbers.userId, input.userId),
            isNull(schema.phoneNumbers.agentId),
          ),
        )
        .returning();
      return row ?? null;
    });
    if (claimed) {
      return activateLine({
        userId: input.userId,
        agentId: input.agentId,
        lineId: claimed.id,
        phoneNumber: claimed.phoneNumber,
        carrierNumberId: claimed.vapiNumberId,
        reused: true,
      });
    }
  }
  if (atCapacity) {
    return {
      ok: false,
      code: "PHONE_CAPACITY_REACHED",
      error: `Your plan includes ${phoneSlots} dedicated line${phoneSlots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
    };
  }

  let purchase: PurchasedNativeNumber;
  try {
    purchase = await purchaseNativeNumber(input);
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, code: error.code, error: error.message };
    }
    return { ok: false, code: "PHONE_PURCHASE_FAILED", error: NATIVE_PROVISIONING_UNAVAILABLE };
  }

  let persisted: PersistOutcome;
  try {
    persisted = await persistPurchasedNumber({
      userId: input.userId,
      agentId: input.agentId,
      campaignLabel: input.campaignLabel,
      phoneSlots,
      purchase,
    });
  } catch (error) {
    await releasePurchasedNativeNumber({ userId: input.userId, purchase, cause: error });
    return {
      ok: false,
      code: "PHONE_PERSISTENCE_FAILED",
      error:
        "The number could not be saved, so its carrier allocation was released or queued for cleanup.",
    };
  }

  if (persisted.kind !== "inserted") {
    await releasePurchasedNativeNumber({
      userId: input.userId,
      purchase,
      cause: persisted.kind === "capacity" ? "PHONE_CAPACITY_RACE" : "AGENT_ALREADY_PROVISIONED",
    });
    if (persisted.kind === "capacity") {
      return {
        ok: false,
        code: "PHONE_CAPACITY_REACHED",
        error: `Your plan includes ${phoneSlots} dedicated line${phoneSlots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
      };
    }
    if (input.agentId) {
      return activateLine({
        userId: input.userId,
        agentId: input.agentId,
        lineId: persisted.line.id,
        phoneNumber: persisted.line.phoneNumber,
        carrierNumberId: persisted.line.vapiNumberId,
        reused: true,
      });
    }
  }

  try {
    // Only canonical ownership or confirmed carrier removal may retire the
    // pre-provider claim. If this write fails, raise rather than invite a
    // duplicate purchase; the canonical row lets reconciliation settle safely.
    await clearNativeTwilioPurchaseClaim(purchase.claim);
  } catch (error) {
    log.error("Native phone ownership persisted but its purchase claim could not be cleared", {
      userId: input.userId,
      operationId: purchase.claim.operationId,
      phoneSuffix: purchase.phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
    throw AppError.serviceUnavailable(NATIVE_PROVISIONING_UNAVAILABLE);
  }

  await ensureTenantTelecomDefaults(input.userId, {
    phoneNumberE164: purchase.phoneNumber,
    smsCapable: true,
  });

  if (!input.agentId) {
    return {
      ok: true,
      phoneNumber: purchase.phoneNumber,
      carrierNumberId: purchase.sid,
      reused: false,
    };
  }
  return activateLine({
    userId: input.userId,
    agentId: input.agentId,
    lineId: persisted.line.id,
    phoneNumber: purchase.phoneNumber,
    carrierNumberId: purchase.sid,
    reused: false,
  });
}

export async function provisionNativeTenantNumber(input: {
  userId: string;
  agentId?: string;
  areaCode?: string;
  preferredPhoneNumber?: string;
  campaignLabel?: string;
}): Promise<NativePhoneProvisionResult> {
  const environmentPolicy = await liveExternalActionPolicyForUser(input.userId);
  if (!environmentPolicy.allowed) {
    log.warn("Native phone provisioning blocked by account environment", {
      userId: input.userId,
      accountEnvironment: environmentPolicy.environment ?? "missing",
      code: environmentPolicy.code,
    });
    return {
      ok: false,
      code: environmentPolicy.code,
      error: environmentPolicy.message,
    };
  }
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "native_phone_provision",
    ttlMs: NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS,
    perform: () => provisionNativeTenantNumberUnfenced(input),
  });
  return outcome.performed
    ? outcome.result
    : {
        ok: false,
        code: "ACCOUNT_DELETION_PENDING",
        error: "Phone provisioning is unavailable while terminal account deletion is in progress.",
      };
}
