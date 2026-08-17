import { and, eq, isNull, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { ensureTenantTelecomDefaults, findAgentPhoneLine } from "../agent-phone-lines";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { getIncludedPhoneLineSlots } from "../phone-line-entitlements";
import { isVaultConfigured } from "../secret-vault";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getTwilioClient } from "../twilio-service";
import {
  NATIVE_PROVISIONING_UNAVAILABLE,
  purchaseNativeNumber,
  releasePurchasedNativeNumber,
  type PurchasedNativeNumber,
} from "./native-phone-carrier";
import { provisionNativeXAIPhone } from "./xai-phone-activation-service";
import { resolveXAISipAllowedAddresses } from "./xai-sip-config";

const NATIVE_ACTIVATION_PENDING =
  "The number is reserved in your workspace, but native voice activation could not be confirmed. Retry activation from Phone; do not purchase another line.";

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
  if (!String(process.env.XAI_API_KEY || "").trim()) {
    throw AppError.serviceUnavailable("Native realtime voice is not configured.");
  }
  if (!isVaultConfigured()) {
    throw AppError.serviceUnavailable("Encrypted provider-secret storage is not configured.");
  }
  resolveXAISipAllowedAddresses();
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
        campaignLabel: input.campaignLabel ?? "native-twilio-xai",
      })
      .returning();
    if (!line) throw new Error("Native phone ownership row was not persisted.");
    return { kind: "inserted" as const, line };
  });
}

async function activateLine(input: {
  userId: string;
  agentId: string;
  phoneNumber: string;
  carrierNumberId: string | null;
  reused: boolean;
}): Promise<NativePhoneProvisionResult> {
  try {
    const status = await provisionNativeXAIPhone({
      userId: input.userId,
      agentId: input.agentId,
    });
    if (status.binding?.status !== "active") {
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
    return {
      ok: true,
      phoneNumber: input.phoneNumber,
      carrierNumberId: input.carrierNumberId || undefined,
      reused: input.reused,
    };
  } catch (error) {
    log.error("Native phone line exists but activation could not be confirmed", {
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

export async function provisionNativeTenantNumber(input: {
  userId: string;
  agentId?: string;
  areaCode?: string;
  preferredPhoneNumber?: string;
  campaignLabel?: string;
}): Promise<NativePhoneProvisionResult> {
  if (!autoProvisioningEnabled()) {
    return { ok: false, code: "PHONE_PROVISIONING_DISABLED", error: NATIVE_PROVISIONING_UNAVAILABLE };
  }
  if (!getTwilioClient()) {
    return { ok: false, code: "TWILIO_NOT_CONFIGURED", error: NATIVE_PROVISIONING_UNAVAILABLE };
  }

  if (input.agentId) {
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1);
    if (!agent) return { ok: false, code: "NOT_FOUND", error: "Agent not found." };
    try {
      assertNativeActivationConfigured();
    } catch (error) {
      return {
        ok: false,
        code: "NATIVE_VOICE_NOT_CONFIGURED",
        error: error instanceof Error ? error.message : NATIVE_PROVISIONING_UNAVAILABLE,
      };
    }

    const existingLine = await findAgentPhoneLine(input.userId, input.agentId);
    if (existingLine) {
      return activateLine({
        userId: input.userId,
        agentId: input.agentId,
        phoneNumber: existingLine.phoneNumber,
        carrierNumberId: existingLine.vapiNumberId,
        reused: true,
      });
    }
  }

  const phoneSlots = await getIncludedPhoneLineSlots(input.userId);
  const [{ held }] = await drizzle
    .select({ held: sql<number>`count(*)` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, input.userId));
  if (Number(held || 0) >= phoneSlots) {
    if (input.agentId) {
      const [reusable] = await drizzle
        .select()
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.userId, input.userId),
            isNull(schema.phoneNumbers.agentId),
          ),
        )
        .limit(1);
      if (reusable) {
        const [claimed] = await runCompanyIdentityMutation(
          input.userId,
          "phone_number_changed",
          (tx) =>
            tx
              .update(schema.phoneNumbers)
              .set({ agentId: input.agentId })
              .where(
                and(
                  eq(schema.phoneNumbers.id, reusable.id),
                  eq(schema.phoneNumbers.userId, input.userId),
                  isNull(schema.phoneNumbers.agentId),
                ),
              )
              .returning({ id: schema.phoneNumbers.id }),
        );
        if (claimed) {
          return activateLine({
            userId: input.userId,
            agentId: input.agentId,
            phoneNumber: reusable.phoneNumber,
            carrierNumberId: reusable.vapiNumberId,
            reused: true,
          });
        }
      }
    }
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
      error: "The number could not be saved, so its carrier allocation was released or queued for cleanup.",
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
        phoneNumber: persisted.line.phoneNumber,
        carrierNumberId: persisted.line.vapiNumberId,
        reused: true,
      });
    }
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
    phoneNumber: purchase.phoneNumber,
    carrierNumberId: purchase.sid,
    reused: false,
  });
}
