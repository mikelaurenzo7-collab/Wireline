/**
 * Native inbound PSTN must keep the same cost and solvency posture as the
 * retired Vapi assistant-request gates: answer the line, but degrade overflow
 * and insolvency to a bounded take-a-message conversation instead of the full
 * agent. Outbound is already admission-gated before Twilio dials.
 *
 * Fail-open on wallet/quota lookup errors so a database blip does not mute a
 * paying tenant. Callers are never hung up on for billing except a suspended
 * subscription, which speaks one truthful line and ends.
 */
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  isWithinBusinessHours,
  type AgentRuntimeProfile,
} from "../agent-runtime";
import { inboundConcurrencyExceeded } from "../inbound-concurrency";
import { drizzle, log, quotaTracker } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { getVoiceWalletSnapshot } from "../voice-wallet-guard";

export const INBOUND_TAKE_MESSAGE_GRACE_USD = 5;

export type NativeInboundAdmissionMode = "full" | "suspended" | "take_message";

export type NativeInboundAdmission = {
  mode: NativeInboundAdmissionMode;
  reason?: "subscription" | "completion_grace" | "concurrency" | "daily_minutes" | "after_hours";
  greeting?: string;
};

export async function resolveNativeInboundAdmission(
  userId: string,
  agentId?: string,
): Promise<NativeInboundAdmission> {
  try {
    const [settings] = await drizzle
      .select({ subscriptionStatus: schema.settings.subscriptionStatus })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);
    if (settings?.subscriptionStatus !== "active") {
      return { mode: "suspended", reason: "subscription" };
    }
  } catch (error) {
    log.error("Native inbound subscription check failed, continuing remaining gates", {
      userId,
      error: getErrorMessage(error),
    });
  }

  if (agentId) {
    try {
      const [agent] = await drizzle
        .select({
          businessHours: schema.agents.businessHours,
          timezone: schema.agents.timezone,
          outOfHoursMessage: schema.agents.outOfHoursMessage,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.userId, userId), eq(schema.agents.id, agentId)))
        .limit(1);
      if (
        agent &&
        !isWithinBusinessHours({
          business_hours: agent.businessHours as AgentRuntimeProfile["business_hours"],
          timezone: agent.timezone,
        })
      ) {
        return {
          mode: "take_message",
          reason: "after_hours",
          greeting: agent.outOfHoursMessage?.trim() || undefined,
        };
      }
    } catch (error) {
      log.warn("Native inbound after-hours lookup failed, admitting remaining gates", {
        userId,
        agentId,
        error: getErrorMessage(error),
      });
    }
  }

  try {
    const wallet = await getVoiceWalletSnapshot(userId);
    if (wallet.completion_grace_due_usd >= INBOUND_TAKE_MESSAGE_GRACE_USD) {
      return { mode: "take_message", reason: "completion_grace" };
    }
  } catch (error) {
    log.error("Native inbound wallet check failed, admitting full agent", {
      userId,
      error: getErrorMessage(error),
    });
  }

  if (await inboundConcurrencyExceeded(userId)) {
    return { mode: "take_message", reason: "concurrency" };
  }

  try {
    const dailyDecision = await quotaTracker.checkAndIncrement(
      userId,
      "voice_minutes_daily",
      0,
    );
    if (dailyDecision && !dailyDecision.allowed) {
      return { mode: "take_message", reason: "daily_minutes" };
    }
  } catch (error) {
    log.error("Native inbound daily-minute check failed, admitting full agent", {
      userId,
      error: getErrorMessage(error),
    });
  }

  return { mode: "full" };
}
